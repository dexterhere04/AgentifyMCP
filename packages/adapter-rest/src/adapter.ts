import {
  buildMerchant,
  type Availability,
  type CatalogSearchInput,
  type CatalogSearchResult,
  type CommerceProvider,
  type InventoryQuery,
  type Merchant,
  type Offer,
  type OfferInput,
  type Product,
  type ProductSummary,
  type Variant,
  invalidArgument,
} from "@agentify/canonical-commerce";
import { HttpClient } from "./http.js";
import { read, interpolate } from "./path.js";
import {
  mapOfferRow,
  mapProduct,
  mapVariant,
  offerFromCanonicalVariant,
  searchResultFilter,
  sortSummaries,
  summaryFromProduct,
} from "./mapping.js";
import type { RestAdapterConfig } from "./config.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

/**
 * Config-driven REST commerce provider.
 *
 * One adapter serves every REST merchant: the whole integration is the config
 * (endpoints + field mappings + auth). All merchant-specific JSON shapes are
 * absorbed here and normalized onto the canonical model, so UCP/MCP layers
 * never change when a new merchant is connected.
 */
export class RestCommerceProvider implements CommerceProvider {
  readonly id: string;
  private readonly http: HttpClient;
  private readonly config: RestAdapterConfig;
  private readonly ctx: { defaultCurrency: string };
  private readonly supportedCurrencies: string[];

  catalog: CommerceProvider["catalog"];
  inventory?: CommerceProvider["inventory"];
  pricing: CommerceProvider["pricing"];

