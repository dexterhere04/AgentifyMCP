import { describe, expect, it } from "vitest";
import { money } from "../src/money.js";
import { buildOffer, computeBestPrice, type Discount } from "../src/index.js";
import { fromMajor } from "../src/index.js";
import type { Availability } from "../src/index.js";

const pct = (id: string, value: number, extra: Partial<Discount> = {}): Discount => ({
  id,
  type: "automatic",
  value,
  scope: "variant",
  ...extra,
});

const fixed = (id: string, amountMinor: number, currency = "INR"): Discount => ({
  id,
  type: "automatic",
  amount: money(amountMinor, currency),
  scope: "variant",
});

const avail: Availability = { status: "in_stock", quantity: 5 };

describe("computeBestPrice", () => {
  it("returns the list price when no sale or discount applies", () => {
    const d = computeBestPrice(fromMajor(4999, "INR"), undefined, []);
    expect(d.effective.amount).toBe(499900);
    expect(d.appliedDiscountIds).toEqual([]);
    expect(d.savings).toBeUndefined();
  });

  it("prefers a lower sale price", () => {
    const d = computeBestPrice(fromMajor(4999, "INR"), fromMajor(3999, "INR"), []);
    expect(d.effective).toEqual(fromMajor(3999, "INR"));
    expect(d.savings).toEqual(money(499900 - 399900, "INR"));
  });

  it("applies a percentage automatic discount to the list price", () => {
    const d = computeBestPrice(fromMajor(1000, "INR"), undefined, [pct("d1", 10)]);
    expect(d.effective.amount).toBe(100000 - 10000);
    expect(d.appliedDiscountIds).toEqual(["d1"]);
  });

  it("picks the cheapest of sale vs discount, and does not stack", () => {
    const d = computeBestPrice(fromMajor(4999, "INR"), fromMajor(3999, "INR"), [
      pct("d1", 50),
      fixed("d2", 200000, "INR"),
    ]);
    // 50% off list = 249950 paise beats the 3999 sale
    expect(d.effective.amount).toBe(249950);
    expect(d.appliedDiscountIds).toEqual(["d1"]);
  });

  it("ignores coupons during offer computation", () => {
    const d = computeBestPrice(fromMajor(1000, "INR"), undefined, [
      { id: "c1", type: "coupon", code: "SAVE50", scope: "cart", value: 50 },
    ]);
    expect(d.effective).toEqual(fromMajor(1000, "INR"));
    expect(d.appliedDiscountIds).toEqual([]);
  });

  it("ignores expired promotions", () => {
    const expired: Discount = {
      id: "old",
      type: "automatic",
      value: 30,
      scope: "variant",
      validUntil: "2020-01-01T00:00:00.000Z",
    };
    const d = computeBestPrice(fromMajor(1000, "INR"), undefined, [expired], {
      now: "2026-01-01T00:00:00.000Z",
    });
    expect(d.effective).toEqual(fromMajor(1000, "INR"));
  });

  it("never produces a negative effective price", () => {
    const d = computeBestPrice(fromMajor(100, "INR"), undefined, [fixed("d1", 1_000_000)]);
    expect(d.effective.amount).toBe(0);
  });
});

describe("buildOffer", () => {
  it("builds a valid offer with sale price and discount metadata", () => {
    const offer = buildOffer({
      productId: "neck-1",
      variantId: "neck-1-gold",
      productTitle: "Gold Necklace",
      variantTitle: "22K Gold, 18 inch",
      sku: "NECK-1-22K-18",
      listPrice: fromMajor(4999, "INR"),
      salePrice: fromMajor(3999, "INR"),
      discounts: [pct("d1", 20), { id: "c1", type: "coupon", code: "SAVE5", scope: "cart", value: 5 }],
      availability: avail,
      sourceUrl: "https://demo.example/products/neck-1",
    });
    expect(offer.price).toEqual(fromMajor(3999, "INR"));
    expect(offer.listPrice).toEqual(fromMajor(4999, "INR"));
    expect(offer.originalPrice).toEqual(fromMajor(4999, "INR"));
    expect(offer.currency).toBe("INR");
    // coupon not auto-applied
    expect(offer.discounts.map((d) => d.id)).toEqual([]);
  });

  it("surfaces the automatic discount applied", () => {
    const offer = buildOffer({
      productId: "r-1",
      variantId: "r-1",
      productTitle: "Silver Ring",
      listPrice: fromMajor(2000, "INR"),
      discounts: [pct("d1", 10)],
      availability: avail,
    });
    expect(offer.price.amount).toBe(180000);
    expect(offer.discounts.map((d) => d.id)).toEqual(["d1"]);
    expect(offer.savings?.amount).toBe(20000);
  });
});
