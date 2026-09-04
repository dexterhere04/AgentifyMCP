import { z } from "zod";
import {
  detectCapabilities,
  type Capabilities,
  type CatalogSearchInput,
  type CommerceProvider,
  type OfferInput,
  isProviderError,
} from "@gateway/canonical-commerce";
import { ToolArgSchemas, type ToolName } from "./tools/schemas.js";

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
}

export interface ToolCallFailure {
  ok: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export type ToolCallResult<T> = ToolCallSuccess<T> | ToolCallFailure;

const CATALOG_TOOLS: Record<
  ToolName,
  { description: string; enabled: (caps: Capabilities) => boolean }
> = {
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
};

/**
 * A capability-aware tool registry bound to one provider. `list()` returns only
 * the tools the merchant actually supports; `call()` validates input and maps
 * to canonical CommerceProvider methods.
 */
export class CommerceToolRegistry {
  private readonly caps: Capabilities;
  private readonly defaultCurrencyPromise: Promise<string>;

  constructor(private readonly provider: CommerceProvider) {
    this.caps = detectCapabilities(provider);
    this.defaultCurrencyPromise = provider.merchant().then((m) => m.defaultCurrency);
  }

  capabilities(): Capabilities {
    return this.caps;
  }

  list(): Array<{ name: ToolName; description: string; inputSchema: z.ZodTypeAny }> {
    return (Object.keys(CATALOG_TOOLS) as ToolName[])
      .filter((name) => CATALOG_TOOLS[name].enabled(this.caps))
      .map((name) => ({
        name,
        description: CATALOG_TOOLS[name].description,
        inputSchema: ToolArgSchemas[name],
      }));
  }

  async call(name: string, rawArgs: unknown): Promise<ToolCallResult<unknown>> {
    const def = CATALOG_TOOLS[name as ToolName];
    if (!def || !(name in CATALOG_TOOLS)) {
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

    try {
      const data = await this.execute(toolName, parsed.data);
      return { ok: true, data };
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
      return {
        ok: false,
        error: { code: "INTERNAL", message: err instanceof Error ? err.message : "internal error" },
      };
    }
  }

  private async defaultCurrency(): Promise<string> {
    return this.defaultCurrencyPromise;
  }

  private async execute(name: ToolName, args: unknown): Promise<unknown> {
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
        };
        return this.provider.pricing.getOffer(input);
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
