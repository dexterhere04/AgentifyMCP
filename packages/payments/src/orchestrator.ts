import {
  moneyEquals,
  type CommerceProvider,
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

/**
 * Payment orchestration: start a payment against a checkout via a PaymentGateway
 * and reconcile the provider's webhook callback into a merchant order.
 *
 * The orchestrator never talks to a PSP-specific schema: it drives the generic
 * PaymentGateway and the merchant CommerceProvider. Idempotency is enforced per
 * payment id so duplicate callbacks never double-complete a checkout.
 */
export class PaymentOrchestrator {
  private readonly intents = new Map<string, PaymentIntent>();
  private readonly processedPayments = new Map<string, string>(); // paymentId -> orderId

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
   * Reconcile a provider webhook. Verifies the signature, parses the event,
   * matches the amount/currency of the intent and finalizes the merchant order
   * (idempotent per payment id).
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

    // idempotency: a payment we already reconciled returns its order
    const existingOrderId = this.processedPayments.get(event.paymentId);
    if (existingOrderId && this.provider.orders) {
      const existing = await this.provider.orders.get(existingOrderId);
      return existing;
    }

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

    if (!moneyEquals(event.amount, intent.amount)) {
      this.audit.record({
        event: "checkout.payment.amount_mismatch",
        merchant_id: this.merchantId,
        checkout_id: event.referenceId,
        payment_id: event.paymentId,
        amount: event.amount.amount,
        currency: event.amount.currency,
        details: { expected_amount: intent.amount.amount },
      });
      throw new PaymentError(
        "AMOUNT_MISMATCH",
        `payment amount ${event.amount.amount} ${event.amount.currency} does not match expected ${intent.amount.amount} ${intent.amount.currency}`,
      );
    }

    this.audit.record({
      event: "checkout.payment.received",
      merchant_id: this.merchantId,
      checkout_id: event.referenceId,
      payment_id: event.paymentId,
      agent: undefined,
      amount: event.amount.amount,
      currency: event.amount.currency,
      approval: { required: true, received: true },
    });

    const order = await this.provider.checkout!.complete(event.referenceId, {
      approval: { buyerApproved: true },
    });
    this.processedPayments.set(event.paymentId, order.id);
    this.audit.record({
      event: "checkout.completed",
      merchant_id: this.merchantId,
      checkout_id: event.referenceId,
      order_id: order.id,
      payment_id: event.paymentId,
      amount: event.amount.amount,
      currency: event.amount.currency,
      approval: { required: true, received: true },
    });
    return order;
  }
}
