import { describe, expect, it } from "vitest";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import { createCommerceMcpServer, toolSpecsToSdkTools, SERVER_NAME } from "../src/index.js";
import { CommerceToolRegistry } from "../src/index.js";

describe("CommerceToolRegistry", () => {
  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });

  it("lists the tools a queryable merchant supports", async () => {
    const registry = new CommerceToolRegistry(provider);
    const tools = registry.list();
    expect(tools.map((t) => t.name)).toEqual([
      "search_catalog",
      "get_product",
      "get_variant",
      "check_availability",
      "get_offer",
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it("serializes tool schemas to JSON Schema for tools/list", () => {
    const registry = new CommerceToolRegistry(provider);
    const sdkTools = toolSpecsToSdkTools(registry.list());
    const search = sdkTools.find((t) => t.name === "search_catalog")!;
    expect(search.inputSchema.type).toBe("object");
    expect(Object.keys(search.inputSchema.properties ?? {})).toContain("query");
  });

  it("searches and returns canonical data", async () => {
    const registry = new CommerceToolRegistry(provider);
    const res = await registry.call("search_catalog", { query: "necklace", inStockOnly: true });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as { items: unknown[] };
      expect(data.items.length).toBeGreaterThan(0);
    }
  });

  it("rejects invalid arguments with a typed error", async () => {
    const registry = new CommerceToolRegistry(provider);
    const res = await registry.call("get_product", { productId: 123 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ARGUMENT");
  });

  it("returns NOT_FOUND for an unknown product", async () => {
    const registry = new CommerceToolRegistry(provider);
    const res = await registry.call("get_product", { productId: "missing-product" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("NOT_FOUND");
  });

  it("rejects unknown tool names", async () => {
    const registry = new CommerceToolRegistry(provider);
    const res = await registry.call("complete_checkout", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ARGUMENT");
  });

  it("maps a merchant 500 into a tool error", async () => {
    const failing = createMockCommerceProvider({ faultIds: { "neck-anniversary": "http500" } });
    const registry = new CommerceToolRegistry(failing);
    const res = await registry.call("get_product", { productId: "neck-anniversary" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("BACKEND_ERROR");
  });
});

describe("createCommerceMcpServer", () => {
  it("creates a named, tools-capable SDK server", () => {
    const provider = createMockCommerceProvider();
    const server = createCommerceMcpServer(provider);
    expect(server).toBeDefined();
    expect(SERVER_NAME).toBe("agent-commerce-gateway");
  });
});
