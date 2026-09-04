import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  CommerceProvider,
  PaymentConfirmedEvent,
  PaymentGateway,
  PaymentLink,
  PaymentLinkRequest,
  PaymentOrder,
  PaymentOrderRequest,
} from "@agentify/canonical-commerce";
import { createMockCommerceProvider } from "@agentify/adapter-mock";
import { InMemoryAuditStore, PaymentOrchestrator } from "../src/index.js";

const SECRET = "whsec_test";

class LocalFakeGateway implements PaymentGateway {
  readonly id = "fake";
  private n = 0;
  private readonly orders = new Map<string, { amount: { amount: number; currency: string }; paid: boolean }>();

  async createOrder(r: PaymentOrderRequest): Promise<PaymentOrder> {
    this.n += 1;
    const id = `order_${this.n}`;
    this.orders.set(id, { amount: r.amount, paid: false });
    return { id, amount: r.amount, status: "created" };
  }
  async createPaymentLink(r: PaymentLinkRequest): Promise<PaymentLink> {
    this.n += 1;
    return { id: `plink_${this.n}`, shortUrl: `https://pay.local/${this.n}`, amount: r.amount, status: "created" };
  }
  markPaid(orderId: string, amountOverride?: number): void {
    const record = this.orders.get(orderId);
    if (!record) throw new Error(`unknown order ${orderId}`);
    record.paid = true;
    if (amountOverride !== undefined) record.amount = { ...record.amount, amount: amountOverride };
  }
  async getOrderStatus(orderId: string): Promise<{ status: string; amountPaid?: number }> {
    const record = this.orders.get(orderId);
    if (!record) return { status: "created", amountPaid: 0 };
    return { status: record.paid ? "paid" : "created", amountPaid: record.paid ? record.amount.amount : 0 };
  }
  verifyWebhookSignature(raw: string, signature: string): boolean {
    const expected = createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
    return expected === signature;
  }
  parseWebhookEvent(payload: unknown): PaymentConfirmedEvent | null {
    const p = payload as {
      event?: string;
      payload?: { payment?: { entity?: Record<string, unknown> } };
    };
    if (p.event !== "payment_link.paid") return null;
    const payment = p.payload?.payment?.entity;
    return {
      paymentId: typeof payment?.id === "string" ? payment.id : "pay_x",
      referenceId: String((payload as { reference_id?: string }).reference_id ?? ""),
      amount: (payload as { amount: { amount: number; currency: string } }).amount,
      status: "paid",
    };
  }
}

function sign(body: unknown, secret = SECRET): string {
  return createHmac("sha256", secret).update(JSON.stringify(body), "utf8").digest("hex");
}

function webhookBody(opts: { checkoutId: string; amount: number; currency?: string; paymentId?: string }) {
  return {
    event: "payment_link.paid",
    reference_id: opts.checkoutId,
    amount: { amount: opts.amount, currency: opts.currency ?? "INR" },
    payload: { payment: { entity: { id: opts.paymentId ?? `pay_${opts.checkoutId}` } } },
  };
}

async function setup() {
  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  const merchant = await provider.merchant();
  const audit = new InMemoryAuditStore();
  const gateway = new LocalFakeGateway();
  const orch = new PaymentOrchestrator(provider, gateway, audit, merchant.id);

  const cart = await provider.cart!.create({ agentProfile: "https://agent.example/.well-known/ucp" });
  await provider.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
  const checkout = await provider.checkout!.create({ cartId: cart.id });
  return { provider, audit, orch, checkout, gateway };
}

