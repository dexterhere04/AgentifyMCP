import { describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "@agentify/gateway";
import { createMockCommerceProvider, type MockCommerceProvider } from "@agentify/adapter-mock";

const AGENT = { "ucp-agent": { profile: "https://agent.example/.well-known/ucp" } };

let rpcId = 1;

type RpcResult = { payload: { result?: Record<string, unknown>; error?: { message: string } } };

async function rpc(gateway: Gateway, sid: string, method: string, params: unknown): Promise<Record<string, unknown>> {
  const res = await gateway.app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sid,
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
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "audit-test", version: "1" } },
    }),
  });
  const sid = raw.headers.get("mcp-session-id");
  if (!sid) throw new Error("no session");
  return sid;
}

function structured(res: Record<string, unknown>): unknown {
  return (res as { structuredContent?: unknown }).structuredContent;
}

function resultOf(res: Record<string, unknown>): { isError?: boolean; content: Array<{ text: string }> } {
  return res as { isError?: boolean; content: Array<{ text: string }> };
}

describe("audit trail over HTTP + MCP (price change handled gracefully)", () => {
  it("gates, refuses a price change explainably, and records the whole trail", async () => {
    const raw: MockCommerceProvider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    const gateway = await createGateway({
      config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
      provider: raw,
    });
    const sid = await init(gateway);

    const cart = structured(await rpc(gateway, sid, "tools/call", { name: "create_cart", arguments: { meta: AGENT } })) as { id: string };
    await rpc(gateway, sid, "tools/call", {
      name: "add_to_cart",
      arguments: { meta: AGENT, cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 },
    });
    const chk = structured(
      await rpc(gateway, sid, "tools/call", { name: "create_checkout", arguments: { meta: AGENT, cartId: cart.id } }),
    ) as { id: string };

    // merchant raises the live price between selection and completion
    raw.simulatePriceChange("neck-anniversary-18", 4299);

    // 1) refused, explainably, over MCP
    const refused = resultOf(
      await rpc(gateway, sid, "tools/call", {
        name: "complete_checkout",
        arguments: { meta: AGENT, checkoutId: chk.id, approval: { buyerApproved: true } },
      }),
    );
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toContain("PRICE_CHANGED");
    expect(refused.content[0]!.text).toContain("New total is 429900");

    // 2) HTTP audit trail shows the refusal with explanation + amount
    const trailRes = await gateway.app.request(`/audit/${chk.id}`);
    expect(trailRes.status).toBe(200);
    const trail = (await trailRes.json()) as Array<{
      event: string;
      reasonCode?: string;
      amount?: number;
      approval?: { required: boolean; granted?: boolean };
    }>;
    expect(trail.map((e) => e.event)).toEqual(["checkout.created", "checkout.complete.refused"]);
    expect(trail[1]).toMatchObject({ reasonCode: "PRICE_CHANGED", amount: 429900, approval: { required: true, granted: false } });

    // 3) re-approve at the new total -> completes
    const done = structured(
      await rpc(gateway, sid, "tools/call", {
        name: "complete_checkout",
        arguments: { meta: AGENT, checkoutId: chk.id, approval: { buyerApproved: true } },
      }),
    ) as { id: string; total: { amount: number } };
    expect(done.total.amount).toBe(429900);

    // 4) MCP get_audit_trail returns the full, ordered story
    const trailTool = structured(
      await rpc(gateway, sid, "tools/call", { name: "get_audit_trail", arguments: { checkoutId: chk.id } }),
    ) as { checkoutId: string; events: Array<{ event: string }> };
    expect(trailTool.events.map((e) => e.event)).toEqual([
      "checkout.created",
      "checkout.complete.refused",
      "checkout.completed",
    ]);

    await gateway.mcp.close();
  });

  it("exposes a filtered /audit listing", async () => {
    const raw = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    const gateway = await createGateway({
      config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
      provider: raw,
    });
    const sid = await init(gateway);
    const cart = structured(await rpc(gateway, sid, "tools/call", { name: "create_cart", arguments: { meta: AGENT } })) as { id: string };
    const res = await gateway.app.request(`/audit?cartId=${cart.id}`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ event: string }>;
    expect(list.map((e) => e.event)).toEqual(["cart.created"]);
    await gateway.mcp.close();
  });
});
