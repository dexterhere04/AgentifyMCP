import { z } from "zod";
import { AvailabilitySchema } from "./availability.js";
import { MoneySchema } from "./money.js";

/**
 * Canonical catalog model (architecture doc section 3.2).
 *
 * - Product and variant IDs must remain stable.
 * - Pricing distinguishes list price from effective / sale price.
 * - Source-specific metadata is preserved in `extensions`.
 */

export const MoneySchemaReexport = MoneySchema;

export const VariantPricingSchema = z
  .object({
    listPrice: MoneySchema,
    salePrice: MoneySchema.optional(),
  })
  .strict();

export type VariantPricing = z.infer<typeof VariantPricingSchema>;

export const VariantSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    sku: z.string().optional(),
    title: z.string().optional(),
    attributes: z.record(z.string(), z.string()).default({}),
    pricing: VariantPricingSchema,
    availability: AvailabilitySchema,
    images: z.array(z.string()).default([]),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Variant = z.infer<typeof VariantSchema>;

export const ProductSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    images: z.array(z.string()).default([]),
    attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
    sourceUrl: z.string().optional(),
    variants: z.array(VariantSchema).default([]),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((product, ctx) => {
    for (const variant of product.variants) {
      if (variant.productId !== product.id) {
        ctx.addIssue({
          code: "custom",
          message: `variant ${variant.id} references product ${variant.productId}, expected ${product.id}`,
          path: ["variants"],
        });
      }
    }
  });

export type Product = z.infer<typeof ProductSchema>;

export function parseProduct(raw: unknown): Product {
  return ProductSchema.parse(raw);
}

/** Compute the minimum effective (list or sale) price across variants. */
export function productMinListPrice(product: Product): z.infer<typeof MoneySchema> | null {
  if (product.variants.length === 0) return null;
  const prices = product.variants
    .map((v) => v.pricing.listPrice)
    .sort((a, b) => a.amount - b.amount);
  return prices[0] ?? null;
}

/** Whether any variant is currently in stock (in_stock or limited). */
export function productHasAvailability(product: Product, statuses?: Array<string>): boolean {
  const wanted = statuses ?? ["in_stock", "limited"];
  return product.variants.some((v) => wanted.includes(v.availability.status));
}
