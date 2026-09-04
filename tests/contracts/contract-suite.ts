import { describe, expect, it } from "vitest";
import {
  detectCapabilities,
  isProviderError,
  type CommerceProvider,
} from "@agentify/canonical-commerce";

/**
 * The shared CommerceProvider contract suite (architecture doc section 13).
 *
 * Every adapter must pass the same suite. A new integration is accepted only
 * when it passes here. Tests are written purely against the canonical model so
 * they never depend on a specific merchant's data shape.
 */
export interface ContractSuiteOptions {
  /** Async factory returning a fresh provider per test. */
  create: () => Promise<CommerceProvider> | CommerceProvider;
}

export function runCommerceProviderContractSuite(label: string, options: ContractSuiteOptions): void {
  const { create } = options;

  describe(`CommerceProvider contract suite — ${label}`, () => {
    it("exposes a canonical merchant identity", async () => {
      const provider = await create();
      const merchant = await provider.merchant();
      expect(merchant.id).toBeTruthy();
      expect(merchant.name).toBeTruthy();
      expect(merchant.defaultCurrency).toMatch(/^[A-Z]{3}$/);
      expect(merchant.supportedCurrencies).toContain(merchant.defaultCurrency);
    });

    it("declares catalog capability and detects it", async () => {
      const provider = await create();
      const caps = detectCapabilities(provider);
      expect(caps.catalog).toBe(true);
      expect(caps).toHaveProperty("inventory");
      expect(caps).toHaveProperty("pricing");
    });

    it("searches and returns stable, canonical summaries", async () => {
      const provider = await create();
      const result = await provider.catalog.search({ limit: 20 });
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.id).toBeTruthy();
        expect(item.currency).toMatch(/^[A-Z]{3}$/);
        expect(item.title).toBeTruthy();
        if (item.priceFrom) expect(item.priceFrom.amount).toBeGreaterThanOrEqual(0);
        expect(typeof item.inStock).toBe("boolean");
        expect(item.variantsCount).toBeGreaterThan(0);
      }
    });

    it("returns stable product IDs and valid Money on getProduct", async () => {
      const provider = await create();
      const search = await provider.catalog.search({ limit: 5 });
      const first = search.items[0]!;
      const product = await provider.catalog.getProduct(first.id);
      expect(product.id).toBe(first.id);
      expect(product.variants.length).toBeGreaterThan(0);
      for (const variant of product.variants) {
        expect(variant.productId).toBe(product.id);
        expect(variant.pricing.listPrice.currency).toBe(product.variants[0]!.pricing.listPrice.currency);
        expect(["in_stock", "out_of_stock", "limited", "unknown"]).toContain(
          variant.availability.status,
        );
      }
    });

    it("returns a canonical offer for a retrieved variant", async () => {
      const provider = await create();
      const search = await provider.catalog.search({ limit: 5 });
      const product = await provider.catalog.getProduct(search.items[0]!.id);
      const variant = product.variants[0]!;
      const offer = await provider.pricing.getOffer({ variantId: variant.id });
      expect(offer.variantId).toBe(variant.id);
      expect(offer.productId).toBe(product.id);
      expect(offer.price.amount).toBeGreaterThanOrEqual(0);
      expect(offer.price.currency).toMatch(/^[A-Z]{3}$/);
      expect(offer.availability.status).toBe(variant.availability.status);
    });

    it("fails cleanly for an unknown product id", async () => {
      const provider = await create();
      await expect(provider.catalog.getProduct("missing-product-xyz")).rejects.toMatchObject({
        name: "ProviderError",
        code: "NOT_FOUND",
      });
    });

    it("fails cleanly for an unknown variant id", async () => {
      const provider = await create();
      await expect(provider.catalog.getVariant("missing-variant-xyz")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("paginates deterministically", async () => {
      const provider = await create();
      const pageA = await provider.catalog.search({ limit: 5, page: 1 });
      const pageB = await provider.catalog.search({ limit: 5, page: 2 });
      expect(pageA.items.length).toBeLessThanOrEqual(5);
      expect(pageA.hasMore).toBe(pageA.total > pageA.items.length);
      const idsA = new Set(pageA.items.map((i) => i.id));
      for (const item of pageB.items) {
        expect(idsA.has(item.id)).toBe(false);
      }
    });

    it("surfaces provider errors in a typed, protocol-safe way", async () => {
      const provider = await create();
      try {
        await provider.catalog.getProduct("missing-product-xyz");
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(isProviderError(err)).toBe(true);
        expect((err as { code: string }).code).toBe("NOT_FOUND");
      }
    });
  });
}
