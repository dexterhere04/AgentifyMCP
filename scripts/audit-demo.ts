/**
 * Buildathon proof: every money action is EXPLAINABLE, BOUNDED and GATED; the
 * audit trail is shown; and one failure (price changed after selection) is
 * handled gracefully.
 *
 * Flow:
 *   gated complete (no approval)  → refused
 *   merchant price rises mid-flow → PRICE_CHANGED refusal + re-quote
 *   buyer re-approves             → completes at the new total
 *   then we print the full audit trail for the checkout.
 *
 * Run: pnpm demo:audit
 */
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createGateway } from "@agentify/gateway";
import { createMockCommerceProvider, type MockCommerceProvider } from "@agentify/adapter-mock";

const AGENT = { "ucp-agent": { profile: "https://agent.example/.well-known/ucp" } };
const inr = (amount: number): string => `₹${(amount / 100).toFixed(2)}`;

async function main(): Promise<void> {
  const raw: MockCommerceProvider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  const gateway = await createGateway({
    config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
    provider: raw,
  });
  const nodeServer = serve({ fetch: gateway.app.fetch, port: 0 }, () => {});
  await new Promise((r) => setTimeout(r, 50));
  const base = `http://127.0.0.1:${(nodeServer.address() as { port: number }).port}`;

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  const client = new Client({ name: "audit-demo", version: "1.0.0" });
  await client.connect(transport);

  const step = (t: string): void => console.log(`\n◆ ${t}`);
  const call = async (name: string, arguments_: Record<string, unknown>): Promise<unknown> => {
    const res = (await client.callTool({ name, arguments: arguments_ })) as {
      isError?: boolean;
      structuredContent?: unknown;
      content?: Array<{ text?: string }>;
    };
    if (res.isError) {
      return { error: (res.content ?? [])[0]?.text };
    }
    return res.structuredContent;
  };

  step("GATED — completing without buyer approval is refused");
  const cart = (await call("create_cart", { meta: AGENT })) as { id: string };
  await call("add_to_cart", { meta: AGENT, cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
  const chk = (await call("create_checkout", { meta: AGENT, cartId: cart.id })) as { id: string };
  const noApproval = (await call("complete_checkout", {
    meta: AGENT,
    checkoutId: chk.id,
    approval: { buyerApproved: false },
  })) as { error: string };
  console.log(`  refused: ${noApproval.error.split("\n")[0]}`);

  step("BOUNDED — merchant raises the price after selection (graceful failure)");
  raw.simulatePriceChange("neck-anniversary-18", 4299);
  const staleApproval = (await call("complete_checkout", {
    meta: AGENT,
    checkoutId: chk.id,
    approval: { buyerApproved: true },
  })) as { error: string };
  console.log(`  refused: ${staleApproval.error.split("\n")[0]}`);

  step("EXPLAINABLE — re-quote shown, buyer re-approves at the new total");
  const after = (await call("get_checkout", { meta: AGENT, checkoutId: chk.id })) as {
    status: string;
    totals?: { total: { amount: number; currency: string } };
  };
  console.log(`  checkout status=${after.status} total=${after.totals ? inr(after.totals.total.amount) : "n/a"}`);
  const order = (await call("complete_checkout", {
    meta: AGENT,
    checkoutId: chk.id,
    approval: { buyerApproved: true },
  })) as { id: string; status: string; total: { amount: number } };
  console.log(`  order ${order.id} [${order.status}] total=${inr(order.total.amount)}`);

  step("SHOW THE AUDIT TRAIL");
  for (const e of gateway.audit.byCheckout(chk.id)) {
    const approval = e.approval
      ? ` [approval ${e.approval.required ? "required" : "n/a"}${e.approval.granted ?? e.approval.received ? "+" : "-"}]`
      : "";
    console.log(
      `  ${e.event}${e.reasonCode ? ` (${e.reasonCode})` : ""}${approval}` +
        `${e.amount !== undefined ? ` amount=${e.amount}${e.currency ? ` ${e.currency}` : ""}` : ""}` +
        `${e.explanation ? ` — ${e.explanation}` : ""}`,
    );
  }

  await client.close();
  await gateway.mcp.close();
  nodeServer.close();
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nDemo failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);