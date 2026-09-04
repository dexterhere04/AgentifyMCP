import {
  type PaymentConfirmedEvent,
  type PaymentEventStatus,
  type PaymentGateway,
  type PaymentLink,
  type PaymentLinkRequest,
  type PaymentOrder,
  type PaymentOrderRequest,
  type PaymentOrderStatus,
  type Money,
} from "@agentify/canonical-commerce";
import { razorpaySignature } from "./razorpay.js";

/**
 * A deterministic, offline Razorpay gateway for hermetic tests and demos.
 *
 * It behaves like Razorpay test mode: creates orders + payment links with
 * plausible ids and signs webhooks with the configured secret so the gateway's
 * HMAC-SHA256 verification path is genuinely exercised without network access.
 */
export class FakeRazorpayGateway implements PaymentGateway {
  readonly id = "razorpay-fake";
  private orderCounter = 0;
  private linkCounter = 0;
  private readonly orders = new Map<string, { amount: Money; paid: boolean }>();

  constructor(private readonly webhookSecret: string) {}

  private static asMoney(amount: number, currency: string): Money {
    return { amount, currency };
  }

  async createOrder(request: PaymentOrderRequest): Promise<PaymentOrder> {
    this.orderCounter += 1;
    const id = `order_fake_${this.orderCounter}`;
    this.orders.set(id, { amount: request.amount, paid: false });
    return {
      id,
      amount: FakeRazorpayGateway.asMoney(request.amount.amount, request.amount.currency),
      status: "created",
    };
  }

  /** Simulate the buyer paying: marks an order as paid for polling tests. */
  markOrderPaid(orderId: string): void {
    const record = this.orders.get(orderId);
    if (!record) throw new Error(`unknown fake order "${orderId}"`);
    record.paid = true;
  }

  async getOrderStatus(orderId: string): Promise<PaymentOrderStatus> {
    const record = this.orders.get(orderId);
    if (!record) return { status: "created", amountPaid: 0 };
    return { status: record.paid ? "paid" : "created", amountPaid: record.paid ? record.amount.amount : 0 };
  }

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    this.linkCounter += 1;
    const id = `plink_fake_${this.linkCounter}`;
    return {
      id,
      shortUrl: `https://pay.razorpay.test/links/${id}`,
      amount: FakeRazorpayGateway.asMoney(request.amount.amount, request.amount.currency),
      status: "created",
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = razorpaySignature(rawBody, this.webhookSecret);
    return safeEqual(expected, signature);
  }

  verifyPaymentSignature(payload: { orderId: string; paymentId: string; signature: string }): boolean {
    const expected = razorpaySignature(`${payload.orderId}|${payload.paymentId}`, this.webhookSecret);
    return safeEqual(expected, payload.signature);
  }

  parseWebhookEvent(payload: unknown): PaymentConfirmedEvent | null {
    const event = (payload as { event?: string })?.event;
    if (event !== "payment_link.paid" && event !== "payment_link.cancelled" && event !== "payment_link.expired") {
      return null;
    }
    const link = (payload as { payload?: { payment_link?: { entity?: Record<string, unknown> } } })
      ?.payload?.payment_link?.entity;
    const payment = (payload as { payload?: { payment?: { entity?: Record<string, unknown> } } })
      ?.payload?.payment?.entity;
    if (!link || typeof link.amount === "undefined") return null;
    return {
      paymentId: typeof payment?.id === "string" ? payment.id : `pay_fake_${Date.now()}`,
      linkId: typeof link.id === "string" ? link.id : undefined,
      referenceId: typeof link.reference_id === "string" ? link.reference_id : "",
      amount: { amount: Number(link.amount), currency: String(link.currency) },
      status: razorpayFakeStatus((link.status as string | undefined) ?? "unknown"),
    };
  }
}

function razorpayFakeStatus(status: string): PaymentEventStatus {
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  return "cancelled";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Build a Razorpay `payment_link.paid` webhook payload for the given checkout,
 * mirroring the SDK's entity shape. Use with `razorpaySignature` to sign it.
 */
export function paymentLinkPaidPayload(input: {
  referenceId: string;
  amount: number;
  currency: string;
  linkId?: string;
  paymentId?: string;
  status?: "paid" | "cancelled" | "expired";
}): Record<string, unknown> {
  const status = input.status ?? "paid";
  const event = status === "paid" ? "payment_link.paid" : `payment_link.${status}`;
  return {
    event,
    payload: {
      payment_link: {
        entity: {
          id: input.linkId ?? "plink_fake_1",
          reference_id: input.referenceId,
          amount: input.amount,
          currency: input.currency,
          status,
        },
      },
      payment: {
        entity: { id: input.paymentId ?? `pay_fake_${Date.now()}`, status: "captured", amount: input.amount },
      },
    },
  };
}
