import { afterEach, describe, expect, it } from "vitest";
import type { Money } from "@agentify/canonical-commerce";
import {
  RestCommerceProvider,
  buildSecondStoreConfig,
  createFixtureStoreServer,
  FIXTURE_TOKEN,
  type FixtureStore,
  validateRestConfig,
} from "../src/index.js";
import { runCommerceProviderContractSuite } from "../../../tests/contracts/contract-suite.js";

const inr = (amountMajor: number): Money => ({ amount: Math.round(amountMajor * 100), currency: "INR" });

let openStores: FixtureStore[] = [];

async function startStore(opts: { latencyMs?: number; auth?: boolean } = {}): Promise<{
  store: FixtureStore;
  provider: RestCommerceProvider;
}> {
  const store = await createFixtureStoreServer(opts);
  openStores.push(store);
  const provider = new RestCommerceProvider(
    buildSecondStoreConfig({ baseUrl: store.baseUrl, token: FIXTURE_TOKEN }),
  );
  return { store, provider };
}

afterEach(async () => {
  await Promise.all(openStores.map((s) => s.close()));
  openStores = [];
});

describe("adapter-rest — mapping + canonical output (Shape B/C merchant)", () => {
  it("normalizes product ids, money (major→minor) and inventory", async () => {
    const { provider } = await startStore();
    const product = await provider.catalog.getProduct("sl-pendant");
    expect(product.id).toBe("sl-pendant");
    expect(product.title).toBe("Moonstone Pendant Necklace");
    expect(product.brand).toBe("Luna & Co");
    expect(product.attributes.material).toBe("Sterling Silver");

    const variant = product.variants[0]!;
    expect(variant.id).toBe("v-sl-pendant-silver");
    expect(variant.productId).toBe("sl-pendant");
    expect(variant.sku).toBe("LUNA-MOON-1");
    expect(variant.pricing.listPrice).toEqual(inr(3400)); // mrp 3400 major
    expect(variant.pricing.salePrice).toEqual(inr(2890)); // selling_price
    expect(variant.availability).toMatchObject({ status: "in_stock", quantity: 14 });
  });

  it("maps out-of-stock inventory objects", async () => {
    const { provider } = await startStore();
    const product = await provider.catalog.getProduct("sl-bangle-stack");
    const variant = product.variants[0]!;
    expect(variant.availability).toMatchObject({ status: "out_of_stock", quantity: 0 });
  });

  it("reads a multi-variant product", async () => {
    const { provider } = await startStore();
    const product = await provider.catalog.getProduct("sl-chain-minimal");
    expect(product.variants).toHaveLength(2);
    expect(product.variants.map((v) => v.id)).toEqual(["v-sl-chain-40cm", "v-sl-chain-45cm"]);
  });

  it("searches and computes canonical summaries from search rows", async () => {
    const { provider } = await startStore();
    const result = await provider.catalog.search({ query: "Moonstone", limit: 20 });
    expect(result.total).toBeGreaterThan(0);
    const hit = result.items.find((i) => i.id === "sl-pendant")!;
    expect(hit.inStock).toBe(true);
    expect(hit.priceFrom).toEqual(inr(2890));
    expect(hit.listPrice).toEqual(inr(3400));
    expect(hit.hasDiscount).toBe(true);
  });

  it("searches by category and respects pagination", async () => {
    const { provider } = await startStore();
    const all = await provider.catalog.search({ category: "Earrings", limit: 50 });
    expect(all.items.map((i) => i.id).sort()).toEqual(["sl-earcuffs", "sl-hoops"]);

    const pageA = await provider.catalog.search({ limit: 2, page: 1 });
    const pageB = await provider.catalog.search({ limit: 2, page: 2 });
    expect(pageA.hasMore).toBe(true);
    const idsA = new Set(pageA.items.map((i) => i.id));
    for (const item of pageB.items) expect(idsA.has(item.id)).toBe(false);
  });

  it("applies in-stock and price filters locally", async () => {
    const { provider } = await startStore();
    const inStock = await provider.catalog.search({ filters: { inStock: true }, limit: 50 });
    expect(inStock.items.map((i) => i.id)).not.toContain("sl-bangle-stack");

    const budget = await provider.catalog.search({
      filters: { priceMax: inr(2000) },
      limit: 50,
    });
    expect(budget.items.map((i) => i.id)).toContain("sl-ring-luna"); // 1600
    expect(budget.items.map((i) => i.id)).not.toContain("sl-chain-minimal"); // 2200
  });

  it("returns a live offer for a variant", async () => {
    const { provider } = await startStore();
    const offer = await provider.pricing.getOffer({ variantId: "v-sl-pendant-silver" });
    expect(offer.productId).toBe("sl-pendant");
    expect(offer.productTitle).toBe("Moonstone Pendant Necklace");
    expect(offer.sku).toBe("LUNA-MOON-1");
    expect(offer.price).toEqual(inr(2890));
    expect(offer.originalPrice).toEqual(inr(3400));
    expect(offer.availability).toMatchObject({ status: "in_stock", quantity: 14 });
  });

  it("returns an offer with no discount when list == sale", async () => {
    const { provider } = await startStore();
    const offer = await provider.pricing.getOffer({ variantId: "v-sl-chain-40cm" });
    expect(offer.price).toEqual(inr(2200));
    expect(offer.originalPrice).toBeUndefined();
    expect(offer.discounts).toEqual([]);
  });

  it("checks live inventory via the stock endpoint", async () => {
    const { provider } = await startStore();
    const avail = await provider.inventory!.check({ variantId: "v-sl-hoops-30" });
    expect(avail).toMatchObject({ status: "in_stock", quantity: 20 });
  });
});

