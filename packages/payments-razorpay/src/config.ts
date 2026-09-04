export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Webhook secret for HMAC-SHA256 signature validation. */
  webhookSecret: string;
  mode?: "test" | "live";
  /** Defaults to false: MVP builds only run against Razorpay test keys. */
  allowLive?: boolean;
}

export interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment_link?: { entity?: Record<string, unknown> };
    payment?: { entity?: Record<string, unknown> };
  };
}
