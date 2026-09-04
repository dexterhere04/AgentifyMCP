/**
 * MVP 7 demo — Razorpay test-mode checkout, fully offline with the fake
 * Razorpay gateway. Shows the async, approval-gated payment flow:
 *   complete_checkout -> payment intent + buyer link -> signed webhook
 *   (simulating the buyer paying) -> order confirmed -> get_order + audit.
 *
 * Run: pnpm demo:razorpay
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "@hono/node-server";
import { createGateway, type Gateway } from "@gateway/app-gateway";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import {
  FakeRazorpayGateway,
  paymentLinkPaidPayload,
  razorpaySignature,
} from "@gateway/payments-razorpay";

const WEBHOOK_SECRET = "whsec_test";
const AGENT = { "ucp-agent": { profile: "https://agent.example/.well-known/ucp" } };

async function main(): Promise<void> {
  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  const gateway = await createGateway({
    config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
    provider,
    payment: { gateway: new FakeRazorpayGateway(WEBHOOK_SECRET), handlerName: "dev.gateway.razorpay.test" },
  });
  const nodeServer = serve({ fetch: gateway.app.fetch, port: 0 }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const base = `http://127.0.0.1:${(nodeServer.address() as { port: number }).port}`;

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  const client = new Client({ name: "razorpay-demo", version: "1.0.0" });
  await client.connect(transport);

  console.log("◆ Agent flow — Razorpay test-mode checkout\n");

  // 1. build the basket
  const cart = structured(await client.callTool({ name: "create_cart", arguments: { meta: AGENT } })) as { id: string };
  console.log(`create_cart → ${cart.id}`);
  const added = structured(
    await client.callTool({
      name: "add_to_cart",
      arguments: { meta: AGENT, cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 },
    }),
  ) as { subtotal: { amount: number } };
  console.log(`add_to_cart → subtotal ${(added.subtotal.amount / 100).toFixed(2)} INR`);

  const chk = structured(
    await client.callTool({ name: "create_checkout", arguments: { meta: AGENT, cartId: cart.id } }),
  ) as { id: string };
  console.log(`create_checkout → ${chk.id}\n`);

  // 2. buyer approves -> payment intent (async)
  const intent = structured(
    await client.callTool({
      name: "complete_checkout",
      arguments: { meta: AGENT, checkoutId: chk.id, approval: { buyerApproved: true } },
    }),
  ) as { checkoutId: string; status: string; paymentOrderId: string; paymentUrl: string; amount: { amount: number } };
  console.log(`complete_checkout (buyer approved)`);
  console.log(`  → ${intent.status} · razorpay order ${intent.paymentOrderId}`);
  console.log(`  → buyer approval/payment URL: ${intent.paymentUrl}\n`);

  // 3. buyer pays; Razorpay posts the signed webhook (simulated here)
  const payload = paymentLinkPaidPayload({
    referenceId: intent.checkoutId,
    amount: intent.amount.amount,
    currency: "INR",
    paymentId: "pay_demo_1",
  });
  const raw = JSON.stringify(payload);
  const webhookRes = await fetch(`${base}/webhooks/razorpay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-razorpay-signature": razorpaySignature(raw, WEBHOOK_SECRET) },
    body: raw,
  });
  const webhook = (await webhookRes.json()) as { ok: boolean; order?: { id: string; status: string; total: { amount: number } } };
  console.log("POST /webhooks/razorpay (signed payment_link.paid)");
  console.log(`  → ok=${webhook.ok} · order ${webhook.order?.id} [${webhook.order?.status}]\n`);

  // 4. agent fetches the order result
  const order = structured(
    await client.callTool({ name: "get_order", arguments: { meta: AGENT, orderId: webhook.order!.id } }),
  ) as { id: string; status: string; total: { amount: number } };
  console.log(`get_order → ${order.id} [${order.status}] total ${(order.total.amount / 100).toFixed(2)} INR\n`);

  // 5. audit trail
  console.log("Audit trail (money-changing events):");
  for (const event of gateway.audit.list()) {
    console.log(
      `  [${event.event}] checkout=${event.checkout_id ?? "-"} order=${event.order_id ?? "-"} amount=${event.amount ?? "-"} ${event.currency ?? ""}`.trimEnd(),
    );
  }

  await client.close();
  await gateway.mcp.close();
  nodeServer.close();
}

function structured(result: unknown): unknown {
  const r = result as { isError?: boolean; structuredContent?: unknown; content?: Array<{ text?: string }> };
  if (r.isError) throw new Error(`tool error: ${(r.content ?? [])[0]?.text ?? "unknown"}`);
  return r.structuredContent;
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nDemo failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);

export type { Gateway };
