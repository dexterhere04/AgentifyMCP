import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "@gateway/app-gateway";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import {
  FakeRazorpayGateway,
  paymentLinkPaidPayload,
  razorpaySignature,
} from "@gateway/payments-razorpay";

const AGENT = { "ucp-agent": { profile: "https://agent.example/.well-known/ucp" } };
const WEBHOOK_SECRET = "whsec_test";

async function startGatewayWithPayments(): Promise<Gateway> {
  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  const gateway = await createGateway({
    config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
    provider,
    payment: { gateway: new FakeRazorpayGateway(WEBHOOK_SECRET), handlerName: "dev.gateway.razorpay.test" },
  });
  return gateway;
}

let rpcId = 1;

async function rpc(
  gateway: Gateway,
  sessionId: string,
  method: string,
  params: unknown,
): Promise<Record<string, unknown>> {
  const res = await gateway.app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const payload = (await res.json()) as { result?: Record<string, unknown>; error?: { message: string } };
  if (payload.error) throw new Error(payload.error.message);
  return payload.result!;
}

async function init(gateway: Gateway): Promise<string> {
  const raw = await gateway.app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 900,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "razorpay-test", version: "1" } },
    }),
  });
  const sid = raw.headers.get("mcp-session-id");
  if (!sid) throw new Error("no session");
  return sid;
}

async function prepareCheckout(gateway: Gateway, sid: string): Promise<string> {
  const cart = (await rpc(gateway, sid, "tools/call", {
    name: "create_cart",
    arguments: { meta: AGENT },
  })) as { structuredContent: { id: string } };
  await rpc(gateway, sid, "tools/call", {
    name: "add_to_cart",
    arguments: { meta: AGENT, cartId: cart.structuredContent.id, variantId: "neck-anniversary-18", quantity: 1 },
  });
  const chk = (await rpc(gateway, sid, "tools/call", {
    name: "create_checkout",
    arguments: { meta: AGENT, cartId: cart.structuredContent.id },
  })) as { structuredContent: { id: string } };
  return chk.structuredContent.id;
}

afterEach(() => {
  rpcId = 1;
});

describe("MVP 7 — Razorpay test-mode checkout over HTTP", () => {
  it("complete_checkout starts a payment and the webhook finalizes the order", async () => {
    const gateway = await startGatewayWithPayments();
    const sid = await init(gateway);
    const checkoutId = await prepareCheckout(gateway, sid);

    // 1. Agent completes checkout with approval -> payment intent (async path).
    const done = (await rpc(gateway, sid, "tools/call", {
      name: "complete_checkout",
      arguments: { meta: AGENT, checkoutId, approval: { buyerApproved: true } },
    })) as {
      structuredContent: {
        checkoutId: string;
        status: string;
        paymentOrderId: string;
        paymentUrl: string;
        amount: { amount: number };
      };
    };
    const intent = done.structuredContent;
    expect(intent.checkoutId).toBe(checkoutId);
    expect(intent.status).toBe("payment_pending");
    expect(intent.paymentUrl).toMatch(/^https:\/\/pay\.razorpay\.test\/links\//);
    expect(intent.amount.amount).toBe(399900);

    // 2. Buyer pays -> Razorpay posts a signed webhook.
    const payload = paymentLinkPaidPayload({
      referenceId: checkoutId,
      amount: intent.amount.amount,
      currency: "INR",
      paymentId: "pay_real_1",
    });
    const raw = JSON.stringify(payload);
    const webhookRes = await gateway.app.request("/webhooks/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": razorpaySignature(raw, WEBHOOK_SECRET) },
      body: raw,
    });
    expect(webhookRes.status).toBe(200);
    const webhook = (await webhookRes.json()) as { ok: boolean; order: { id: string; checkoutId: string } };
    expect(webhook.ok).toBe(true);
    expect(webhook.order.checkoutId).toBe(checkoutId);

    // 3. Agent fetches the order result.
    const orderRes = (await rpc(gateway, sid, "tools/call", {
      name: "get_order",
      arguments: { meta: AGENT, orderId: webhook.order.id },
    })) as { structuredContent: { status: string; total: { amount: number } } };
    expect(orderRes.structuredContent.status).toBe("confirmed");
    expect(orderRes.structuredContent.total.amount).toBe(399900);

    // 4. Audit trail captured every money-changing step.
    const events = gateway.audit.list().map((e) => e.event);
    expect(events).toContain("checkout.payment.order.created");
    expect(events).toContain("checkout.payment_link.created");
    expect(events).toContain("checkout.payment.received");
    expect(events).toContain("checkout.completed");

    // 5. UCP profile now advertises the payment handler.
    const profileRes = await gateway.app.request("/.well-known/ucp");
    const profile = (await profileRes.json()) as {
      ucp: { payment_handlers: Record<string, unknown> };
    };
    expect(profile.ucp.payment_handlers["dev.gateway.razorpay.test"]).toBeDefined();

    await gateway.mcp.close();
  });

  it("rejects an invalid webhook signature", async () => {
    const gateway = await startGatewayWithPayments();
    const sid = await init(gateway);
    const checkoutId = await prepareCheckout(gateway, sid);
    await rpc(gateway, sid, "tools/call", {
      name: "complete_checkout",
      arguments: { meta: AGENT, checkoutId, approval: { buyerApproved: true } },
    });
    const payload = paymentLinkPaidPayload({ referenceId: checkoutId, amount: 399900, currency: "INR" });
    const res = await gateway.app.request("/webhooks/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": "forged" },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_SIGNATURE");
    await gateway.mcp.close();
  });

  it("rejects an amount mismatch", async () => {
    const gateway = await startGatewayWithPayments();
    const sid = await init(gateway);
    const checkoutId = await prepareCheckout(gateway, sid);
    await rpc(gateway, sid, "tools/call", {
      name: "complete_checkout",
      arguments: { meta: AGENT, checkoutId, approval: { buyerApproved: true } },
    });
    const payload = paymentLinkPaidPayload({ referenceId: checkoutId, amount: 1, currency: "INR" });
    const raw = JSON.stringify(payload);
    const res = await gateway.app.request("/webhooks/razorpay", {
      method: "POST",
      headers: { "content-type": "application/json", "x-razorpay-signature": razorpaySignature(raw, WEBHOOK_SECRET) },
      body: raw,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AMOUNT_MISMATCH");
    await gateway.mcp.close();
  });

  it("is idempotent against duplicate webhooks", async () => {
    const gateway = await startGatewayWithPayments();
    const sid = await init(gateway);
    const checkoutId = await prepareCheckout(gateway, sid);
    await rpc(gateway, sid, "tools/call", {
      name: "complete_checkout",
      arguments: { meta: AGENT, checkoutId, approval: { buyerApproved: true } },
    });
    const payload = paymentLinkPaidPayload({
      referenceId: checkoutId,
      amount: 399900,
      currency: "INR",
      paymentId: "pay_dup",
    });
    const raw = JSON.stringify(payload);
    const headers = { "content-type": "application/json", "x-razorpay-signature": razorpaySignature(raw, WEBHOOK_SECRET) };
    const first = await (await gateway.app.request("/webhooks/razorpay", { method: "POST", headers, body: raw })).json();
    const second = await (await gateway.app.request("/webhooks/razorpay", { method: "POST", headers, body: raw })).json();
    expect((first as { order: { id: string } }).order.id).toBe((second as { order: { id: string } }).order.id);
    await gateway.mcp.close();
  });
});
