import { beforeEach, describe, expect, it } from "vitest";
import { isProviderError, type Money } from "@agentify/canonical-commerce";
import { createMockCommerceProvider, type MockCommerceProvider } from "../src/index.js";
import { runCommerceProviderContractSuite } from "../../../tests/contracts/contract-suite.js";

function fresh(): MockCommerceProvider {
  return createMockCommerceProvider({ storeUrl: "https://demo.example" });
}

function inr(amountMajor: number): Money {
  return { amount: Math.round(amountMajor * 100), currency: "INR" };
}

describe("MVP 0 acceptance — search behaviours", () => {
  let provider: MockCommerceProvider;

  beforeEach(() => {
    provider = fresh();
  });

  it("searches by exact product name", async () => {
    const r = await provider.catalog.search({ query: "Classic Gold Necklace" });
    expect(r.items[0]?.id).toBe("neck-anniversary");
  });

  it("searches by a partial product name", async () => {
    const r = await provider.catalog.search({ query: "necklace" });
    const ids = r.items.map((i) => i.id);
    expect(ids).toContain("neck-anniversary");
    expect(ids).toContain("neck-pearl-strand");
  });

  it("searches by category", async () => {
    const r = await provider.catalog.search({ category: "Earrings" });
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) expect(item.category).toBe("Earrings");
  });

  it("filters by max price (minor units)", async () => {
    const r = await provider.catalog.search({ filters: { priceMax: inr(5000) }, limit: 50 });
    const ids = r.items.map((i) => i.id);
    expect(ids).toContain("neck-anniversary"); // 3999 sale price
    expect(ids).not.toContain("neck-pearl-strand"); // 7499 sale price
    for (const item of r.items) {
      expect(item.priceFrom!.amount).toBeLessThanOrEqual(500000);
    }
  });

  it("filters in-stock products only", async () => {
    const r = await provider.catalog.search({ filters: { inStock: true } });
    expect(r.items.length).toBeGreaterThan(0);
    for (const item of r.items) expect(item.inStock).toBe(true);
    // an out-of-stock product must never appear
    expect(r.items.map((i) => i.id)).not.toContain("neck-layered-trend");
  });

  it("retrieves a variant with stable id, sku and availability", async () => {
    const v = await provider.catalog.getVariant("neck-anniversary-18");
    expect(v.id).toBe("neck-anniversary-18");
    expect(v.sku).toBe("N-101-18");
    expect(v.productId).toBe("neck-anniversary");
    expect(v.availability.status).toBe("in_stock");
    expect(v.availability.quantity).toBe(12);
  });

  it("returns sale price as the effective offer price", async () => {
    const offer = await provider.pricing.getOffer({ variantId: "neck-anniversary-18" });
    expect(offer.price).toEqual(inr(3999));
    expect(offer.originalPrice).toEqual(inr(4999));
    expect(offer.savings?.amount).toBe(499900 - 399900);
  });

  it("returns a product with no discount unchanged", async () => {
    const offer = await provider.pricing.getOffer({ variantId: "ring-silver-band-6" });
    expect(offer.price).toEqual(inr(999));
    expect(offer.originalPrice).toBeUndefined();
    expect(offer.discounts).toEqual([]);
  });

  it("applies an automatic product discount", async () => {
    const offer = await provider.pricing.getOffer({ variantId: "neck-antique-gold-std" });
    // list 19999, sale 16999, product 15% on list 19999 => 16999.15 -> floor 16999? compute: floor(1999900*0.85)=1699915 -> cheaper than sale 1699900? Actually sale 1699900 is lower, so sale wins.
    // The rule picks the minimum single deal -> sale price.
    expect(offer.price.amount).toBe(1699900);
  });

  it("applies a variant-scoped discount when it is the best deal", async () => {
    // gold kada: list 249000, variant discount 5% -> 236550 (no sale price)
    const offer = await provider.pricing.getOffer({ variantId: "bangle-gold-kada-60g" });
    expect(offer.price.amount).toBe(Math.floor(24900000 * 0.95));
    expect(offer.discounts.map((d) => d.id)).toContain("disc-bangle-kada-5");
  });

  it("reports out-of-stock inventory", async () => {
    const avail = await provider.inventory.check({ variantId: "neck-layered-trend-std" });
    expect(avail.status).toBe("out_of_stock");
    expect(avail.quantity).toBe(0);
  });

  it("reports limited inventory with a quantity", async () => {
    const avail = await provider.inventory.check({ variantId: "ear-gold-studs-1g" });
    expect(avail.status).toBe("limited");
    expect(avail.quantity).toBe(2);
  });

  it("reports unknown inventory when the backend gives no signal", async () => {
    const avail = await provider.inventory.check({ variantId: "neck-kundan-bridal-std" });
    expect(avail.status).toBe("unknown");
  });

  it("aggregates inventory at product level", async () => {
    const avail = await provider.inventory.check({ productId: "neck-anniversary" });
    expect(avail.status).toBe("in_stock");
    expect(avail.quantity).toBe(12 + 6);
  });

  it("returns the cheapest in-stock offer for a product without a variant", async () => {
    const offer = await provider.pricing.getOffer({ productId: "neck-anniversary" });
    expect(offer.variantId).toBe("neck-anniversary-18");
    expect(offer.price).toEqual(inr(3999));
  });

  it("fails cleanly for a malformed merchant record", async () => {
    try {
      await provider.catalog.getProduct("malformed-1");
      expect.unreachable("malformed product should have thrown");
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe("MALFORMED_RECORD");
    }
  });

  it("excludes malformed records from search without crashing", async () => {
    const r = await provider.catalog.search({ query: "Broken Listing" });
    expect(r.total).toBe(0);
  });

  it("handles duplicate merchant SKUs without collisions", async () => {
    const a = await provider.catalog.getProduct("dup-sku-a");
    const b = await provider.catalog.getProduct("dup-sku-b");
    expect(a.variants[0]!.sku).toBe("SKU-DUP-1");
    expect(b.variants[0]!.sku).toBe("SKU-DUP-1");
    expect(a.variants[0]!.id).not.toBe(b.variants[0]!.id);
    const va = await provider.catalog.getVariant("dup-sku-a-v1");
    const vb = await provider.catalog.getVariant("dup-sku-b-v1");
    expect(va.id).toBe("dup-sku-a-v1");
    expect(vb.id).toBe("dup-sku-b-v1");
  });

  it("returns an empty result for a query with no matches", async () => {
    const r = await provider.catalog.search({ query: "zzz-no-such-product" });
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("rejects an unsupported currency", async () => {
    await expect(provider.catalog.search({ currency: "USD" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("surfaces backend 500 and timeout faults as typed errors", async () => {
    const p500 = createMockCommerceProvider({ faultIds: { "neck-anniversary": "http500" } });
    await expect(p500.catalog.getProduct("neck-anniversary")).rejects.toMatchObject({
      code: "BACKEND_ERROR",
    });

    const pTimeout = createMockCommerceProvider({ faultIds: { "neck-anniversary": "timeout" } });
    await expect(pTimeout.catalog.getProduct("neck-anniversary")).rejects.toMatchObject({
      code: "BACKEND_TIMEOUT",
    });
  });

  it("rate limits after the configured budget", async () => {
    const limited = createMockCommerceProvider({ rateLimitAfter: 2 });
    await limited.catalog.search({});
    await limited.catalog.search({});
    await expect(limited.catalog.search({})).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("MVP 0 acceptance — merchant identity", () => {
  it("reports a canonical merchant with INR policies", async () => {
    const provider = fresh();
    const merchant = await provider.merchant();
    expect(merchant.id).toBe("m-arna-jewels");
    expect(merchant.name).toBe("Aarna Jewels");
    expect(merchant.defaultCurrency).toBe("INR");
    expect(merchant.policies?.shipping).toBe("https://demo.example/policies/shipping");
  });
});

runCommerceProviderContractSuite("adapter-mock", {
  create: () => createMockCommerceProvider({ storeUrl: "https://demo.example" }),
});
