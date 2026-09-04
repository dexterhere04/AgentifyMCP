import type { Money } from "./money.js";

/**
 * Payment infrastructure types.
 *
 * Payments are a GATEWAY concern, not a merchant capability: the merchant owns
 * checkout; the gateway orchestrates a PaymentGateway (e.g. Razorpay) and
 * finalizes the merchant's checkout once the payment is confirmed. UCP/MCP
 * layers therefore stay independent of any specific payment provider.
 */

export interface PaymentOrderRequest {
  amount: Money;
  /** Merchant reference echoed by the provider (e.g. the checkout id). */
  receipt: string;
  description?: string;
  notes?: Record<string, string>;
}

export interface PaymentOrder {
  id: string;
  amount: Money;
  status: string;
}

export interface PaymentLinkRequest {
  amount: Money;
  description: string;
  /** Merchant reference the provider links to this payment link. */
  referenceId: string;
  callbackUrl?: string;
}

export interface PaymentLink {
  id: string;
  /** Public URL a buyer opens to approve and pay. */
  shortUrl: string;
  amount: Money;
  status: string;
}

export type PaymentEventStatus = "paid" | "cancelled" | "expired";

/** A confirmed payment event parsed from a provider webhook payload. */
export interface PaymentConfirmedEvent {
  paymentId: string;
  linkId?: string;
  /** The checkout the payment is for (the provider's reference id). */
  referenceId: string;
  amount: Money;
  status: PaymentEventStatus;
}

/** Live order status used for polling reconciliation (no webhook needed). */
export interface PaymentOrderStatus {
  status: string;
  /** Minor-unit amount actually paid, when the provider reports it. */
  amountPaid?: number;
}

/**
 * A provider-agnostic payment gateway. A real adapter wraps a PSP SDK; fakes
 * implement the same interface so orchestration is fully testable offline.
 */
export interface PaymentGateway {
  readonly id: string;
  createOrder(request: PaymentOrderRequest): Promise<PaymentOrder>;
  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink>;
  /** Verify an HMAC-style webhook signature over the raw body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /** Parse a provider webhook payload into a normalized payment event. */
  parseWebhookEvent(payload: unknown): PaymentConfirmedEvent | null;
  /** Optional: fetch a payment order's live status (for polling reconciliation). */
  getOrderStatus?(orderId: string): Promise<PaymentOrderStatus>;
  /**
   * Optional: fetch a payment link's live status. Preferred for polling when the
   * buyer pays a hosted link whose internal order differs from any order the
   * gateway created independently.
   */
  getPaymentLinkStatus?(linkId: string): Promise<PaymentOrderStatus>;
}

/** Result of starting the payment flow for a checkout. */
export interface PaymentIntent {
  checkoutId: string;
  status: "payment_pending";
  provider: string;
  paymentOrderId: string;
  paymentLinkId: string;
  /** Buyer approval/payment URL to hand to the user. */
  paymentUrl: string;
  amount: Money;
}