describe("adapter-rest — HTTP failure translation", () => {
  it("maps 404 to NOT_FOUND", async () => {
    const { provider } = await startStore();
    await expect(provider.catalog.getProduct("missing-xyz")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(provider.catalog.getVariant("missing-xyz")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("maps backend 500 to BACKEND_ERROR", async () => {
    const { provider } = await startStore();
    await expect(provider.catalog.getProduct("err-500-prod")).rejects.toMatchObject({
      code: "BACKEND_ERROR",
    });
  });

  it("maps 403/401 to BACKEND_UNAUTHORIZED", async () => {
    const { provider } = await startStore();
    await expect(provider.catalog.getProduct("err-403-prod")).rejects.toMatchObject({
      code: "BACKEND_UNAUTHORIZED",
    });
  });

  it("maps 429 to RATE_LIMITED", async () => {
    const { provider } = await startStore();
    await expect(provider.catalog.getProduct("err-429-prod")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("maps invalid JSON bodies to BACKEND_ERROR", async () => {
    const { provider } = await startStore();
    await expect(provider.catalog.getProduct("err-invalid-prod")).rejects.toMatchObject({
      code: "BACKEND_ERROR",
    });
  });

  it("maps request timeouts to BACKEND_TIMEOUT", async () => {
    const { store } = await startStore({ latencyMs: 400 });
    const provider = new RestCommerceProvider(
      buildSecondStoreConfig({ baseUrl: store.baseUrl, token: FIXTURE_TOKEN }),
    );
    // override timeout: construct a provider with a short timeout via raw config
    const cfg = buildSecondStoreConfig({ baseUrl: store.baseUrl, token: FIXTURE_TOKEN });
    cfg.http.timeoutMs = 60;
    const fast = new RestCommerceProvider(cfg);
    await expect(fast.catalog.getProduct("sl-pendant")).rejects.toMatchObject({
      code: "BACKEND_TIMEOUT",
    });
    void provider;
  });

  it("maps wrong credentials to BACKEND_UNAUTHORIZED", async () => {
    const store = await createFixtureStoreServer();
    openStores.push(store);
    const provider = new RestCommerceProvider(
      buildSecondStoreConfig({ baseUrl: store.baseUrl, token: "wrong-token" }),
    );
    await expect(provider.catalog.search({})).rejects.toMatchObject({
      code: "BACKEND_UNAUTHORIZED",
    });
  });
});

describe("adapter-rest — configuration validation", () => {
  it("fails startup for a malformed config", () => {
    const bad = {
      id: "bad",
      merchant: { name: "Bad", defaultCurrency: "INR" },
      http: { baseUrl: "not-a-url" },
      catalog: { search: {}, productUrl: "", variantUrl: "" },
      mappings: { product: { id: "", title: "" } },
    };
    const errors = validateRestConfig(bad as never);
    expect(errors.length).toBeGreaterThan(0);
    expect(() => new RestCommerceProvider(bad as never)).toThrow(/Invalid REST adapter configuration/);
  });

  it("accepts a valid second-store config", () => {
    const errors = validateRestConfig(
      buildSecondStoreConfig({ baseUrl: "http://localhost:1", token: "x" }),
    );
    expect(errors).toEqual([]);
  });
});

describe("adapter-rest — contract suite", () => {
  runCommerceProviderContractSuite("adapter-rest (Luna & Co)", {
    create: async () => {
      const { provider } = await startStore();
      return provider;
    },
  });
});
