import { z } from "zod";

/**
 * Input schemas for the MCP tools the gateway exposes. Flat, agent-friendly
 * arguments (minor-unit integers + explicit currency) that the registry maps
 * onto canonical CommerceProvider inputs.
 *
 * Every tool accepts an optional/required `meta` object carrying the calling
 * agent's UCP profile (`meta.ucp-agent.profile`) — the UCP negotiation header
 * that Shopify stores require. It is REQUIRED on transactional (cart/checkout)
 * tools so the gateway knows which agent is about to move money, and OPTIONAL
 * on read-only catalog tools.
 */

export const AgentMetaSchema = z
  .object({
    "ucp-agent": z
      .object({
        profile: z
          .string()
          .url()
          .describe("URI of the calling agent's UCP discovery profile (/.well-known/ucp)."),
      })
      .strict(),
  })
  .strict();

/** Optional for read-only catalog tools. */
const AgentMetaOptional = AgentMetaSchema.optional();
/** Required before any transactional (cart/checkout) action. */
const AgentMetaRequired = AgentMetaSchema;

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
    meta: AgentMetaOptional,
  })
  .strict();

export const GetProductArgs = z
  .object({ productId: z.string().describe("Stable merchant product id."), meta: AgentMetaOptional })
  .strict();

export const GetVariantArgs = z
  .object({ variantId: z.string().describe("Stable merchant variant id."), meta: AgentMetaOptional })
  .strict();

export const CheckAvailabilityArgs = z
  .object({
    productId: z.string().optional(),
    variantId: z.string().optional(),
    meta: AgentMetaOptional,
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
    meta: AgentMetaOptional,
  })
  .refine((v) => v.productId || v.variantId, "Provide productId or variantId.")
  .describe("Get the live, discounted offer (price + availability) for a product or variant.");

// ---------------------------------------------------------------------------
// Cart tools
// ---------------------------------------------------------------------------

export const CreateCartArgs = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/).describe("Cart currency (defaults to merchant currency).").optional(),
    meta: AgentMetaRequired,
  })
  .strict();

export const GetCartArgs = z
  .object({ cartId: z.string().describe("Cart id returned by create_cart."), meta: AgentMetaRequired })
  .strict();

export const AddToCartArgs = z
  .object({
    cartId: z.string().describe("Cart id returned by create_cart."),
    variantId: z.string().describe("Stable merchant variant id to add."),
    quantity: z.number().int().positive().describe("Positive integer quantity."),
    meta: AgentMetaRequired,
  })
  .strict();

export const UpdateCartItemArgs = z
  .object({
    cartId: z.string(),
    itemId: z.string().describe("Line item id returned by create_cart/add_to_cart."),
    quantity: z.number().int().positive().describe("New positive quantity; set to 0 via remove_from_cart instead."),
    meta: AgentMetaRequired,
  })
  .strict();

export const RemoveFromCartArgs = z
  .object({
    cartId: z.string(),
    itemId: z.string(),
    meta: AgentMetaRequired,
  })
  .strict();

// ---------------------------------------------------------------------------
// Checkout tools
// ---------------------------------------------------------------------------

export const CreateCheckoutArgs = z
  .object({ cartId: z.string().describe("Active cart id to check out."), meta: AgentMetaRequired })
  .strict();

export const GetCheckoutArgs = z
  .object({ checkoutId: z.string().describe("Checkout id returned by create_checkout."), meta: AgentMetaRequired })
  .strict();

export const CompleteCheckoutArgs = z
  .object({
    checkoutId: z.string(),
    approval: z
      .object({
        buyerApproved: z
          .literal(true)
          .describe("Explicit, contemporaneous human approval. Must be true to complete a checkout."),
      })
      .strict()
      .describe("Human approval gate — never complete without it."),
    meta: AgentMetaRequired,
  })
  .strict();

export const CancelCheckoutArgs = z
  .object({ checkoutId: z.string(), meta: AgentMetaRequired })
  .strict();

export const GetOrderArgs = z
  .object({
    orderId: z.string().describe("Order id returned by complete_checkout / webhook confirmation."),
    meta: AgentMetaRequired,
  })
  .strict();

export const GetAuditTrailArgs = z
  .object({
    checkoutId: z.string().describe("Checkout id to read the explainable audit trail for."),
    meta: AgentMetaOptional,
  })
  .strict();

export const GetRecommendationsArgs = z
  .object({
    cartId: z.string().describe("Active cart id to recommend against."),
    budgetMinor: z
      .number()
      .int()
      .nonnegative()
      .describe("Hard budget ceiling in minor units; suggestions never exceed it.")
      .optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    meta: AgentMetaOptional,
  })
  .strict();

export const ToolArgSchemas = {
  search_catalog: SearchCatalogArgs,
  get_product: GetProductArgs,
  get_variant: GetVariantArgs,
  check_availability: CheckAvailabilityArgs,
  get_offer: GetOfferArgs,
  create_cart: CreateCartArgs,
  get_cart: GetCartArgs,
  add_to_cart: AddToCartArgs,
  update_cart_item: UpdateCartItemArgs,
  remove_from_cart: RemoveFromCartArgs,
  create_checkout: CreateCheckoutArgs,
  get_checkout: GetCheckoutArgs,
  complete_checkout: CompleteCheckoutArgs,
  cancel_checkout: CancelCheckoutArgs,
  get_order: GetOrderArgs,
  get_audit_trail: GetAuditTrailArgs,
  get_recommendations: GetRecommendationsArgs,
} as const;

export type ToolName = keyof typeof ToolArgSchemas;

export type ToolArgs = {
  [K in ToolName]: z.infer<(typeof ToolArgSchemas)[K]>;
};

/** Extract the calling agent's UCP profile URI from validated tool arguments. */
export function agentProfileOf<T extends { meta?: { "ucp-agent"?: { profile?: string } } }>(
  args: T,
): string | undefined {
  return args.meta?.["ucp-agent"]?.profile;
}
