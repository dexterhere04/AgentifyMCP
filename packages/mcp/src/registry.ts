import { z } from "zod";
import {
  detectCapabilities,
  type Capabilities,
  type CatalogSearchInput,
  type CommerceProvider,
  type OfferInput,
  isProviderError,
} from "@gateway/canonical-commerce";
import { ToolArgSchemas, agentProfileOf, type ToolName } from "./tools/schemas.js";

/** Tool-side error mirroring canonical provider semantics over MCP. */
export class ToolError extends Error {
  constructor(
    readonly code:
      | "INVALID_ARGUMENT"
      | "NOT_FOUND"
      | "UNSUPPORTED_CAPABILITY"
      | "BACKEND_ERROR"
      | "RATE_LIMITED"
      | "INTERNAL",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
}

export interface ToolCallSuccess<T> {
  ok: true;
  data: T;
  /** Calling agent's UCP profile (from meta.ucp-agent.profile), when provided. */
  agentProfile?: string;
}

export interface ToolCallFailure {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export type ToolCallResult<T> = ToolCallSuccess<T> | ToolCallFailure;

/** When present, `complete_checkout` delegates here (payment orchestration). */
export type CompleteCheckoutFn = (
  checkoutId: string,
  options: { approval: { buyerApproved: boolean }; agentProfile?: string },
) => Promise<unknown>;

export interface CommerceToolRegistryOptions {
  completeCheckout?: CompleteCheckoutFn;
}

const TOOLS: Record<
  ToolName,
  { description: string; enabled: (caps: Capabilities) => boolean }
> = {
  // catalog (read-only, always when catalog exists)
  search_catalog: {
    description:
      "Search the merchant catalog with a free-text query and structured filters (price, brand, material, occasion, stock). Live data. Prices are in minor units; e.g. 500000 INR paise = Rs 5000.",
    enabled: () => true,
  },
  get_product: {
    description:
      "Retrieve a full product with all its variants, prices, and per-variant availability by stable product id.",
    enabled: () => true,
  },
  get_variant: {
    description:
      "Retrieve a single variant (sku, attributes, pricing, availability) by stable variant id.",
    enabled: () => true,
  },
  check_availability: {
    description:
      "Check live stock for a product or variant. Returns in_stock / limited / out_of_stock / unknown.",
    enabled: (caps) => caps.inventory,
  },
  get_offer: {
    description:
      "Get the live, discounted offer for a product or variant: effective price after sale/automatic discounts, list price, savings, and availability. Verify offers right before recommending or transacting.",
    enabled: (caps) => caps.pricing,
  },
  // cart (transactional)
  create_cart: {
    description:
      "Create an empty cart for the merchant currency. Requires meta.ucp-agent.profile (your agent UCP profile URI).",
    enabled: (caps) => caps.cart,
  },
  get_cart: {
    description: "Retrieve a cart by id with its live-priced line items and subtotal.",
    enabled: (caps) => caps.cart,
  },
  add_to_cart: {
    description:
      "Add a variant quantity to a cart. Prices are taken from the live offer and stock is checked before adding. Requires meta.ucp-agent.profile.",
    enabled: (caps) => caps.cart,
  },
  update_cart_item: {
    description: "Update the quantity of an existing cart line item.",
    enabled: (caps) => caps.cart,
  },
  remove_from_cart: {
    description: "Remove a line item from a cart.",
    enabled: (caps) => caps.cart,
  },
  // checkout (transactional)
  create_checkout: {
    description:
      "Start a checkout from an active, non-empty cart. Requires meta.ucp-agent.profile.",
    enabled: (caps) => caps.checkout,
  },
  get_checkout: {
    description: "Retrieve a checkout by id, including totals and status.",
    enabled: (caps) => caps.checkout,
  },
  complete_checkout: {
    description:
      "Complete a checkout. REQUIRES explicit human approval (approval.buyerApproved = true) and meta.ucp-agent.profile. When a payment provider is configured this starts the payment and returns a payment URL for buyer approval; otherwise it finalizes the order directly.",
    enabled: (caps) => caps.checkout,
  },
  cancel_checkout: {
    description: "Cancel a checkout that has not been completed.",
    enabled: (caps) => caps.checkout,
  },
  get_order: {
    description:
      "Retrieve an order by id after a completed checkout (e.g. after payment confirmation). Requires meta.ucp-agent.profile.",
    enabled: (caps) => caps.orders,
  },
};

/**
 * A capability-aware tool registry bound to one provider. `list()` returns only
 * the tools the merchant actually supports; `call()` validates input and maps
 * to canonical CommerceProvider methods. Transactional tools require the
 * caller's `meta.ucp-agent.profile`, which is threaded into provider calls and
 * echoed back in the result `_meta` for negotiation/audit.
 */
export class CommerceToolRegistry {
  private readonly caps: Capabilities;
  private readonly defaultCurrencyPromise: Promise<string>;

