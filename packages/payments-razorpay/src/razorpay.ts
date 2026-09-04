import { createHmac } from "node:crypto";
import Razorpay from "razorpay";
import {
  type PaymentConfirmedEvent,
  type PaymentEventStatus,
  type PaymentGateway,
  type PaymentLink,
  type PaymentLinkRequest,
  type PaymentOrder,
  type PaymentOrderRequest,
  type PaymentOrderStatus,
} from "@agentify/canonical-commerce";
import type { RazorpayConfig, RazorpayWebhookPayload } from "./config.js";

/**
 * Real Razorpay payment gateway (test mode by default). Wraps the official SDK:
 *   - Orders API       -> instance.orders.create(...)
 *   - Payment Links API -> instance.paymentLink.create(...)
 *   - Webhooks          -> Razorpay.validateWebhookSignature(body, signature, secret)
 * Money is already canonical minor units -> Razorpay subunits (paise).
 */
export class RazorpayGateway implements PaymentGateway {
  readonly id = "razorpay";
  private readonly client: Razorpay;
  private readonly webhookSecret: string;

  constructor(private readonly config: RazorpayConfig) {
    const mode = config.mode ?? "test";
    if (mode === "live" && !config.allowLive) {
      throw new Error(
        "Razorpay live mode is not enabled for this build; use test keys (rzp_test_*) or set allowLive.",
      );
    }
    if (!/^rzp_(test|live)_/.test(config.keyId)) {
      throw new Error(`razorpay key_id "${config.keyId}" does not look like rzp_test_/rzp_live_`);
    }
    this.webhookSecret = config.webhookSecret;
    this.client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
  }

  async createOrder(request: PaymentOrderRequest): Promise<PaymentOrder> {
    const order = await this.client.orders.create({
      amount: request.amount.amount,
      currency: request.amount.currency,
      receipt: request.receipt,
      notes: request.notes ?? {},
    });
    return {
      id: order.id,
      amount: { amount: Number(order.amount), currency: order.currency },
      status: order.status ?? "created",
    };
  }

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    const body = {
      amount: request.amount.amount,
      currency: request.amount.currency,
      description: request.description,
      reference_id: request.referenceId,
      ...(request.callbackUrl ? { callback_url: request.callbackUrl, callback_method: "get" } : {}),
    };
    const link = (await this.client.paymentLink.create(body as never)) as unknown as {
      id: string;
      short_url: string;
      amount: number | string;
      currency: string;
      status?: string;
    };
    return {
      id: link.id,
      shortUrl: link.short_url,
      amount: { amount: Number(link.amount), currency: link.currency },
      status: link.status ?? "created",
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return Razorpay.validateWebhookSignature(rawBody, signature, this.webhookSecret);
  }

  /** Live payment-order status for polling reconciliation (no webhook needed). */
  async getOrderStatus(orderId: string): Promise<PaymentOrderStatus> {
    const order = await this.client.orders.fetch(orderId);
    return {
      status: order.status ?? "created",
      amountPaid: Number(order.amount_paid ?? 0),
    };
  }

  /**
   * Live PAYMENT LINK status for polling. The buyer pays the payment link, and
   * the link (not any independently created order) reflects the payment, so
   * this is the reliable entity to poll.
   */
  async getPaymentLinkStatus(linkId: string): Promise<PaymentOrderStatus> {
    const link = (await this.client.paymentLink.fetch(linkId)) as unknown as {
      status?: string;
      amount_paid?: number | string;
    };
    return {
      status: link.status ?? "created",
      amountPaid: Number(link.amount_paid ?? 0),
    };
  }

  parseWebhookEvent(payload: unknown): PaymentConfirmedEvent | null {
    const p = payload as RazorpayWebhookPayload;
    const event = p?.event;
    if (event !== "payment_link.paid" && event !== "payment_link.cancelled" && event !== "payment_link.expired") {
      return null;
    }
    const link = p?.payload?.payment_link?.entity;
    const payment = p?.payload?.payment?.entity;
    if (!link || typeof link.amount === "undefined") return null;

    const status = (link.status as string | undefined) ?? "unknown";
    return {
      paymentId: typeof payment?.id === "string" ? payment.id : "",
      linkId: typeof link.id === "string" ? link.id : undefined,
      referenceId: typeof link.reference_id === "string" ? link.reference_id : "",
      amount: { amount: Number(link.amount), currency: String(link.currency) },
      status: razorpayStatusToEvent(status),
    };
  }
}

function razorpayStatusToEvent(status: string): PaymentEventStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    default:
      return "cancelled";
  }
}

/** Compute the Razorpay webhook signature for a raw body (HMAC-SHA256). */
export function razorpaySignature(rawBody: string, webhookSecret: string): string {
  return createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
}

/**
 * Build a real Razorpay gateway from environment variables. Returns undefined
 * when no keys are configured (callers can fall back to a non-payment build).
 *
 *   RAZORPAY_KEY_ID         rzp_test_...
 *   RAZORPAY_KEY_SECRET     ...
 *   RAZORPAY_WEBHOOK_SECRET ...  (for webhook reconciliation)
 *   RAZORPAY_MODE           test | live   (default test; live requires allowLive)
 */
export function razorpayGatewayFromEnv(env: NodeJS.ProcessEnv = process.env): RazorpayGateway | undefined {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId && !keySecret) return undefined;
  if (!keyId || !keySecret) {
    throw new Error("set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable Razorpay");
  }
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const mode = (env.RAZORPAY_MODE ?? "test") as RazorpayConfig["mode"];
  return new RazorpayGateway({ keyId, keySecret, webhookSecret, mode });
}
