import { describe, expect, it } from "vitest";
import { createGateway } from "@agentify/gateway";
import { createMockCommerceProvider } from "@agentify/adapter-mock";
import { InMemoryAuditStore, PaymentOrchestrator, PaymentError } from "@agentify/payments";
import { RazorpayGateway } from "@agentify/payments-razorpay";

/**
 * REAL Razorpay test-mode integration (network).
 *
 * Opt-in only: this suite is skipped unless RAZORPAY_TEST_KEY_ID and
 * RAZORPAY_TEST_KEY_SECRET are set (rzp_test_*). It creates a real payment
 * order + payment link and verifies the order is created and pending — it does
 * NOT auto-pay. CI stays hermetic because the env vars are absent.
 */
const enabled = Boolean(process.env.RAZORPAY_TEST_KEY_ID && process.env.RAZORPAY_TEST_KEY_SECRET);

describe.skipIf(!enabled)("real Razorpay test mode (network)", () => {
  it("starts a real payment and reports the order as pending", async () => {
    const gateway = new RazorpayGateway({
      keyId: process.env.RAZORPAY_TEST_KEY_ID!,
      keySecret: process.env.RAZORPAY_TEST_KEY_SECRET!,
      webhookSecret: process.env.RAZORPAY_TEST_WEBHOOK_SECRET ?? "",
      mode: "test",
    });
    const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    const merchant = await provider.merchant();
    const audit = new InMemoryAuditStore();
    const orchestrator = new PaymentOrchestrator(provider, gateway, audit, merchant.id);

    const cart = await provider.cart!.create();
    await provider.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
    const checkout = await provider.checkout!.create({ cartId: cart.id });

    const intent = await orchestrator.startPayment(checkout.id);
    expect(intent.paymentOrderId).toMatch(/^order_/);
    expect(intent.paymentLinkId).toMatch(/^plink_/);
    expect(intent.paymentUrl).toMatch(/^https:\/\/rzp\.io|^https:\/\/.*razorpay/);
    expect(intent.status).toBe("payment_pending");

    // not paid yet -> reconcile reports PAYMENT_NOT_READY
    await expect(orchestrator.reconcileByPolling(checkout.id)).rejects.toMatchObject({
      code: "PAYMENT_NOT_READY",
    });
  });
});
