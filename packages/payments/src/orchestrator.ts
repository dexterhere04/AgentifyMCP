import {
  moneyEquals,
  type CommerceProvider,
  type InAppPaymentIntent,
  type Money,
  type Order,
  type PaymentConfirmedEvent,
  type PaymentGateway,
  type PaymentIntent,
  ProviderError,
} from "@agentify/canonical-commerce";
import type { AuditStore } from "./audit.js";

export class PaymentError extends Error {
  constructor(
    readonly code:
      | "INVALID_SIGNATURE"
      | "AMOUNT_MISMATCH"
      | "CURRENCY_MISMATCH"
      | "NOT_FOUND"
      | "PAYMENT_NOT_PAID"
      | "PAYMENT_NOT_READY"
      | "UNSUPPORTED"
      | "ALREADY_PROCESSED"
      | "CHECKOUT_NOT_PAYABLE",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface StartPaymentContext {
  agent?: string;
}

interface PaymentConfirmation {
  /** Payment id when known (webhook); unknown when reconciling by polling. */
  paymentId?: string;
  amount: Money;
}

/**
 * Payment orchestration: start a payment against a checkout via a PaymentGateway
 * and reconcile a confirmation (webhook OR polling) into a merchant order.
 *
 * The orchestrator never talks to a PSP-specific schema: it drives the generic
 * PaymentGateway and the merchant CommerceProvider. Finalization is idempotent
 * across both reconcile paths (webhook + polling) so a checkout can never be
 * completed twice.
 */
export class PaymentOrchestrator {
  private readonly intents = new Map<string, PaymentIntent>();
  private readonly inApp = new Map<string, { checkoutId: string; amount: Money }>();
  private readonly processedPayments = new Map<string, string>(); // paymentId -> orderId
  private readonly finalizedCheckouts = new Map<string, Order>(); // checkoutId -> order

  constructor(
    private readonly provider: CommerceProvider,
    private readonly gateway: PaymentGateway,
    private readonly audit: AuditStore,
    private readonly merchantId: string,
  ) {}

  /** Create the PSP order + payment link for a checkout (buyer approval to follow). */
  async startPayment(checkoutId: string, ctx: StartPaymentContext = {}): Promise<PaymentIntent> {
    if (!this.provider.checkout) {
      throw new ProviderError("UNSUPPORTED_CAPABILITY", "merchant does not expose checkout");
    }
    const existing = this.intents.get(checkoutId);
    if (existing) return existing;

    const checkout = await this.provider.checkout.get(checkoutId);
    if (checkout.status === "completed" || checkout.status === "cancelled") {
      throw new PaymentError(
        "CHECKOUT_NOT_PAYABLE",
        `checkout "${checkoutId}" is ${checkout.status} and cannot be paid`,
      );
    }
    const total = checkout.totals?.total;
    if (!total || total.amount <= 0) {
      throw new PaymentError("CHECKOUT_NOT_PAYABLE", `checkout "${checkoutId}" has no payable total`);
    }

    const order = await this.gateway.createOrder({
      amount: total,
      receipt: checkoutId,
      description: `Checkout ${checkoutId}`,
      notes: { merchant_id: this.merchantId, agent: ctx.agent ?? "" },
    });
    this.audit.record({
      event: "checkout.payment.order.created",
      merchant_id: this.merchantId,
      checkout_id: checkoutId,
      agent: ctx.agent,
      amount: total.amount,
      currency: total.currency,
      approval: { required: true, received: false },
      details: { payment_order_id: order.id, provider: this.gateway.id },
    });

    const link = await this.gateway.createPaymentLink({
      amount: total,
      description: `Checkout ${checkoutId}`,
      referenceId: checkoutId,
    });
    this.audit.record({
      event: "checkout.payment_link.created",
      merchant_id: this.merchantId,
      checkout_id: checkoutId,
      agent: ctx.agent,
      amount: total.amount,
      currency: total.currency,
      approval: { required: true, received: false },
      details: { payment_link_id: link.id, provider: this.gateway.id },
    });

    const intent: PaymentIntent = {
      checkoutId,
      status: "payment_pending",
      provider: this.gateway.id,
      paymentOrderId: order.id,
      paymentLinkId: link.id,
      paymentUrl: link.shortUrl,
      amount: total,
    };
    this.intents.set(checkoutId, intent);
    return intent;
  }

  /**
   * Start an EMBEDDED (Checkout.js) payment: create the Razorpay order only (no
   * payment link). The host app renders Checkout with this order id; on success
   * the buyer's session posts payment_id + signature to verifyInAppPayment.
   */
  async startInAppCheckout(checkoutId: string, ctx: StartPaymentContext = {}): Promise<InAppPaymentIntent> {
    if (!this.provider.checkout) {
      throw new ProviderError("UNSUPPORTED_CAPABILITY", "merchant does not expose checkout");
    }
    const checkout = await this.provider.checkout.get(checkoutId);
    if (checkout.status === "completed" || checkout.status === "cancelled") {
      throw new PaymentError(
        "CHECKOUT_NOT_PAYABLE",
        `checkout "${checkoutId}" is ${checkout.status} and cannot be paid`,
      );
    }
    const total = checkout.totals?.total;
    if (!total || total.amount <= 0) {
      throw new PaymentError("CHECKOUT_NOT_PAYABLE", `checkout "${checkoutId}" has no payable total`);
    }
    const order = await this.gateway.createOrder({
      amount: total,
      receipt: checkoutId,
      description: `Checkout ${checkoutId}`,
      notes: { merchant_id: this.merchantId, agent: ctx.agent ?? "" },
    });
    this.audit.record({
      event: "checkout.payment.order.created",
      merchant_id: this.merchantId,
      checkout_id: checkoutId,
      agent: ctx.agent,
      amount: total.amount,
      currency: total.currency,
      approval: { required: true, received: false },
      details: { payment_order_id: order.id, provider: this.gateway.id, mode: "in_app" },
    });
    this.inApp.set(order.id, { checkoutId, amount: total });
    return {
      checkoutId,
      provider: this.gateway.id,
      paymentOrderId: order.id,
      amount: total,
    };
  }

  /** Verify a Razorpay Checkout.js callback and finalize the order (idempotent). */
  async verifyInAppPayment(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<Order> {
    const intent = this.inApp.get(input.orderId);
    if (!intent) {
      throw new PaymentError("NOT_FOUND", `no embedded payment session for order "${input.orderId}"`);
    }
    if (!this.gateway.verifyPaymentSignature) {
      throw new PaymentError("UNSUPPORTED", "gateway does not support embedded payment verification");
    }
    if (!this.gateway.verifyPaymentSignature(input)) {
      this.audit.record({
        event: "checkout.payment.webhook.invalid_signature",
        merchant_id: this.merchantId,
        checkout_id: intent.checkoutId,
        payment_id: input.paymentId,
      });
      throw new PaymentError("INVALID_SIGNATURE", "invalid Razorpay Checkout signature");
    }
    return this.finalize(intent.checkoutId, { paymentId: input.paymentId, amount: intent.amount });
  }

  /**
   * Reconcile a provider webhook. Verifies the signature, parses the event,
   * matches the amount/currency of the intent and finalizes the merchant order
   * (idempotent per checkout + payment id).
   */
  async handleWebhook(rawBody: string, signature: string | null): Promise<Order> {
    if (!signature || !this.gateway.verifyWebhookSignature(rawBody, signature)) {
      this.audit.record({ event: "checkout.payment.webhook.invalid_signature", merchant_id: this.merchantId });
      throw new PaymentError("INVALID_SIGNATURE", "invalid payment webhook signature");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new PaymentError("INVALID_SIGNATURE", "webhook body is not valid JSON");
    }
    const event: PaymentConfirmedEvent | null = this.gateway.parseWebhookEvent(payload);
    if (!event) {
      this.audit.record({ event: "checkout.payment.webhook.ignored", merchant_id: this.merchantId });
      throw new PaymentError("NOT_FOUND", "webhook payload did not match a payment event");
    }

    const intent = this.intents.get(event.referenceId);
    if (!intent) {
      this.audit.record({
        event: "checkout.payment.webhook.unknown_checkout",
        merchant_id: this.merchantId,
        checkout_id: event.referenceId,
        payment_id: event.paymentId,
      });
      throw new PaymentError("NOT_FOUND", `no pending payment for checkout "${event.referenceId}"`);
    }

    // idempotency across duplicate webhooks / already-polled checkouts
    const already = await this.existingOrderFor(intent.checkoutId, event.paymentId);
    if (already) return already;

    if (event.status !== "paid") {
      this.audit.record({
        event: "checkout.payment.webhook.not_paid",
        merchant_id: this.merchantId,
        checkout_id: event.referenceId,
        payment_id: event.paymentId,
        amount: event.amount.amount,
        currency: event.amount.currency,
      });
      throw new PaymentError("PAYMENT_NOT_PAID", `payment event status is "${event.status}"`);
    }

    this.assertAmountMatches(event.amount, intent.amount, intent.checkoutId, event.paymentId);

    return this.finalize(intent.checkoutId, { paymentId: event.paymentId, amount: event.amount });
  }

  /**
   * Reconcile by polling the payment order's live status (no webhook needed).
   * Returns the finalized order when the payment is confirmed, or throws
   * PAYMENT_NOT_READY while the buyer has not paid yet — callers should retry.
   */
  async reconcileByPolling(checkoutId: string): Promise<Order> {
    const intent = this.intents.get(checkoutId);
    if (!intent) {
      throw new PaymentError("NOT_FOUND", `no pending payment for checkout "${checkoutId}"`);
    }
    const existing = this.finalizedCheckouts.get(checkoutId);
    if (existing) return existing;

    if (!this.gateway.getOrderStatus && !this.gateway.getPaymentLinkStatus) {
      throw new PaymentError(
        "UNSUPPORTED",
        `gateway "${this.gateway.id}" does not support polling reconciliation`,
      );
    }
    // Prefer polling the PAYMENT LINK when supported: for hosted payment links
    // the buyer pays the link (whose internal order differs from any order the
    // gateway created), so the link is the reliable status source.
    const status = this.gateway.getPaymentLinkStatus
      ? await this.gateway.getPaymentLinkStatus(intent.paymentLinkId)
      : await this.gateway.getOrderStatus!(intent.paymentOrderId);
    if (status.status !== "paid") {
      throw new PaymentError("PAYMENT_NOT_READY", `payment order is "${status.status}"`);
    }
    if (status.amountPaid !== undefined && status.amountPaid !== intent.amount.amount) {
      this.audit.record({
        event: "checkout.payment.amount_mismatch",
        merchant_id: this.merchantId,
        checkout_id: checkoutId,
        amount: status.amountPaid,
        currency: intent.amount.currency,
        details: { expected_amount: intent.amount.amount },
      });
      throw new PaymentError(
        "AMOUNT_MISMATCH",
        `paid ${status.amountPaid} ${intent.amount.currency} does not match expected ${intent.amount.amount}`,
      );
    }

    return this.finalize(checkoutId, { amount: intent.amount });
  }

  private async existingOrderFor(checkoutId: string, paymentId?: string): Promise<Order | undefined> {
    const finalized = this.finalizedCheckouts.get(checkoutId);
    if (finalized) return finalized;
    if (paymentId) {
      const orderId = this.processedPayments.get(paymentId);
      if (orderId) {
        const order = this.finalizedCheckouts.get(checkoutId);
        if (order) return order;
        if (this.provider.orders) {
          try {
            return await this.provider.orders.get(orderId);
          } catch {
            // fall through to re-finalize
          }
        }
      }
    }
    return undefined;
  }

  private assertAmountMatches(actual: Money, expected: Money, checkoutId: string, paymentId?: string): void {
    if (moneyEquals(actual, expected)) return;
    this.audit.record({
      event: "checkout.payment.amount_mismatch",
      merchant_id: this.merchantId,
      checkout_id: checkoutId,
      payment_id: paymentId,
      amount: actual.amount,
      currency: actual.currency,
      details: { expected_amount: expected.amount },
    });
    throw new PaymentError(
      "AMOUNT_MISMATCH",
      `payment amount ${actual.amount} ${actual.currency} does not match expected ${expected.amount} ${expected.currency}`,
    );
  }

  /** Complete the merchant checkout for a confirmed payment, idempotently. */
  private async finalize(checkoutId: string, confirmation: PaymentConfirmation): Promise<Order> {
    const existing = this.finalizedCheckouts.get(checkoutId);
    if (existing) return existing;

    this.audit.record({
      event: "checkout.payment.received",
      merchant_id: this.merchantId,
      checkout_id: checkoutId,
      payment_id: confirmation.paymentId,
      amount: confirmation.amount.amount,
      currency: confirmation.amount.currency,
      approval: { required: true, received: true },
    });

    const order = await this.provider.checkout!.complete(checkoutId, {
      approval: { buyerApproved: true },
    });
    this.finalizedCheckouts.set(checkoutId, order);
    if (confirmation.paymentId) {
      this.processedPayments.set(confirmation.paymentId, order.id);
    }
    this.audit.record({
      event: "checkout.completed",
      merchant_id: this.merchantId,
      checkout_id: checkoutId,
      order_id: order.id,
      payment_id: confirmation.paymentId,
      amount: confirmation.amount.amount,
      currency: confirmation.amount.currency,
      approval: { required: true, received: true },
    });
    return order;
  }
}
