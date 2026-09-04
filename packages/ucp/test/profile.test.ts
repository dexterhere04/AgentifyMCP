import { describe, expect, it } from "vitest";
import type { Capabilities } from "@agentify/canonical-commerce";
import {
  UCP_CAPABILITY_CART,
  UCP_CAPABILITY_CATALOG_LOOKUP,
  UCP_CAPABILITY_CATALOG_SEARCH,
  UCP_CAPABILITY_CHECKOUT,
  UCP_CAPABILITY_ORDER,
  buildUcpProfile,
  serializeUcpProfile,
  validateUcpProfile,
} from "../src/index.js";

const FULL_CAPS: Capabilities = {
  catalog: true,
  inventory: true,
  pricing: true,
  cart: true,
  checkout: true,
  orders: true,
  recommendations: true,
};

const CATALOG_CAPS: Capabilities = {
  catalog: true,
  inventory: true,
  pricing: true,
  cart: false,
  checkout: false,
  orders: false,
  recommendations: false,
};

function base(caps: Capabilities, extra: Record<string, unknown> = {}) {
  return buildUcpProfile({ capabilities: caps, baseUrl: "https://demo.example", ...extra });
}

describe("buildUcpProfile", () => {
  it("produces a document with a valid protocol version", () => {
    const profile = base(CATALOG_CAPS);
    expect(profile.ucp.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(validateUcpProfile(profile)).toEqual([]);
  });

  it("advertises the MCP transport binding with a correct endpoint", () => {
    const profile = base(CATALOG_CAPS, { mcpPath: "/mcp" });
    const shopping = profile.ucp.services["dev.ucp.shopping"]!;
    expect(shopping.length).toBe(1);
    expect(shopping[0]).toMatchObject({
      transport: "mcp",
      endpoint: "https://demo.example/mcp",
      version: profile.ucp.version,
    });
  });

  it("only advertises the catalog capabilities a catalog merchant supports", () => {
    const profile = base(CATALOG_CAPS);
    const ids = Object.keys(profile.ucp.capabilities).sort();
    expect(ids).toEqual(
      [UCP_CAPABILITY_CATALOG_SEARCH, UCP_CAPABILITY_CATALOG_LOOKUP].sort(),
    );
    expect(profile.ucp.capabilities[UCP_CAPABILITY_CART]).toBeUndefined();
    expect(profile.ucp.capabilities[UCP_CAPABILITY_CHECKOUT]).toBeUndefined();
    expect(profile.ucp.capabilities[UCP_CAPABILITY_ORDER]).toBeUndefined();
  });

  it("advertises cart/checkout/order only when the provider implements them", () => {
    const profile = base(FULL_CAPS);
    const ids = Object.keys(profile.ucp.capabilities).sort();
    expect(ids).toEqual(
      [
        UCP_CAPABILITY_CATALOG_SEARCH,
        UCP_CAPABILITY_CATALOG_LOOKUP,
        UCP_CAPABILITY_CART,
        UCP_CAPABILITY_CHECKOUT,
        UCP_CAPABILITY_ORDER,
      ].sort(),
    );
  });

  it("always includes the required payment_handlers member (empty for now)", () => {
    const profile = base(CATALOG_CAPS);
    expect(profile.ucp.payment_handlers).toEqual({});
  });

  it("serializes to pretty JSON ending in a newline", () => {
    const text = serializeUcpProfile(base(CATALOG_CAPS));
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text) as { ucp: { version: string } };
    expect(parsed.ucp.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("configuration validation", () => {
  it("fails startup for a malformed base URL", () => {
    expect(() => base(CATALOG_CAPS, { baseUrl: "not a url" })).toThrow();
    expect(() => base(CATALOG_CAPS, { baseUrl: "https://example.com/some/path" })).toThrow();
  });

  it("fails startup for an invalid protocol version", () => {
    expect(() => base(CATALOG_CAPS, { version: "v1" })).toThrow(/YYYY-MM-DD/);
  });

  it("fails startup when a public origin is not served over HTTPS", () => {
    expect(() =>
      buildUcpProfile({ capabilities: CATALOG_CAPS, baseUrl: "http://shop.example.com" }),
    ).toThrow(/HTTPS/);
  });

  it("permits http for localhost development", () => {
    const profile = buildUcpProfile({
      capabilities: CATALOG_CAPS,
      baseUrl: "http://localhost:8787",
    });
    expect(profile.ucp.services["dev.ucp.shopping"]![0]!.endpoint).toBe(
      "http://localhost:8787/mcp",
    );
  });
});

describe("validateUcpProfile", () => {
  it("rejects a capability advertised without a parent service", () => {
    const profile = base(CATALOG_CAPS) as Record<string, unknown>;
    const ucp = profile.ucp as Record<string, unknown>;
    // Remove the advertised service but keep the capabilities: the document is
    // now internally inconsistent and must fail validation.
    ucp.services = {};
    const problems = validateUcpProfile(profile);
    expect(problems.some((p) => p.code === "CAPABILITY_MISMATCH")).toBe(true);
  });

  it("rejects documents that are missing the ucp envelope", () => {
    const problems = validateUcpProfile({ hello: "world" });
    expect(problems.some((p) => p.code === "INVALID_SCHEMA")).toBe(true);
  });

  it("rejects an invalid capability version", () => {
    const profile = base(CATALOG_CAPS);
    profile.ucp.capabilities[UCP_CAPABILITY_CATALOG_SEARCH]![0]!.version = "2026";
    const problems = validateUcpProfile(profile);
    expect(problems.some((p) => p.message.includes("version"))).toBe(true);
  });
});