  constructor(config: RestAdapterConfig) {
    const errors = validateRestConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid REST adapter configuration for "${config.id}":\n- ${errors.join("\n- ")}`);
    }
    this.config = config;
    this.id = config.id;
    this.ctx = { defaultCurrency: config.merchant.defaultCurrency };
    this.supportedCurrencies = [config.merchant.defaultCurrency];
    this.http = new HttpClient(
      config.http.baseUrl,
      config.http.auth,
      config.http.headers ?? {},
      config.http.timeoutMs ?? 5000,
    );

    this.catalog = {
      search: (input) => this.search(input),
      getProduct: (id) => this.getProduct(id),
      getVariant: (id) => this.getVariant(id),
    };
    if (config.catalog.offerUrl || config.catalog.productUrl) {
      this.pricing = { getOffer: (input) => this.getOffer(input) };
    }
    if (config.catalog.stockUrl) {
      this.inventory = { check: (input) => this.checkInventory(input) };
    }
  }

  // -------------------------------------------------------------------------
  // merchant
  // -------------------------------------------------------------------------

  async merchant(): Promise<Merchant> {
    const { merchant } = this.config;
    return buildMerchant({
      id: this.id,
      name: merchant.name,
      description: merchant.description,
      url: merchant.url,
      supportEmail: merchant.supportEmail,
      country: merchant.country,
      defaultCurrency: merchant.defaultCurrency,
      supportedCurrencies: this.supportedCurrencies,
    });
  }

  // -------------------------------------------------------------------------
  // URL builders
  // -------------------------------------------------------------------------

  private endpoint(template: string, vars: Record<string, string>): string {
    const interpolated = interpolate(template, vars as unknown as Record<string, unknown>);
    if (interpolated.includes("{")) {
      throw invalidArgument(`endpoint template "${template}" left placeholders unresolved`);
    }
    return interpolated;
  }

  // -------------------------------------------------------------------------
  // catalog.search
  // -------------------------------------------------------------------------

  async search(input: CatalogSearchInput = {}): Promise<CatalogSearchResult> {
    if (input.currency && input.currency !== this.ctx.defaultCurrency) {
      throw invalidArgument(`currency ${input.currency} is not supported by this merchant`, {
        supported: this.supportedCurrencies,
      });
    }
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(input.page ?? 1, 1);
    const query = input.query?.trim() ?? "";
    const category = input.category ?? "";

    const search = this.config.catalog.search;
    const pageSize = search.pageSize ?? DEFAULT_PAGE_SIZE;
    const pageParam = search.pageParam ?? "page";
    const limitParam = search.limitParam ?? "limit";

    const params: Record<string, string> = {
      query,
      category,
      page: String(page),
      limit: String(limit),
      page_size: String(pageSize),
    };
    const qs = new URLSearchParams();
    for (const [key, template] of Object.entries(search.query ?? {})) {
      const value = interpolate(template, params as unknown as Record<string, unknown>);
      if (!value.includes("{") && value !== "") qs.set(key, value);
    }
    const pathAndQuery = `${this.endpoint(search.path, {})}${qs.size ? `?${qs.toString()}` : ""}`;
    const root = await this.http.getJson(pathAndQuery);

    const itemsPath = search.itemsPath ?? "$";
    const rawItems = read(root, itemsPath);
    if (!Array.isArray(rawItems)) {
      throw invalidArgument(`search response did not contain an array at "${itemsPath}"`);
    }

    const summaries: ProductSummary[] = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      try {
        const product = mapProduct(raw as Record<string, unknown>, this.config.mappings.product, this.ctx);
        summaries.push(summaryFromProduct(product));
      } catch {
        // skip malformed merchant rows during search (like the mock adapter)
      }
    }

    const filtered = searchResultFilter(summaries, input);
    const sorted = sortSummaries(filtered, input.sort ?? "relevance");

    const explicitTotal = search.totalPath ? read(root, search.totalPath) : undefined;
    const total = typeof explicitTotal === "number" ? explicitTotal : sorted.length;
    const offset = (page - 1) * limit;
    const items = sorted.slice(offset, offset + limit);
    const cursor = search.cursorPath ? read(root, search.cursorPath) : undefined;
    const hasMore = typeof cursor === "string" && cursor !== "" ? true : offset + items.length < total;

    return { items, total, page, limit, hasMore };
  }

  // -------------------------------------------------------------------------
  // catalog.getProduct / getVariant
  // -------------------------------------------------------------------------

  private async fetchProductRow(productId: string): Promise<Record<string, unknown>> {
    const url = this.endpoint(this.config.catalog.productUrl, { productId });
    const root = await this.http.getJson(url);
    if (!root || typeof root !== "object") {
      throw invalidArgument(`product response for "${productId}" was not an object`);
    }
    return root as Record<string, unknown>;
  }

  async getProduct(id: string): Promise<Product> {
    const row = await this.fetchProductRow(id);
    return mapProduct(row, this.config.mappings.product, this.ctx);
  }

  async getVariant(id: string): Promise<Variant> {
    const url = this.endpoint(this.config.catalog.variantUrl, { variantId: id });
    const root = await this.http.getJson(url);
    if (!root || typeof root !== "object") {
      throw invalidArgument(`variant response for "${id}" was not an object`);
    }
    const mapping = this.config.mappings.offer ?? this.config.mappings.product.singleVariant;
    if (!mapping) {
      throw invalidArgument(`no variant mapping configured to read variant "${id}"`);
    }
    return mapVariant(root as Record<string, unknown>, mapping, this.ctx);
  }

  // -------------------------------------------------------------------------
  // inventory
  // -------------------------------------------------------------------------

  async checkInventory(input: InventoryQuery): Promise<Availability> {
    if (input.variantId && this.config.catalog.stockUrl) {
      const url = this.endpoint(this.config.catalog.stockUrl, { variantId: input.variantId });
      const root = await this.http.getJson(url);
      return normalizeAvailabilityResponse(root, input.variantId);
    }
    if (input.variantId && this.pricing) {
      const offer = await this.getOffer({ variantId: input.variantId });
      return offer.availability;
    }
    throw invalidArgument("inventory.check requires variantId and a configured stock endpoint");
  }

  // -------------------------------------------------------------------------
  // pricing.getOffer
  // -------------------------------------------------------------------------

  async getOffer(input: OfferInput): Promise<Offer> {
    if (!input.variantId) {
      throw invalidArgument("rest adapter requires a variantId for live offers");
    }
    // Preferred: a dedicated live offer endpoint.
    if (this.config.catalog.offerUrl) {
      const url = this.endpoint(this.config.catalog.offerUrl, { variantId: input.variantId });
      const root = await this.http.getJson(url);
      if (!root || typeof root !== "object") {
        throw invalidArgument(`offer response for "${input.variantId}" was not an object`);
      }
      const mapping = this.config.mappings.offer;
      if (!mapping) {
        throw invalidArgument(`no offer mapping configured for "${this.id}"`);
      }
      return mapOfferRow(root as Record<string, unknown>, mapping, this.ctx);
    }
    // Fallback: variant -> product -> build offer from canonical data.
    const variant = await this.getVariant(input.variantId);
    const productRow = await this.fetchProductRow(variant.productId);
    const product = mapProduct(productRow, this.config.mappings.product, this.ctx);
    const freshVariant = product.variants.find((v) => v.id === variant.id) ?? variant;
    return offerFromCanonicalVariant(product, freshVariant);
  }
}

function normalizeAvailabilityResponse(root: unknown, variantId: string): Availability {
  if (root && typeof root === "object") {
    const obj = root as Record<string, unknown>;
    // shape { available: true, quantity: 12 }
    if (typeof obj.available === "boolean") {
      return {
        status: obj.available ? "in_stock" : "out_of_stock",
        ...(typeof obj.quantity === "number" ? { quantity: Math.max(0, Math.round(obj.quantity)) } : {}),
      };
    }
  }
  throw invalidArgument(`unexpected stock response shape for variant "${variantId}"`);
}

export type { RestAdapterConfig };

/** Fail-fast validation of a REST adapter config (doc: malformed config must fail startup). */
export function validateRestConfig(config: RestAdapterConfig): string[] {
  const errors: string[] = [];
  if (!config.id) errors.push("id is required");
  const merchant = (config.merchant ?? {}) as Partial<{ name: string; defaultCurrency: string }>;
  if (!merchant.name) errors.push("merchant.name is required");
  if (!/^[A-Za-z]{3}$/.test(merchant.defaultCurrency ?? "")) {
    errors.push("merchant.defaultCurrency must be a 3-letter code");
  }
  if (!config.http?.baseUrl) {
    errors.push("http.baseUrl is required");
  } else {
    try {
      const url = new URL(config.http.baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push("http.baseUrl must be http(s)");
      }
    } catch {
      errors.push("http.baseUrl is not a valid URL");
    }
  }
  const cat = config.catalog;
  if (!cat) {
    errors.push("catalog is required");
  } else {
    if (!cat.search?.path) errors.push("catalog.search.path is required");
    if (!cat.productUrl) errors.push("catalog.productUrl (template with {productId}) is required");
    if (!cat.variantUrl) errors.push("catalog.variantUrl (template with {variantId}) is required");
    const m = config.mappings;
    if (!m?.product?.id || !m?.product?.title) {
      errors.push("mappings.product.id and mappings.product.title are required");
    }
    const variantMapping =
      m?.product?.variants?.each ?? m?.product?.singleVariant;
    if (!variantMapping?.listPrice) {
      errors.push("a variant mapping with listPrice is required (product.variants.each or product.singleVariant)");
    }
  }
  if (cat?.offerUrl && !config.mappings?.offer) {
    errors.push("mappings.offer is required when catalog.offerUrl is configured");
  }
  return errors;
}
