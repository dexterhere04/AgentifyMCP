import { describe, expect, it } from "vitest";
import type { CommerceProvider } from "@gateway/canonical-commerce";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import { createGateway, type Gateway } from "@gateway/app-gateway";

interface RpcResult {
  sessionId?: string;
  contentType: string;
  payload: unknown;
}

let rpcId = 1;

async function sendRpc(
  gateway: Gateway,
  method: string,
  params: unknown,
  sessionId?: string,
): Promise<RpcResult> {
  const res = await gateway.app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  const contentType = res.headers.get("content-type") ?? "";
  let payload: unknown;
  if (contentType.includes("application/json")) {
    payload = await res.json();
  } else {
    // SSE fallback: parse the first data: frame.
    const raw = await res.text();
    payload = raw
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => JSON.parse(l.slice(5).trim()))[0];
  }
  return { sessionId: res.headers.get("mcp-session-id") ?? undefined, contentType, payload };
}

type JsonRpcResponse = {
  jsonrpc: string;
  id: number;
  result?: { [k: string]: unknown };
  error?: { code: number; message: string };
};

async function newSession(gateway: Gateway): Promise<string> {
  const init = await sendRpc(gateway, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "integration-test", version: "0.0.0" },
  });
  const p = init.payload as JsonRpcResponse;
  expect(p.result?.serverInfo).toMatchObject({ name: "agent-commerce-gateway" });
  const sid = init.sessionId;
  if (!sid) throw new Error("initialize did not return a session id");
  return sid;
}

async function startGateway(opts: { provider?: Gateway["provider"] } = {}) {
  const gateway = await createGateway({
    config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
    ...(opts.provider ? { provider: opts.provider } : {}),
  });
  return gateway;
}

