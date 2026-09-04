import { describe, expect, it } from "vitest";
import {
  detectCapabilities,
  type Capabilities,
  type CommerceProvider,
} from "@gateway/canonical-commerce";
import {
  UCP_CAPABILITY_CART,
  UCP_CAPABILITY_CATALOG_LOOKUP,
  UCP_CAPABILITY_CATALOG_SEARCH,
  UCP_CAPABILITY_CHECKOUT,
  UCP_CAPABILITY_ORDER,
  buildUcpProfile,
} from "../src/index.js";

/**
 * Fixture contract: the UCP discovery profile must change exactly with the
 * provider's capability graph — catalog-only, catalog+cart and full merchant
 * must each advertise precisely their own capabilities (doc § MVP 2 contract
 * tests).
 */

function providerWith(methods: Array<"cart" | "checkout" | "orders">): CommerceProvider {
  return {
    id: `fixture-${methods.join("-")}`,
    merchant: async () => ({ id: "m", name: "Fixture", defaultCurrency: "INR" }),
    catalog: {
      search: async () => ({ items: [], total: 0, page: 1, limit: 10, hasMore: false }),
      getProduct: async () => {
        throw new Error("unused");
      },
      getVariant: async () => {
        throw new Error("unused");
      },
    },
    inventory: { check: async () => ({ status: "unknown" }) },
    pricing: {
      getOffer: async () => {
        throw new Error("unused");
      },
    },
    cart: methods.includes("cart")
      ? {
          create: async () => ({ id: "c", status: "active" as const, currency: "INR", items: [], subtotal: { amount: 0, currency: "INR" }, updatedAt: "" }),
          get: async () => {
            throw new Error("unused");
          },
          addItem: async () => {
            throw new Error("unused");
          },
          updateItem: async () => {
            throw new Error("unused");
          },
          removeItem: async () => {
            throw new Error("unused");
          },
        }
      : undefined,
    checkout: methods.includes("checkout")
      ? {
          create: async () => {
            throw new Error("unused");
          },
          get: async () => {
            throw new Error("unused");
          },
          complete: async () => {
            throw new Error("unused");
          },
          cancel: async () => {
            throw new Error("unused");
          },
        }
      : undefined,
    orders: methods.includes("orders")
      ? {
          get: async () => {
            throw new Error("unused");
          },
        }
      : undefined,
  };
}

function advertisedCapabilityIds(caps: Capabilities): string[] {
  return Object.keys(buildUcpProfile({ capabilities: caps, baseUrl: "https://fixture.example" }).ucp.capabilities).sort();
}

describe("UCP profile fixtures follow the provider capability graph", () => {
  it("catalog-only merchant advertises catalog.search + catalog.lookup only", () => {
    const caps = detectCapabilities(providerWith([]));
    expect(caps.cart).toBe(false);
    expect(advertisedCapabilityIds(caps)).toEqual(
      [UCP_CAPABILITY_CATALOG_SEARCH, UCP_CAPABILITY_CATALOG_LOOKUP].sort(),
    );
  });

  it("catalog+cart merchant additionally advertises the cart capability", () => {
    const caps = detectCapabilities(providerWith(["cart"]));
    expect(advertisedCapabilityIds(caps)).toEqual(
      [UCP_CAPABILITY_CATALOG_SEARCH, UCP_CAPABILITY_CATALOG_LOOKUP, UCP_CAPABILITY_CART].sort(),
    );
  });

  it("full merchant advertises catalog, cart, checkout and order", () => {
    const caps = detectCapabilities(providerWith(["cart", "checkout", "orders"]));
    expect(advertisedCapabilityIds(caps)).toEqual(
      [
        UCP_CAPABILITY_CATALOG_SEARCH,
        UCP_CAPABILITY_CATALOG_LOOKUP,
        UCP_CAPABILITY_CART,
        UCP_CAPABILITY_CHECKOUT,
        UCP_CAPABILITY_ORDER,
      ].sort(),
    );
  });
});
