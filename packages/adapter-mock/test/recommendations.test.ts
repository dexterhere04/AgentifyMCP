import { beforeEach, describe, expect, it } from "vitest";
import { createMockCommerceProvider, type MockCommerceProvider } from "../src/index.js";

describe("mock recommendations (upsell + cross-sell)", () => {
  let provider: MockCommerceProvider;
  let cartId: string;

  beforeEach(async () => {
    provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    const cart = await provider.cart!.create({ agentProfile: "agent://x" });
    cartId = cart.id;
    // Classic Gold Necklace 18" @ 3999 sale (20" @ 4399 is the premium sibling)
    await provider.cart!.addItem({ cartId, variantId: "neck-anniversary-18", quantity: 1 });
  });

  it("returns a premium upsell for an in-cart item and never re-suggests it", async () => {
    const recs = await provider.recommendations!.get({ cartId });
    const upsell = recs.find((r) => r.kind === "upsell");
    expect(upsell).toBeDefined();
    expect(upsell!.variantId).toBe("neck-anniversary-20");
    expect(upsell!.price.amount).toBeGreaterThan(399900);
    expect(upsell!.reason.toLowerCase()).toContain("premium");
    expect(recs.some((r) => r.variantId === "neck-anniversary-18")).toBe(false);
  });

  it("suggests in-stock cross-sell items from the same world", async () => {
    const recs = await provider.recommendations!.get({ cartId });
    const cross = recs.filter((r) => r.kind === "cross-sell");
    expect(cross.length).toBeGreaterThan(0);
    for (const r of cross) {
      expect(r.inStock).toBe(true);
      expect(r.productId).not.toBe("neck-anniversary");
    }
  });

  it("honours a hard budget and excludes anything over it", async () => {
    // 3999 * 100 + 1 paise = 400001 — below the 4399 upsell, above most cross-sells
    const recs = await provider.recommendations!.get({ cartId, budgetMinor: 300001 });
    for (const r of recs) expect(r.price.amount).toBeLessThanOrEqual(300001);
  });

  it("returns nothing for an empty cart", async () => {
    const fresh = await provider.cart!.create();
    const recs = await provider.recommendations!.get({ cartId: fresh.id });
    expect(recs).toEqual([]);
  });
});