describe("MCP protocol over Streamable HTTP", () => {
  it("initialize handshake returns a session and server identity", async () => {
    const gateway = await startGateway();
    const init = await sendRpc(gateway, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    const p = init.payload as JsonRpcResponse;
    expect(p.error).toBeUndefined();
    expect(p.result?.serverInfo).toMatchObject({
      name: "agent-commerce-gateway",
    });
    expect((p.result?.capabilities as { tools?: unknown })?.tools).toBeDefined();
    expect(init.sessionId).toBeTruthy();
    await gateway.mcp.close();
  });

  it("tools/list returns only the merchant's supported tools", async () => {
    const gateway = await startGateway();
    const sid = await newSession(gateway);
    const list = await sendRpc(gateway, "tools/list", {}, sid);
    const names = ((list.payload as JsonRpcResponse).result?.tools as Array<{ name: string }>).map(
      (t) => t.name,
    );
    expect(names).toEqual([
      "search_catalog",
      "get_product",
      "get_variant",
      "check_availability",
      "get_offer",
    ]);
    await gateway.mcp.close();
  });

  it("tools/call search_catalog returns structured results", async () => {
    const gateway = await startGateway();
    const sid = await newSession(gateway);
    const call = await sendRpc(
      gateway,
      "tools/call",
      { name: "search_catalog", arguments: { query: "necklace", inStockOnly: true } },
      sid,
    );
    const result = (call.payload as JsonRpcResponse).result as {
      content: Array<{ type: string; text: string }>;
      structuredContent?: { items?: unknown[] };
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("product(s) matched");
    expect(result.structuredContent).toBeDefined();
    await gateway.mcp.close();
  });

  it("invalid tool arguments produce an isError result", async () => {
    const gateway = await startGateway();
    const sid = await newSession(gateway);
    const call = await sendRpc(
      gateway,
      "tools/call",
      { name: "get_product", arguments: { productId: 12345 } },
      sid,
    );
    const result = (call.payload as JsonRpcResponse).result as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("INVALID_ARGUMENT");
    await gateway.mcp.close();
  });

  it("unknown product id returns a NOT_FOUND tool error", async () => {
    const gateway = await startGateway();
    const sid = await newSession(gateway);
    const call = await sendRpc(
      gateway,
      "tools/call",
      { name: "get_product", arguments: { productId: "nope-999" } },
      sid,
    );
    const result = (call.payload as JsonRpcResponse).result as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("NOT_FOUND");
    await gateway.mcp.close();
  });

  it("unknown tool name is rejected", async () => {
    const gateway = await startGateway();
    const sid = await newSession(gateway);
    const call = await sendRpc(gateway, "tools/call", { name: "complete_checkout", arguments: {} }, sid);
    const result = (call.payload as JsonRpcResponse).result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Unknown tool");
    await gateway.mcp.close();
  });

  it("maps a merchant backend 500 to a tool error", async () => {
    const provider = createMockCommerceProvider({ faultIds: { "neck-anniversary": "http500" } });
    const gateway = await startGateway({ provider });
    const sid = await newSession(gateway);
    const call = await sendRpc(
      gateway,
      "tools/call",
      { name: "get_product", arguments: { productId: "neck-anniversary" } },
      sid,
    );
    const result = (call.payload as JsonRpcResponse).result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("BACKEND_ERROR");
    await gateway.mcp.close();
  });

  it("maps a merchant timeout to a tool error", async () => {
    const provider = createMockCommerceProvider({ faultIds: { "neck-anniversary": "timeout" } });
    const gateway = await startGateway({ provider });
    const sid = await newSession(gateway);
    const call = await sendRpc(
      gateway,
      "tools/call",
      { name: "check_availability", arguments: { productId: "neck-anniversary" } },
      sid,
    );
    const result = (call.payload as JsonRpcResponse).result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("BACKEND_ERROR");
    await gateway.mcp.close();
  });

  it("enforces the merchant rate limit across calls", async () => {
    const provider = createMockCommerceProvider({ rateLimitAfter: 4 });
    const gateway = await startGateway({ provider });
    const sid = await newSession(gateway);
    for (let i = 0; i < 4; i += 1) {
      await sendRpc(gateway, "tools/call", { name: "search_catalog", arguments: { limit: 1 } }, sid);
    }
    const call = await sendRpc(gateway, "tools/call", { name: "search_catalog", arguments: {} }, sid);
    const result = (call.payload as JsonRpcResponse).result as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("RATE_LIMITED");
    await gateway.mcp.close();
  });

  it("returns 404 for a request with an unknown session id", async () => {
    const gateway = await startGateway();
    const res = await gateway.app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "mcp-session-id": "bogus-session" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(404);
    await gateway.mcp.close();
  });
});

describe("gateway HTTP surfaces", () => {
  it("serves healthz and the service index", async () => {
    const gateway = await startGateway();
    const health = await gateway.app.request("/healthz");
    expect(health.status).toBe(200);
    expect((await health.json()).status).toBe("ok");

    const index = await gateway.app.request("/");
    const body = (await index.json()) as { endpoints: Record<string, string>; capabilities: string[] };
    expect(body.endpoints.mcp).toContain("/mcp");
    expect(body.capabilities).toEqual(["catalog", "inventory", "pricing"]);
    await gateway.mcp.close();
  });

  it("serves valid agents.md and llms.txt", async () => {
    const gateway = await startGateway();
    const agents = await gateway.app.request("/agents.md");
    expect(agents.status).toBe(200);
    expect(agents.headers.get("content-type")).toContain("text/markdown");
    const agentsText = await agents.text();
    expect(agentsText).toContain("# Aarna Jewels — Agent Instructions");

    const llms = await gateway.app.request("/llms.txt");
    expect(llms.status).toBe(200);
    expect(await llms.text()).toContain("# Aarna Jewels");
    await gateway.mcp.close();
  });

  it("serves read-only catalog search over HTTP", async () => {
    const gateway = await startGateway();
    const res = await gateway.app.request("/catalog/search?category=Necklaces&limit=50");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; items: Array<{ category: string }> };
    expect(body.total).toBeGreaterThan(0);
    for (const item of body.items) expect(item.category).toBe("Necklaces");
    await gateway.mcp.close();
  });

  it("returns 404 JSON for a missing product", async () => {
    const gateway = await startGateway();
    const res = await gateway.app.request("/catalog/products/missing-xyz");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    await gateway.mcp.close();
  });
});

describe("second merchant with a different shape", () => {
  it("a catalog-only provider advertises only catalog tools", async () => {
    // Proof the gateway surfaces follow the provider's capability graph: this
    // "second merchant" exposes only merchant() + catalog, so tools/list must
    // not advertise check_availability/get_offer and calling one must fail.
    const inner = createMockCommerceProvider({ storeUrl: "https://second.example" });
    const catalogOnly = {
      id: "second-merchant",
      merchant: async () => ({
        id: "m-second",
        name: "Second Merchant (catalog only)",
        defaultCurrency: "INR",
      }),
      catalog: inner.catalog,
    } as unknown as CommerceProvider;

    const gateway = await createGateway({
      config: { port: 0, baseUrl: "https://second.example", storeUrl: "https://second.example" },
      provider: catalogOnly,
    });
    const sid = await newSession(gateway);
    const list = await sendRpc(gateway, "tools/list", {}, sid);
    const names = ((list.payload as JsonRpcResponse).result?.tools as Array<{ name: string }>).map(
      (t) => t.name,
    );
    expect(names).toEqual(["search_catalog", "get_product", "get_variant"]);

    const call = await sendRpc(
      gateway,
      "tools/call",
      { name: "get_offer", arguments: { productId: "neck-anniversary" } },
      sid,
    );
    const result = (call.payload as JsonRpcResponse).result as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("UNSUPPORTED_CAPABILITY");
    await gateway.mcp.close();
  });
});
