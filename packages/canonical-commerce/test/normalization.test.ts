import { describe, expect, it } from "vitest";
import {
  availabilityFromSource,
  detectCapabilities,
  normalizeAvailability,
  ProductSchema,
  type CommerceProvider,
} from "../src/index.js";
import { fromMajor } from "../src/money.js";

describe("availability normalization", () => {
  it("normalizes a quantity number", () => {
    expect(normalizeAvailability(12).status).toBe("in_stock");
    expect(normalizeAvailability(12).quantity).toBe(12);
    expect(normalizeAvailability(0).status).toBe("out_of_stock");
    expect(normalizeAvailability(null).status).toBe("unknown");
    expect(normalizeAvailability(-3).quantity).toBe(0);
  });

  it("respects an explicit status override", () => {
    const a = normalizeAvailability(12, "limited");
    expect(a.status).toBe("limited");
    expect(a.quantity).toBe(12);
    expect(normalizeAvailability(undefined, "unknown").status).toBe("unknown");
  });

  it("maps source shapes: boolean, string, object, number", () => {
    expect(availabilityFromSource(true).status).toBe("in_stock");
    expect(availabilityFromSource(false).status).toBe("out_of_stock");
    expect(availabilityFromSource("in_stock").status).toBe("in_stock");
    expect(availabilityFromSource("out_of_stock").status).toBe("out_of_stock");
    expect(availabilityFromSource({ available: true, quantity: 12 })).toMatchObject({
      status: "in_stock",
      quantity: 12,
    });
    expect(availabilityFromSource({ available: false })).toMatchObject({
      status: "out_of_stock",
    });
    expect(availabilityFromSource("gibberish").status).toBe("unknown");
  });
});

describe("product schema", () => {
  it("rejects a variant referencing a different product", () => {
    const raw = {
      id: "p1",
      title: "Bad",
      variants: [
        {
          id: "v1",
          productId: "p2",
          pricing: { listPrice: { amount: 100, currency: "INR" } },
          availability: { status: "in_stock" },
        },
      ],
    };
    const parsed = ProductSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed product with variants", () => {
    const product = ProductSchema.parse({
      id: "p1",
      title: "Gold Necklace",
      category: "Necklaces",
      attributes: { material: "Gold", occasions: ["anniversary", "wedding"] },
      variants: [
        {
          id: "v1",
          productId: "p1",
          sku: "N1",
          attributes: { purity: "22K" },
          pricing: { listPrice: { amount: 499900, currency: "INR" } },
          availability: { status: "in_stock", quantity: 4 },
        },
      ],
    });
    expect(product.variants[0]?.sku).toBe("N1");
    expect(product.attributes.occasions).toEqual(["anniversary", "wedding"]);
  });
});

describe("capability detection", () => {
  function provider(overrides: Partial<CommerceProvider> = {}): CommerceProvider {
    const base: CommerceProvider = {
      id: "p",
      merchant: async () => ({ id: "m", name: "M", defaultCurrency: "INR" }),
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
      pricing: { getOffer: async () => {
        throw new Error("unused");
      } },
      ...overrides,
    };
    return base;
  }

  it("detects catalog+inventory+pricing on a queryable provider", () => {
    const caps = detectCapabilities(provider());
    expect(caps).toMatchObject({ catalog: true, inventory: true, pricing: true });
    expect(caps.cart).toBe(false);
    expect(caps.checkout).toBe(false);
    expect(caps.orders).toBe(false);
  });

  it("detects transactional capabilities only when implemented", () => {
    const caps = detectCapabilities(
      provider({
        cart: {
          create: async () => ({ id: "c", status: "active", currency: "INR", items: [], subtotal: fromMajor(0, "INR"), updatedAt: "" }),
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
        },
      }),
    );
    expect(caps.cart).toBe(true);
    expect(caps.checkout).toBe(false);
  });
});
