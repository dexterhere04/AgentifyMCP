import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type Gateway } from "@gateway/app-gateway";
import {
  RestCommerceProvider,
  buildSecondStoreConfig,
  createFixtureStoreServer,
  FIXTURE_TOKEN,
  type FixtureStore,
} from "@gateway/adapter-rest";

/**
 * Moat proof (architecture doc section 21): connecting a SECOND merchant with
 * a completely different data shape requires only a new adapter config — the
 * UCP profile, MCP tool surface, agents.md and llms.txt are all derived and
 * must reflect the new merchant with zero gateway code changes.
 */

let rpcId = 1;
let openStores: FixtureStore[] = [];

afterEach(async () => {
  await Promise.all(openStores.map((s) => s.close()));
  openStores = [];
});

async function startSecondGateway(): Promise<{ gateway: Gateway; store: FixtureStore }> {
  const store = await createFixtureStoreServer();
  openStores.push(store);
  const provider = new RestCommerceProvider(
    buildSecondStoreConfig({ baseUrl: store.baseUrl, token: FIXTURE_TOKEN }),
  );
  const gateway = await createGateway({
    config: { port: 0, baseUrl: "https://second.example", storeUrl: "https://second.example" },
    provider,
  });
  return { gateway, store };
}

async function rpc(
  gateway: Gateway,
  sessionId: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  const res = await gateway.app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const payload = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (payload.error) throw new Error(payload.error.message);
  return payload.result;
}

async function init(gateway: Gateway): Promise<string> {
  const raw = await gateway.app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 999,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rest", version: "1" } },
    }),
  });
  const sid = raw.headers.get("mcp-session-id");
  if (!sid) throw new Error("no session id from initialize");
  return sid;
}

describe("second merchant over REST — surfaces derived from config only", () => {
  it("MCP tools/list reflects the REST merchant's catalog capability set", async () => {
    const { gateway, store } = await startSecondGateway();
    const sid = await init(gateway);
    const result = (await rpc(gateway, sid, "tools/list", {})) as {
      tools: Array<{ name: string }>;
    };
    expect(result.tools.map((t) => t.name)).toEqual([
      "search_catalog",
      "get_product",
      "get_variant",
      "check_availability",
      "get_offer",
    ]);
    await gateway.mcp.close();
    void store;
  });

  it("an agent can search and price the second merchant over MCP", async () => {
    const { gateway } = await startSecondGateway();
    const sid = await init(gateway);
    const search = (await rpc(gateway, sid, "tools/call", {
      name: "search_catalog",
      arguments: { query: "Moonstone", inStockOnly: true },
    })) as { content: Array<{ text: string }>; structuredContent: { items: Array<{ id: string; priceFrom: { amount: number } }> } };
    expect(search.structuredContent.items[0]!.id).toBe("sl-pendant");
    expect(search.structuredContent.items[0]!.priceFrom.amount).toBe(289000);

    const offer = (await rpc(gateway, sid, "tools/call", {
      name: "get_offer",
      arguments: { variantId: "v-sl-pendant-silver" },
    })) as { structuredContent: { productId: string; price: { amount: number }; availability: { quantity: number } } };
    expect(offer.structuredContent.productId).toBe("sl-pendant");
    expect(offer.structuredContent.price.amount).toBe(289000);
    expect(offer.structuredContent.availability.quantity).toBe(14);

    // No cart/checkout tools exist for this merchant.
    const list = (await rpc(gateway, sid, "tools/list", {})) as { tools: Array<{ name: string }> };
    expect(list.tools.map((t) => t.name)).not.toContain("create_cart");
    await gateway.mcp.close();
  });

  it("the UCP discovery profile advertises only catalog capabilities", async () => {
    const { gateway } = await startSecondGateway();
    const res = await gateway.app.request("/.well-known/ucp");
    const profile = (await res.json()) as {
      ucp: { services: Record<string, unknown>; capabilities: Record<string, unknown> };
    };
    expect(profile.ucp.services["dev.ucp.shopping"]).toBeDefined();
    expect(profile.ucp.capabilities["dev.ucp.shopping.catalog.search"]).toBeDefined();
    expect(profile.ucp.capabilities["dev.ucp.shopping.catalog.lookup"]).toBeDefined();
    expect(profile.ucp.capabilities["dev.ucp.shopping.cart"]).toBeUndefined();
    await gateway.mcp.close();
  });

  it("agents.md and llms.txt describe the second merchant, not the first", async () => {
    const { gateway } = await startSecondGateway();
    const agents = await (await gateway.app.request("/agents.md")).text();
    expect(agents).toContain("Luna & Co");
    expect(agents).toContain("No cart or checkout is possible");
    const llms = await (await gateway.app.request("/llms.txt")).text();
    expect(llms).toContain("# Luna & Co");
    await gateway.mcp.close();
  });
});