  constructor(
    private readonly provider: CommerceProvider,
    private readonly options: CommerceToolRegistryOptions = {},
  ) {
    this.caps = detectCapabilities(provider);
    this.defaultCurrencyPromise = provider.merchant().then((m) => m.defaultCurrency);
  }

  capabilities(): Capabilities {
    return this.caps;
  }

  list(): Array<{ name: ToolName; description: string; inputSchema: z.ZodTypeAny }> {
    return (Object.keys(TOOLS) as ToolName[])
      .filter((name) => TOOLS[name].enabled(this.caps))
      .map((name) => ({
        name,
        description: TOOLS[name].description,
        inputSchema: ToolArgSchemas[name],
      }));
  }

  async call(name: string, rawArgs: unknown): Promise<ToolCallResult<unknown>> {
    const def = TOOLS[name as ToolName];
    if (!def || !(name in TOOLS)) {
      return { ok: false, error: { code: "INVALID_ARGUMENT", message: `Unknown tool: ${name}` } };
    }
    const toolName = name as ToolName;
    if (!def.enabled(this.caps)) {
      return {
        ok: false,
        error: {
          code: "UNSUPPORTED_CAPABILITY",
          message: `Merchant does not support the "${toolName}" capability`,
        },
      };
    }

    const schema = ToolArgSchemas[toolName];
    const parsed = schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "INVALID_ARGUMENT",
          message: parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("; "),
        },
      };
    }

    const agentProfile = agentProfileOf(
      parsed.data as { meta?: { "ucp-agent"?: { profile?: string } } },
    );

