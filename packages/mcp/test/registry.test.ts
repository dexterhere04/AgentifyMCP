import { describe, expect, it } from "vitest";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import { createCommerceMcpServer, toolSpecsToSdkTools, SERVER_NAME } from "../src/index.js";
import { CommerceToolRegistry } from "../src/index.js";

const AGENT = "https://agent.example/.well-known/ucp";

const EXPECTED_FULL_LIST = [
  "search_catalog",
  "get_product",
  "get_variant",
  "check_availability",
  "get_offer",
  "create_cart",
  "get_cart",
  "add_to_cart",
  "update_cart_item",
  "remove_from_cart",
  "create_checkout",
  "get_checkout",
  "complete_checkout",
  "cancel_checkout",
  "get_order",
];

describe("CommerceToolRegistry", () => {
  const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });

  it("lists the tools a full merchant supports (catalog + cart + checkout)", async () => {
    const registry = new CommerceToolRegistry(provider);
    const tools = registry.list();
    expect(tools.map((t) => t.name)).toEqual(EXPECTED_FULL_LIST);
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
    // transactional tools advertise the ucp-agent negotiation field
    const add = sdkTools.find((t) => t.name === "add_to_cart")!;
    expect((add.inputSchema.properties ?? {}).meta).toBeDefined();
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
    const res = await registry.call("get_refund", {});
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

  it("requires meta.ucp-agent.profile on cart tools", async () => {
    const registry = new CommerceToolRegistry(provider);
    const res = await registry.call("create_cart", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ARGUMENT");
  });

  it("runs a cart + checkout flow when meta.ucp-agent is supplied", async () => {
    const registry = new CommerceToolRegistry(provider);
    const meta = { "ucp-agent": { profile: AGENT } };

    const created = await registry.call("create_cart", { meta });
    expect(created.ok).toBe(true);
    const cartId = created.ok ? (created.data as { id: string }).id : "";

    const added = await registry.call("add_to_cart", {
      meta,
      cartId,
      variantId: "neck-anniversary-18",
      quantity: 2,
    });
    expect(added.ok).toBe(true);
    if (added.ok) {
      const data = added.data as { items: Array<{ quantity: number }>; subtotal: { amount: number } };
      expect(data.items[0]!.quantity).toBe(2);
      expect(data.subtotal.amount).toBe(2 * 399900);
      expect(added.agentProfile).toBe(AGENT);
    }

    const chk = await registry.call("create_checkout", { meta, cartId });
    expect(chk.ok).toBe(true);
    const checkoutId = chk.ok ? (chk.data as { id: string }).id : "";

    const completed = await registry.call("complete_checkout", {
      meta,
      checkoutId,
      approval: { buyerApproved: true },
    });
    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect((completed.data as { status: string }).status).toBe("confirmed");
      expect(completed.agentProfile).toBe(AGENT);
    }
  });

  it("rejects completing a checkout without buyer approval", async () => {
    const registry = new CommerceToolRegistry(provider);
    const meta = { "ucp-agent": { profile: AGENT } };
    const cart = await registry.call("create_cart", { meta });
    const cartId = cart.ok ? (cart.data as { id: string }).id : "";
    await registry.call("add_to_cart", { meta, cartId, variantId: "neck-anniversary-18", quantity: 1 });
    const chk = await registry.call("create_checkout", { meta, cartId });
    const checkoutId = chk.ok ? (chk.data as { id: string }).id : "";
    const res = await registry.call("complete_checkout", { meta, checkoutId, approval: { buyerApproved: false } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("INVALID_ARGUMENT");
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