describe("PaymentOrchestrator", () => {
  it("starts a payment and returns a payable intent", async () => {
    const { orch, checkout, audit } = await setup();
    const intent = await orch.startPayment(checkout.id, { agent: "agent-1" });
    expect(intent).toMatchObject({
      checkoutId: checkout.id,
      status: "payment_pending",
      provider: "fake",
      amount: { amount: 399900, currency: "INR" },
    });
    expect(intent.paymentUrl).toMatch(/^https:\/\/pay\.local\//);
    expect(audit.list().map((e) => e.event)).toContain("checkout.payment.order.created");
    expect(audit.list().map((e) => e.event)).toContain("checkout.payment_link.created");
  });

  it("completes the merchant order on a verified paid webhook", async () => {
    const { orch, provider, checkout, audit } = await setup();
    const intent = await orch.startPayment(checkout.id);
    const body = webhookBody({ checkoutId: checkout.id, amount: intent.amount.amount });
    const order = await orch.handleWebhook(JSON.stringify(body), sign(body));

    expect(order.status).toBe("confirmed");
    expect(order.checkoutId).toBe(checkout.id);
    const fetched = await provider.orders!.get(order.id);
    expect(fetched.id).toBe(order.id);
    const events = audit.list().map((e) => e.event);
    expect(events).toContain("checkout.payment.received");
    expect(events).toContain("checkout.completed");
  });

  it("rejects an invalid webhook signature", async () => {
    const { orch, checkout } = await setup();
    const intent = await orch.startPayment(checkout.id);
    const body = webhookBody({ checkoutId: checkout.id, amount: intent.amount.amount });
    await expect(orch.handleWebhook(JSON.stringify(body), "deadbeef")).rejects.toMatchObject({
      code: "INVALID_SIGNATURE",
    });
  });

  it("rejects a webhook whose amount does not match the intent", async () => {
    const { orch, checkout } = await setup();
    const intent = await orch.startPayment(checkout.id);
    const body = webhookBody({ checkoutId: checkout.id, amount: intent.amount.amount + 1 });
    await expect(orch.handleWebhook(JSON.stringify(body), sign(body))).rejects.toMatchObject({
      code: "AMOUNT_MISMATCH",
    });
  });

  it("rejects a webhook for an unknown checkout", async () => {
    const { orch } = await setup();
    const body = webhookBody({ checkoutId: "chk_never_started", amount: 100 });
    await expect(orch.handleWebhook(JSON.stringify(body), sign(body))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is idempotent for a duplicate paid webhook", async () => {
    const { orch, checkout } = await setup();
    const intent = await orch.startPayment(checkout.id);
    const body = webhookBody({ checkoutId: checkout.id, amount: intent.amount.amount, paymentId: "pay_dup" });
    const raw = JSON.stringify(body);
    const first = await orch.handleWebhook(raw, sign(body));
    const second = await orch.handleWebhook(raw, sign(body));
    expect(second.id).toBe(first.id);
  });

  it("records amount-mismatch and invalid-signature audit events", async () => {
    const { orch, checkout, audit } = await setup();
    const intent = await orch.startPayment(checkout.id);
    const body = webhookBody({ checkoutId: checkout.id, amount: intent.amount.amount + 5 });
    await expect(orch.handleWebhook(JSON.stringify(body), sign(body))).rejects.toMatchObject({
      code: "AMOUNT_MISMATCH",
    });
    expect(audit.list().map((e) => e.event)).toContain("checkout.payment.amount_mismatch");
  });
});

describe("PaymentOrchestrator.reconcileByPolling", () => {
  it("is not ready until the order is paid", async () => {
    const { orch, gateway, checkout } = await setup();
    const intent = await orch.startPayment(checkout.id);
    await expect(orch.reconcileByPolling(checkout.id)).rejects.toMatchObject({
      code: "PAYMENT_NOT_READY",
    });
    gateway.markPaid(intent.paymentOrderId);
    const order = await orch.reconcileByPolling(checkout.id);
    expect(order.status).toBe("confirmed");
  });

  it("is idempotent across polling and webhook paths", async () => {
    const { orch, gateway, checkout } = await setup();
    const intent = await orch.startPayment(checkout.id);
    gateway.markPaid(intent.paymentOrderId);
    const polled = await orch.reconcileByPolling(checkout.id);

    // a duplicate poll returns the same order
    const again = await orch.reconcileByPolling(checkout.id);
    expect(again.id).toBe(polled.id);

    // a late webhook for the same checkout also returns the same order
    const body = webhookBody({ checkoutId: checkout.id, amount: intent.amount.amount });
    const webhookOrder = await orch.handleWebhook(JSON.stringify(body), sign(body));
    expect(webhookOrder.id).toBe(polled.id);
  });

  it("rejects an amount mismatch when the order was overpaid/underpaid", async () => {
    const { orch, gateway, checkout } = await setup();
    const intent = await orch.startPayment(checkout.id);
    gateway.markPaid(intent.paymentOrderId, intent.amount.amount + 1);
    await expect(orch.reconcileByPolling(checkout.id)).rejects.toMatchObject({
      code: "AMOUNT_MISMATCH",
    });
  });
});