    try {
      const data = await this.execute(toolName, parsed.data, agentProfile);
      const success: ToolCallSuccess<unknown> = { ok: true, data };
      if (agentProfile) success.agentProfile = agentProfile;
      return success;
    } catch (err) {
      if (isProviderError(err)) {
        const code =
          err.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : err.code === "BACKEND_TIMEOUT"
              ? "BACKEND_ERROR"
              : (err.code as ToolError["code"]);
        return {
          ok: false,
          error: { code, message: err.message, details: err.details },
        };
      }
      if (err instanceof ToolError) {
        return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
      }
      return {
        ok: false,
        error: { code: "INTERNAL", message: err instanceof Error ? err.message : "internal error" },
      };
    }
  }

  private async defaultCurrency(): Promise<string> {
    return this.defaultCurrencyPromise;
  }

  private async execute(
    name: ToolName,
    args: unknown,
    agentProfile?: string,
  ): Promise<unknown> {
    switch (name) {
      case "search_catalog": {
        const a = args as z.infer<typeof ToolArgSchemas.search_catalog>;
        const defaultCurrency = await this.defaultCurrency();
        const input: CatalogSearchInput = {
          ...(a.query ? { query: a.query } : {}),
          ...(a.category ? { category: a.category } : {}),
          ...(a.currency ? { currency: a.currency.toUpperCase() } : {}),
          ...(a.sort ? { sort: a.sort } : {}),
          ...(a.page ? { page: a.page } : {}),
          ...(a.limit ? { limit: a.limit } : {}),
        };
        const filters: NonNullable<CatalogSearchInput["filters"]> = {};
        const attributes: Record<string, string> = {};
        if (a.inStockOnly) filters.inStock = true;
        if (a.brand) filters.brands = [a.brand];
        if (a.material) attributes.material = a.material;
        if (a.occasion) attributes.occasion = a.occasion;
        if (Object.keys(attributes).length) filters.attributes = attributes;
        const currency = (a.currency ?? defaultCurrency).toUpperCase();
        if (a.maxPriceMinor !== undefined) {
          filters.priceMax = { amount: a.maxPriceMinor, currency };
        }
        if (Object.keys(filters).length) input.filters = filters;
        return this.provider.catalog.search(input);
      }
      case "get_product": {
        const a = args as z.infer<typeof ToolArgSchemas.get_product>;
        return this.provider.catalog.getProduct(a.productId);
      }
      case "get_variant": {
        const a = args as z.infer<typeof ToolArgSchemas.get_variant>;
        return this.provider.catalog.getVariant(a.variantId);
      }
      case "check_availability": {
        const a = args as z.infer<typeof ToolArgSchemas.check_availability>;
        if (!this.provider.inventory) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "inventory capability unavailable");
        }
        return this.provider.inventory.check({
          ...(a.productId ? { productId: a.productId } : {}),
          ...(a.variantId ? { variantId: a.variantId } : {}),
        });
      }
      case "get_offer": {
        const a = args as z.infer<typeof ToolArgSchemas.get_offer>;
        if (!this.provider.pricing) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "pricing capability unavailable");
        }
        const input: OfferInput = {
          ...(a.productId ? { productId: a.productId } : {}),
          ...(a.variantId ? { variantId: a.variantId } : {}),
          ...(a.currency ? { currency: a.currency.toUpperCase() } : {}),
          ...(agentProfile ? { buyerContext: { ucpAgentProfile: agentProfile } } : {}),
        };
        return this.provider.pricing.getOffer(input);
      }
      case "create_cart": {
        const a = args as z.infer<typeof ToolArgSchemas.create_cart>;
        if (!this.provider.cart) throw new ToolError("UNSUPPORTED_CAPABILITY", "cart capability unavailable");
        return this.provider.cart.create({ ...(a.currency ? { currency: a.currency } : {}), agentProfile });
      }
      case "get_cart": {
        const a = args as z.infer<typeof ToolArgSchemas.get_cart>;
        if (!this.provider.cart) throw new ToolError("UNSUPPORTED_CAPABILITY", "cart capability unavailable");
        return this.provider.cart.get(a.cartId);
      }
      case "add_to_cart": {
        const a = args as z.infer<typeof ToolArgSchemas.add_to_cart>;
        if (!this.provider.cart) throw new ToolError("UNSUPPORTED_CAPABILITY", "cart capability unavailable");
        return this.provider.cart.addItem({
          cartId: a.cartId,
          variantId: a.variantId,
          quantity: a.quantity,
          agentProfile,
        });
      }
      case "update_cart_item": {
        const a = args as z.infer<typeof ToolArgSchemas.update_cart_item>;
        if (!this.provider.cart) throw new ToolError("UNSUPPORTED_CAPABILITY", "cart capability unavailable");
        return this.provider.cart.updateItem({
          cartId: a.cartId,
          itemId: a.itemId,
          quantity: a.quantity,
          agentProfile,
        });
      }
      case "remove_from_cart": {
        const a = args as z.infer<typeof ToolArgSchemas.remove_from_cart>;
        if (!this.provider.cart) throw new ToolError("UNSUPPORTED_CAPABILITY", "cart capability unavailable");
        return this.provider.cart.removeItem({ cartId: a.cartId, itemId: a.itemId, agentProfile });
      }
      case "create_checkout": {
        const a = args as z.infer<typeof ToolArgSchemas.create_checkout>;
        if (!this.provider.checkout) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "checkout capability unavailable");
        }
        return this.provider.checkout.create({ cartId: a.cartId, agentProfile });
      }
      case "get_checkout": {
        const a = args as z.infer<typeof ToolArgSchemas.get_checkout>;
        if (!this.provider.checkout) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "checkout capability unavailable");
        }
        return this.provider.checkout.get(a.checkoutId);
      }
      case "complete_checkout": {
        const a = args as z.infer<typeof ToolArgSchemas.complete_checkout>;
        if (!this.provider.checkout) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "checkout capability unavailable");
        }
        const approval = { buyerApproved: a.approval.buyerApproved };
        if (this.options.completeCheckout) {
          return this.options.completeCheckout(a.checkoutId, { approval, agentProfile });
        }
        return this.provider.checkout.complete(a.checkoutId, { approval, agentProfile });
      }
      case "cancel_checkout": {
        const a = args as z.infer<typeof ToolArgSchemas.cancel_checkout>;
        if (!this.provider.checkout) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "checkout capability unavailable");
        }
        return this.provider.checkout.cancel(a.checkoutId, { agentProfile });
      }
      case "get_order": {
        const a = args as z.infer<typeof ToolArgSchemas.get_order>;
        if (!this.provider.orders) {
          throw new ToolError("UNSUPPORTED_CAPABILITY", "orders capability unavailable");
        }
        return this.provider.orders.get(a.orderId);
      }
    }
  }
}

export function createToolRegistry(provider: CommerceProvider): CommerceToolRegistry {
  return new CommerceToolRegistry(provider);
}

export function isToolFailure<T>(r: ToolCallResult<T>): r is ToolCallFailure {
  return r.ok === false;
}
