import { z } from "zod";

/**
 * Input schemas for the MCP tools the gateway exposes. Flat, agent-friendly
 * arguments (minor-unit integers + explicit currency) that the registry maps
 * onto canonical CommerceProvider inputs.
 */

export const SearchCatalogArgs = z
  .object({
    query: z
      .string()
      .describe("Free-text search, e.g. \"gold necklace\" or \"minimalist anniversary gift\".")
      .optional(),
    category: z.string().describe("Exact category name, e.g. Necklaces, Earrings.").optional(),
    inStockOnly: z
      .boolean()
      .describe("When true, only return products that currently have sellable stock.")
      .optional(),
    maxPriceMinor: z
      .number()
      .int()
      .nonnegative()
      .describe("Maximum effective price in minor units (e.g. 500000 paise = Rs 5000).")
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .describe("Currency for money filters (defaults to the merchant currency).")
      .optional(),
    brand: z.string().optional(),
    material: z
      .string()
      .describe("Material filter, e.g. Gold, Sterling Silver, Pearl.")
      .optional(),
    occasion: z
      .string()
      .describe("Occasion filter, e.g. anniversary, wedding, everyday.")
      .optional(),
    sort: z
      .enum(["relevance", "price_asc", "price_desc", "discount", "availability"])
      .optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const GetProductArgs = z
  .object({ productId: z.string().describe("Stable merchant product id.") })
  .strict();

export const GetVariantArgs = z
  .object({ variantId: z.string().describe("Stable merchant variant id.") })
  .strict();

export const CheckAvailabilityArgs = z
  .object({
    productId: z.string().optional(),
    variantId: z.string().optional(),
  })
  .refine((v) => v.productId || v.variantId, "Provide productId or variantId.")
  .describe("Check live stock. Provide a variantId for a precise answer.");

export const GetOfferArgs = z
  .object({
    productId: z.string().optional(),
    variantId: z
      .string()
      .describe("Prefer a variantId: when only productId is given, the cheapest in-stock variant is returned.")
      .optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  })
  .refine((v) => v.productId || v.variantId, "Provide productId or variantId.")
  .describe("Get the live, discounted offer (price + availability) for a product or variant.");

export const ToolArgSchemas = {
  search_catalog: SearchCatalogArgs,
  get_product: GetProductArgs,
  get_variant: GetVariantArgs,
  check_availability: CheckAvailabilityArgs,
  get_offer: GetOfferArgs,
} as const;

export type ToolName = keyof typeof ToolArgSchemas;
