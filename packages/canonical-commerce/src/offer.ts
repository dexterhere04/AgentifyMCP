import { z } from "zod";
import { AvailabilitySchema, type Availability } from "./availability.js";
import {
  applyDiscountToMoney,
  isDiscountActive,
  type Discount,
} from "./discount.js";
import {
  assertSameCurrency,
  money,
  MoneySchema,
  type Money,
} from "./money.js";

/**
 * Canonical offer model.
 *
 * An Offer is the *live, merchant-verified* statement of what a buyer would
 * pay right now for a specific product/variant, including applicable
 * automatic discounts. Search may be indexed, but availability and final
 * price must be verified live before purchase (doc section 7).
 */

export const DeliveryEstimateSchema = z
  .object({
    minDays: z.number().int().nonnegative().optional(),
    maxDays: z.number().int().nonnegative().optional(),
    description: z.string().optional(),
  })
  .optional();

export type DeliveryEstimate = z.infer<typeof DeliveryEstimateSchema>;

export const OfferSchema = z
  .object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    productTitle: z.string(),
    variantTitle: z.string().optional(),
    sku: z.string().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    /** Effective price the buyer pays after sale price / automatic discounts. */
    price: MoneySchema,
    /** Merchant list (MRP-style) price. */
    listPrice: MoneySchema,
    /** listPrice when a discount/sale is active; otherwise undefined. */
    originalPrice: MoneySchema.optional(),
    /** Automatic (always-on) discounts currently reducing the price. */
    discounts: z.array(z.object({ id: z.string(), title: z.string().optional(), description: z.string().optional() })).default([]),
    savings: MoneySchema.optional(),
    availability: AvailabilitySchema,
    delivery: DeliveryEstimateSchema,
    sourceUrl: z.string().optional(),
    image: z.string().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type Offer = z.infer<typeof OfferSchema>;

export interface OfferInput {
  productId?: string;
  variantId?: string;
  currency?: string;
  buyerContext?: unknown;
}

export interface OfferComputationOptions {
  now?: string;
}

export interface PriceDecision {
  effective: Money;
  listPrice: Money;
  originalPrice?: Money;
  savings?: Money;
  appliedDiscountIds: string[];
  reason: string;
}

/**
 * Choose the best price for a single variant given its list price, sale
 * price and the set of applicable variant/product automatic discounts.
 *
 * Rule: the effective price is the minimum of
 *   - the list price,
 *   - the sale price (when present and lower),
 *   - the list price reduced by each applicable *single* automatic discount
 *     (discounts are not stacked in this version).
 *
 * Coupons are never auto-applied; they are surfaced for the cart step.
 */
export function computeBestPrice(
  listPrice: Money,
  salePrice: Money | undefined,
  discounts: Discount[],
  opts: OfferComputationOptions = {},
): PriceDecision {
  const now = opts.now ?? new Date().toISOString();

  const candidates: Array<{ price: Money; reason: string; discountId?: string }> = [
    { price: listPrice, reason: "list price" },
  ];

  if (salePrice) {
    try {
      assertSameCurrency(salePrice, listPrice);
    } catch {
      salePrice = undefined;
    }
    if (salePrice && salePrice.amount < listPrice.amount) {
      candidates.push({ price: salePrice, reason: "sale price" });
    }
  }

  for (const discount of discounts) {
    if (!isDiscountActive(discount, now)) continue;
    const reduced = applyDiscountToMoney(listPrice, discount);
    if (!reduced) continue;
    if (reduced.amount < listPrice.amount) {
      candidates.push({
        price: reduced,
        reason: discount.title ?? describeDiscount(discount),
        discountId: discount.id,
      });
    }
  }

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (candidate.price.amount < best.price.amount) best = candidate;
  }

  const decision: PriceDecision = {
    effective: best.price,
    listPrice,
    appliedDiscountIds: best.discountId ? [best.discountId] : [],
    reason: best.reason,
  };

  if (best.price.amount < listPrice.amount) {
    decision.originalPrice = listPrice;
    decision.savings = money(listPrice.amount - best.price.amount, listPrice.currency);
  }
  return decision;
}

export function describeDiscount(discount: Discount): string {
  switch (discount.type) {
    case "percentage":
      return `${discount.value}% off`;
    case "fixed":
      return discount.amount ? `flat ${discount.amount.amount} off` : "flat off";
    case "coupon":
      return discount.code ? `coupon ${discount.code}` : "coupon";
    case "automatic":
      return discount.title ?? (discount.value ? `${discount.value}% off` : "automatic offer");
  }
}

export interface OfferBuildInput {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle?: string;
  sku?: string;
  listPrice: Money;
  salePrice?: Money;
  discounts: Discount[];
  availability: Availability;
  delivery?: DeliveryEstimate;
  sourceUrl?: string;
  image?: string;
  now?: string;
}

/** Assemble a validated Offer from canonical parts. */
export function buildOffer(input: OfferBuildInput): Offer {
  const decision = computeBestPrice(input.listPrice, input.salePrice, input.discounts, {
    now: input.now,
  });

  const appliedIds = new Set(decision.appliedDiscountIds);
  const discounts = input.discounts
    .filter((d) => appliedIds.has(d.id))
    .map((d) => ({ id: d.id, title: d.title ?? describeDiscount(d), description: d.description }));

  const offer: Offer = {
    productId: input.productId,
    variantId: input.variantId,
    productTitle: input.productTitle,
    ...(input.variantTitle ? { variantTitle: input.variantTitle } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    currency: decision.effective.currency,
    price: decision.effective,
    listPrice: decision.listPrice,
    ...(decision.originalPrice ? { originalPrice: decision.originalPrice } : {}),
    discounts,
    ...(decision.savings ? { savings: decision.savings } : {}),
    availability: input.availability,
    ...(input.delivery ? { delivery: input.delivery } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.image ? { image: input.image } : {}),
    updatedAt: new Date().toISOString(),
  };

  return OfferSchema.parse(offer);
}
