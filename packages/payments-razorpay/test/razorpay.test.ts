import { describe, expect, it } from "vitest";
import {
  FakeRazorpayGateway,
  RazorpayGateway,
  paymentLinkPaidPayload,
  razorpaySignature,
} from "../src/index.js";

const SECRET = "whsec_test";

describe("FakeRazorpayGateway", () => {
  it("creates deterministic orders and payment links", async () => {
    const gateway = new FakeRazorpayGateway(SECRET);
    const order = await gateway.createOrder({
      amount: { amount: 399900, currency: "INR" },
      receipt: "chk_1",
    });
    const link = await gateway.createPaymentLink({
      amount: { amount: 399900, currency: "INR" },
      description: "Checkout chk_1",
      referenceId: "chk_1",
    });
    expect(order.id).toMatch(/^order_fake_\d+$/);
    expect(order.amount).toEqual({ amount: 399900, currency: "INR" });
    expect(link.shortUrl).toMatch(/^https:\/\/pay\.razorpay\.test\/links\//);
  });

  it("verifies HMAC signatures it can also produce", () => {
    const gateway = new FakeRazorpayGateway(SECRET);
    const payload = paymentLinkPaidPayload({ referenceId: "chk_1", amount: 399900, currency: "INR" });
    const raw = JSON.stringify(payload);
    const signature = razorpaySignature(raw, SECRET);
    expect(gateway.verifyWebhookSignature(raw, signature)).toBe(true);
    expect(gateway.verifyWebhookSignature(raw, "tampered")).toBe(false);
  });

  it("parses payment_link.paid events", () => {
    const gateway = new FakeRazorpayGateway(SECRET);
    const payload = paymentLinkPaidPayload({
      referenceId: "chk_1",
      amount: 399900,
      currency: "INR",
      paymentId: "pay_123",
    });
    const event = gateway.parseWebhookEvent(payload)!;
    expect(event).toMatchObject({
      referenceId: "chk_1",
      amount: { amount: 399900, currency: "INR" },
      status: "paid",
      paymentId: "pay_123",
    });
  });

  it("treats cancelled/expired events as not paid", () => {
    const gateway = new FakeRazorpayGateway(SECRET);
    const cancelled = gateway.parseWebhookEvent(
      paymentLinkPaidPayload({ referenceId: "c1", amount: 100, currency: "INR", status: "cancelled" }),
    );
    expect(cancelled?.status).toBe("cancelled");
  });
});

describe("RazorpayGateway (offline surface)", () => {
  it("rejects malformed key ids and live mode without opt-in", () => {
    expect(() => new RazorpayGateway({ keyId: "bad", keySecret: "s", webhookSecret: "w" })).toThrow();
    expect(
      () =>
        new RazorpayGateway({
          keyId: "rzp_live_123",
          keySecret: "s",
          webhookSecret: "w",
          mode: "live",
        }),
    ).toThrow(/allowLive/);
  });

  it("accepts test keys and validates signatures offline", () => {
    const gateway = new RazorpayGateway({
      keyId: "rzp_test_abc",
      keySecret: "secret",
      webhookSecret: SECRET,
    });
    const payload = paymentLinkPaidPayload({ referenceId: "chk_1", amount: 399900, currency: "INR" });
    const raw = JSON.stringify(payload);
    expect(gateway.verifyWebhookSignature(raw, razorpaySignature(raw, SECRET))).toBe(true);
    expect(gateway.verifyWebhookSignature(raw, "bad")).toBe(false);
  });

  it("parses a Razorpay-shaped payment_link.paid payload", () => {
    const gateway = new RazorpayGateway({
      keyId: "rzp_test_abc",
      keySecret: "secret",
      webhookSecret: SECRET,
    });
    const payload = {
      event: "payment_link.paid",
      payload: {
        payment_link: {
          entity: { id: "plink_9", reference_id: "chk_1", amount: 399900, currency: "INR", status: "paid" },
        },
        payment: { entity: { id: "pay_42", status: "captured", amount: 399900 } },
      },
    };
    const event = gateway.parseWebhookEvent(payload)!;
    expect(event).toMatchObject({
      paymentId: "pay_42",
      linkId: "plink_9",
      referenceId: "chk_1",
      status: "paid",
      amount: { amount: 399900, currency: "INR" },
    });
  });
});
