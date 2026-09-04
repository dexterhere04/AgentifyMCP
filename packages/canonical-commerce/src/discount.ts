import { z } from "zod";
import { MoneySchema, type Money } from "./money.js";

/**
 * Canonical discount model.
 *
 * Discounts must distinguish (architecture doc section 3.2):
 * - automatic discounts (applied by the merchant without a code)
 * - coupon / code discounts (require an explicit code to apply)
 * - percentage discounts
 * - fixed-value discounts
 */

export const DiscountTypeSchema = z.enum(["percentage", "fixed", "coupon", "automatic"]);

export type DiscountType = z.infer<typeof DiscountTypeSchema>;

/** When a discount legally applies. Defaults to the whole order/cart scope. */
export const DiscountScopeSchema = z.enum(["variant", "product", "cart", "order"]);

export type DiscountScope = z.infer<typeof DiscountScopeSchema>;

export const DiscountSchema = z
  .object({
    id: z.string().min(1),
    type: DiscountTypeSchema,
    scope: DiscountScopeSchema.default("cart"),
    /** Percentage value when type is "percentage" (0 < value <= 100). */
    value: z.number().positive().max(100).optional(),
    /** Fixed monetary amount when type is "fixed". */
    amount: MoneySchema.optional(),
    /** Required redemption code when type is "coupon". */
    code: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.type === "percentage" && d.value === undefined) {
      ctx.addIssue({ code: "custom", message: "percentage discount requires a value", path: ["value"] });
    }
    if (d.type === "fixed" && d.amount === undefined) {
      ctx.addIssue({ code: "custom", message: "fixed discount requires an amount", path: ["amount"] });
    }
    if (d.type === "coupon" && !d.code) {
      ctx.addIssue({ code: "custom", message: "coupon discount requires a code", path: ["code"] });
    }
    if (d.type === "automatic" && d.value === undefined && d.amount === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "automatic discount requires a value or amount",
        path: ["value"],
      });
    }
  });

export type Discount = z.infer<typeof DiscountSchema>;

export function isDiscountActive(discount: Discount, now: string = new Date().toISOString()): boolean {
  const nowMs = Date.parse(now);
  if (discount.validFrom && Date.parse(discount.validFrom) > nowMs) return false;
  if (discount.validUntil && Date.parse(discount.validUntil) <= nowMs) return false;
  return true;
}

/**
 * Compute the discounted amount for a list price under a single discount.
 * Only variant- and product-level automatic discounts reduce an offer price;
 * coupons and cart/order-scoped discounts are handled at cart time.
 * Returns null when the discount does not apply.
 */
export function applyDiscountToMoney(
  listPrice: Money,
  discount: Discount,
): Money | null {
  if (discount.type === "coupon") return null;
  if (discount.scope !== "variant" && discount.scope !== "product") return null;

  let resultMinor: number | null = null;
  if (discount.type === "percentage" && discount.value !== undefined) {
    resultMinor = Math.floor(listPrice.amount * (1 - discount.value / 100));
  } else if (discount.type === "fixed" && discount.amount) {
    if (discount.amount.currency !== listPrice.currency) return null;
    resultMinor = listPrice.amount - discount.amount.amount;
  } else if (discount.type === "automatic") {
    if (discount.value !== undefined) {
      resultMinor = Math.floor(listPrice.amount * (1 - discount.value / 100));
    } else if (discount.amount && discount.amount.currency === listPrice.currency) {
      resultMinor = listPrice.amount - discount.amount.amount;
    }
  }

  if (resultMinor === null) return null;
  if (resultMinor < 0) resultMinor = 0;
  return { amount: resultMinor, currency: listPrice.currency };
}
