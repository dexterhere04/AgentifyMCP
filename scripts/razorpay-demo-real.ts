/**
 * MVP 7 real — Razorpay TEST-MODE payment with REAL rzp_test_* keys.
 *
 * Reconciles by POLLING the payment order (no tunnel/webhook needed), which is
 * perfect for local runs:
 *
 *   RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... pnpm demo:razorpay:real
 *
 * Flow: agent builds cart -> checkout -> complete_checkout (buyer approval) ->
 * a real Razorpay payment link is printed. Open it, pay with a TEST card
 * (4111 1111 1111 1111, any future expiry, any CVV, OTP 1234), then the demo
 * polls the order status until paid and prints the confirmed order + audit.
 *
 * Webhook reconciliation works too when RAZORPAY_WEBHOOK_SECRET is set and
 * Razorpay can reach POST {BASE_URL}/webhooks/razorpay.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "@hono/node-server";
import { createGateway } from "@agentify/gateway";
import { createMockCommerceProvider } from "@agentify/adapter-mock";
import { razorpayGatewayFromEnv } from "@agentify/payments-razorpay";
import { PaymentError } from "@agentify/payments";

const AGENT = { "ucp-agent": { profile: "https://agent.example/.well-known/ucp" } };
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 240_000;

async function main(): Promise<void> {
  const razorpay = razorpayGatewayFromEnv();
  if (!razorpay) {
    throw new Error(
      "set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (rzp_test_* keys from the Razorpay dashboard) " +
        "to run the real test-mode demo. See docs/payments/razorpay.md.",
    );
  }
  console.log("◆ Real Razorpay test mode (rzp_test_* keys configured)");

  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  const gateway = await createGateway({
    config: { port: 0, baseUrl: "http://localhost:8787", storeUrl: "https://demo.example" },
    provider,
    payment: { gateway: razorpay, handlerName: "dev.agentify.razorpay.test" },
  });
  const nodeServer = serve({ fetch: gateway.app.fetch, port: 0 }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const base = `http://127.0.0.1:${(nodeServer.address() as { port: number }).port}`;

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  const client = new Client({ name: "razorpay-real-demo", version: "1.0.0" });
  await client.connect(transport);

  console.log("\n◆ Agent flow — real Razorpay payment\n");
  const cart = structured(await client.callTool({ name: "create_cart", arguments: { meta: AGENT } })) as { id: string };
  console.log(`create_cart → ${cart.id}`);
  await client.callTool({
    name: "add_to_cart",
    arguments: { meta: AGENT, cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 },
  });
  const chk = structured(
    await client.callTool({ name: "create_checkout", arguments: { meta: AGENT, cartId: cart.id } }),
  ) as { id: string };
  console.log(`create_checkout → ${chk.id}\n`);

  const intent = structured(
    await client.callTool({
      name: "complete_checkout",
      arguments: { meta: AGENT, checkoutId: chk.id, approval: { buyerApproved: true } },
    }),
  ) as { checkoutId: string; status: string; paymentOrderId: string; paymentUrl: string; amount: { amount: number } };
  console.log(`complete_checkout (buyer approved)`);
  console.log(`  → ${intent.status} · razorpay order ${intent.paymentOrderId}`);
  console.log(`  → OPEN IN YOUR BROWSER AND PAY (test card):\n      ${intent.paymentUrl}`);
  console.log(`      card 4111 1111 1111 1111 · any future expiry · any CVV · OTP 1234\n`);
  console.log("Polling for payment… (this will also reconcile via webhook if configured)");

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let order;
  while (Date.now() < deadline) {
    try {
      order = await gateway.payments!.reconcileByPolling(intent.checkoutId);
      break;
    } catch (err) {
      if (err instanceof PaymentError && err.code === "PAYMENT_NOT_READY") {
        process.stdout.write(".");
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      throw err;
    }
  }
  if (!order) throw new Error(`timed out waiting for payment after ${POLL_TIMEOUT_MS}ms`);

  const fetched = structured(
    await client.callTool({ name: "get_order", arguments: { meta: AGENT, orderId: order.id } }),
  ) as { id: string; status: string; total: { amount: number } };
  console.log(`\nget_order → ${fetched.id} [${fetched.status}] total ${(fetched.total.amount / 100).toFixed(2)} INR`);

  console.log("\nAudit trail (money-changing events):");
  for (const event of gateway.audit.list()) {
    console.log(
      `  [${event.event}] checkout=${event.checkout_id ?? "-"} order=${event.order_id ?? "-"} amount=${event.amount ?? "-"} ${event.currency ?? ""}`.trimEnd(),
    );
  }

  await client.close();
  await gateway.mcp.close();
  nodeServer.close();
}

function structured(result: unknown): unknown {  const r = result as { isError?: boolean; structuredContent?: unknown; content?: Array<{ text?: string }> };
  if (r.isError) throw new Error(`tool error: ${(r.content ?? [])[0]?.text ?? "unknown"}`);
  return r.structuredContent;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nDemo failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
