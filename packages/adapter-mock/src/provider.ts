import {
  buildMerchant,
  computeBestPrice,
  fromMinor,
  type Availability,
  type AvailabilityStatus,
  type CatalogSearchInput,
  type CatalogSearchResult,
  type CommerceProvider,
  type Discount,
  type DiscountScope,
  type InventoryQuery,
  type Merchant,
  type Offer,
  type OfferInput,
  type Product,
  type ProductSummary,
  type Variant,
  malformedRecord,
  notFound,
  invalidArgument,
  backendError,
  backendTimeout,
  rateLimited,
  ProviderError,
} from "@gateway/canonical-commerce";
import {
  openMockMerchantDb,
  type DiscountRow,
  type ProductRow,
  type VariantRow,
} from "./db.js";
import { STANDARD_SEED, type SeedProduct } from "./seed.js";

export type MockFaultKind = "timeout" | "http500" | "unauthorized";

export interface MockCommerceProviderOptions {
  /** Custom merchant metadata. */
  merchant?: Partial<{
    id: string;
    name: string;
    description: string;
    url: string;
    logoUrl: string;
    supportEmail: string;
    country: string;
  }>;
  /** Catalog to seed. Defaults to the standard jewelry catalog. */
  products?: SeedProduct[];
  /** Default ":memory:". A path persists the store for a real demo. */
  dbPath?: string;
  /** Public base URL used to build source/product URLs. */
  storeUrl?: string;
  /** Freeze time for deterministic offer expiry tests. */
  now?: () => string;
  /** Simulated backend latency in ms. */
  latencyMs?: number;
  /** Simulate a merchant that rejects calls after N requests. */
  rateLimitAfter?: number;
  /** Force per-id backend faults (applies to product/variant ids). */
  faultIds?: Record<string, MockFaultKind>;
}

const DEFAULT_MERCHANT = {
  id: "m-arna-jewels",
  name: "Aarna Jewels",
  description:
    "Demo jewellery merchant (mock backend). Gold, silver and gemstone jewellery in INR.",
  defaultCurrency: "INR",
  url: "https://demo.example",
  supportEmail: "care@demo.example",
  country: "IN",
};

const DELIVERY = { minDays: 2, maxDays: 5, description: "Standard delivery" };

const STOCK_RANK: Record<AvailabilityStatus, number> = {
  in_stock: 0,
  limited: 1,
  unknown: 2,
  out_of_stock: 3,
};

export class MockCommerceProvider implements CommerceProvider {
  readonly id = "mock-merchant";
  private readonly db;
  private readonly products: SeedProduct[];
  private readonly storeUrl: string;
  private readonly latencyMs: number;
  private readonly rateLimitAfter?: number;
  private readonly faultIds?: Record<string, MockFaultKind>;
  private readonly opts: MockCommerceProviderOptions;
  private callCount = 0;

  catalog: CommerceProvider["catalog"];
  inventory: CommerceProvider["inventory"];
  pricing: CommerceProvider["pricing"];

  constructor(options: MockCommerceProviderOptions = {}) {
    this.opts = options;
    this.products = options.products ?? STANDARD_SEED;
    this.db = openMockMerchantDb(this.products, options.dbPath ?? ":memory:");
    this.storeUrl = options.storeUrl ?? "https://demo.example";
    this.latencyMs = options.latencyMs ?? 0;
    this.rateLimitAfter = options.rateLimitAfter;
    this.faultIds = options.faultIds;

    this.catalog = {
      search: (input) => this.search(input),
      getProduct: (id) => this.getProduct(id),
      getVariant: (id) => this.getVariant(id),
    };
    this.inventory = {
      check: (input) => this.checkInventory(input),
    };
    this.pricing = {
      getOffer: (input) => this.getOffer(input),
    };
  }

  close(): void {
    this.db.close();
  }

  // -------------------------------------------------------------------------
  // internal helpers
  // -------------------------------------------------------------------------

  private now(): string {
    return this.opts.now?.() ?? new Date().toISOString();
  }

  private async throttle(): Promise<void> {
    this.callCount += 1;
    if (this.rateLimitAfter !== undefined && this.callCount > this.rateLimitAfter) {
      throw rateLimited("mock merchant call budget exhausted");
    }
    if (this.latencyMs > 0) {
      await new Promise((r) => setTimeout(r, this.latencyMs));
    }
  }

  private checkFault(id?: string): void {
    if (!id) return;
    const fault = this.faultIds?.[id];
    if (fault === "timeout") throw backendTimeout(`merchant backend timed out for "${id}"`);
    if (fault === "http500") {
      throw backendError(`merchant backend returned HTTP 500 for "${id}"`, { id });
    }
    if (fault === "unauthorized") {
      throw new ProviderError(
        "BACKEND_UNAUTHORIZED",
        `merchant backend rejected credentials for "${id}"`,
      );
    }
  }

  private productRows(): ProductRow[] {
    return this.db
      .prepare("SELECT * FROM products ORDER BY rowid")
      .all() as unknown as ProductRow[];
  }

  private variantRows(productId: string): VariantRow[] {
    return this.db
      .prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY rowid")
      .all(productId) as unknown as VariantRow[];
  }

  private variantRowById(variantId: string): VariantRow | undefined {
    return this.db
      .prepare("SELECT * FROM variants WHERE id = ?")
      .get(variantId) as unknown as VariantRow | undefined;
  }

  private discountRowsFor(productId: string, variantId: string): DiscountRow[] {
    return this.db
      .prepare("SELECT * FROM discounts WHERE product_id = ? OR variant_id = ?")
      .all(productId, variantId) as unknown as DiscountRow[];
  }

  private toDiscount(row: DiscountRow): Discount {
    const base: Discount = {
      id: row.id,
      type: row.type as Discount["type"],
      scope: (row.scope as DiscountScope) ?? "cart",
      ...(row.code ? { code: row.code } : {}),
      ...(row.title ? { title: row.title } : {}),
      ...(row.description ? { description: row.description } : {}),
      ...(row.valid_from ? { validFrom: row.valid_from } : {}),
      ...(row.valid_until ? { validUntil: row.valid_until } : {}),
    };
    if (row.value !== null) {
      return { ...base, value: row.value };
    }
    if (row.amount_minor !== null) {
      return { ...base, amount: fromMinor(row.amount_minor, row.currency ?? "INR") };
    }
    return base;
  }

  private toAvailability(row: VariantRow): Availability {
    const status = row.stock_status as AvailabilityStatus | null;
    const quantity = row.stock_qty;
    if (status) {
      return {
        status,
        ...(quantity !== null ? { quantity } : {}),
        updatedAt: this.now(),
      };
    }
    if (quantity === null) {
      return { status: "unknown", updatedAt: this.now() };
    }
    return {
      status: quantity === 0 ? "out_of_stock" : "in_stock",
      quantity,
      updatedAt: this.now(),
    };
  }

  private buildProduct(row: ProductRow): Product {
    if (row.malformed === 1) {
      throw malformedRecord("product", row.id, "backend record is flagged corrupt");
    }

    const attributes: Record<string, string | string[]> = {};
    if (row.material) attributes["material"] = row.material;
    const occasions = JSON.parse(row.occasions_json) as string[];
    if (occasions.length) attributes["occasions"] = occasions;
    if (row.brand) attributes["brand"] = row.brand;

    const product: Product = {
      id: row.id,
      title: row.title ?? "Untitled",
      ...(row.description ? { description: row.description } : {}),
      ...(row.category ? { category: row.category } : {}),
      ...(row.brand ? { brand: row.brand } : {}),
      images: JSON.parse(row.images_json) as string[],
      attributes,
      sourceUrl: `${this.storeUrl}/catalog/${row.id}`,
      variants: this.variantRows(row.id).map((v) => this.buildVariant(v, row.id)),
    };
    return product;
  }

  private buildVariant(v: VariantRow, productId: string): Variant {
    if (v.list_price_minor === null || !v.list_currency) {
      throw malformedRecord("variant", v.id, "missing list price");
    }
    return {
      id: v.id,
      productId,
      ...(v.sku ? { sku: v.sku } : {}),
      ...(v.title ? { title: v.title } : {}),
      attributes: JSON.parse(v.attr_json) as Record<string, string>,
      pricing: {
        listPrice: fromMinor(v.list_price_minor, v.list_currency),
        ...(v.sale_price_minor !== null && v.sale_currency
          ? { salePrice: fromMinor(v.sale_price_minor, v.sale_currency) }
          : {}),
      },
      availability: this.toAvailability(v),
      images: [],
    };
  }

  /** Live offer for one variant, including its applicable discounts. */
  private offerForVariant(v: VariantRow): Offer {
    const variant = this.buildVariant(v, v.product_id);
    const discounts = this.discountRowsFor(v.product_id, v.id).map((d) => this.toDiscount(d));
    const decision = computeBestPrice(
      variant.pricing.listPrice,
      variant.pricing.salePrice,
      discounts,
      { now: this.now() },
    );
    const applied = new Set(decision.appliedDiscountIds);

    return {
      productId: v.product_id,
      variantId: variant.id,
      productTitle: this.productTitle(v.product_id),
      ...(variant.title ? { variantTitle: variant.title } : {}),
      ...(variant.sku ? { sku: variant.sku } : {}),
      currency: decision.effective.currency,
      price: decision.effective,
      listPrice: decision.listPrice,
      ...(decision.originalPrice ? { originalPrice: decision.originalPrice } : {}),
      discounts: discounts
        .filter((d) => applied.has(d.id))
        .map((d) => ({ id: d.id, title: d.title, description: d.description })),
      ...(decision.savings ? { savings: decision.savings } : {}),
      availability: variant.availability,
      delivery: DELIVERY,
      sourceUrl: `${this.storeUrl}/catalog/${v.product_id}`,
      image: `https://img.demo.example/${v.product_id}.jpg`,
      updatedAt: this.now(),
    };
  }

  private productTitle(productId: string): string {
    const row = this.productRows().find((p) => p.id === productId);
    return row?.title ?? "Product";
  }

  private buildSummary(row: ProductRow): ProductSummary {
    const product = this.buildProduct(row);
    let cheapest;
    let priciest;
    let hasDiscount = false;
    let inStock = false;

    for (const variant of product.variants) {
      const discounts = this.discountRowsFor(row.id, variant.id).map((d) => this.toDiscount(d));
      const decision = computeBestPrice(
        variant.pricing.listPrice,
        variant.pricing.salePrice,
        discounts,
        { now: this.now() },
      );
      if (!cheapest || decision.effective.amount < cheapest.amount) cheapest = decision.effective;
      if (!priciest || decision.effective.amount > priciest.amount) priciest = decision.effective;
      if (decision.savings) hasDiscount = true;
      if (variant.availability.status === "in_stock" || variant.availability.status === "limited") {
        inStock = true;
      }
    }

    if (!cheapest) {
      throw malformedRecord("product", row.id, "product has no variants");
    }

    return {
      id: product.id,
      title: product.title,
      ...(product.category ? { category: product.category } : {}),
      ...(product.brand ? { brand: product.brand } : {}),
      currency: cheapest.currency,
      priceFrom: cheapest,
      ...(priciest && priciest.amount !== cheapest.amount ? { priceTo: priciest } : {}),
      ...(product.variants[0] ? { listPrice: product.variants[0].pricing.listPrice } : {}),
      inStock,
      hasDiscount,
      images: product.images,
      variantsCount: product.variants.length,
      sourceUrl: product.sourceUrl,
    };
  }

  private attributeMatch(row: ProductRow, attributes: Record<string, string>): boolean {
    for (const [key, value] of Object.entries(attributes)) {
      const found = productAttr(row, key);
      if (found === undefined) return false;
      const values = Array.isArray(found) ? found : [found];
      if (!values.some((x) => x.toLowerCase().includes(value.toLowerCase()))) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // CommerceProvider: merchant
  // -------------------------------------------------------------------------

  async merchant(): Promise<Merchant> {
    await this.throttle();
    const base = { ...DEFAULT_MERCHANT, ...this.opts.merchant };
    return buildMerchant({
      id: base.id,
      name: base.name,
      description: base.description,
      url: base.url,
      logoUrl: base.logoUrl,
      supportEmail: base.supportEmail,
      country: base.country,
      defaultCurrency: "INR",
      supportedCurrencies: ["INR"],
      policies: {
        shipping: `${base.url}/policies/shipping`,
        returns: `${base.url}/policies/returns`,
        refunds: `${base.url}/policies/refunds`,
        privacy: `${base.url}/policies/privacy`,
        terms: `${base.url}/terms`,
      },
    });
  }

  // -------------------------------------------------------------------------
  // CommerceProvider: catalog
  // -------------------------------------------------------------------------

  async search(input: CatalogSearchInput = {}): Promise<CatalogSearchResult> {
    await this.throttle();

    if (input.currency && input.currency !== "INR") {
      throw invalidArgument(`currency ${input.currency} is not supported by this merchant`, {
        supported: ["INR"],
      });
    }

    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const page = Math.max(input.page ?? 1, 1);
    const query = input.query?.trim().toLowerCase();
    const filters = input.filters ?? {};
    const sort = input.sort ?? "relevance";

    let rows = this.productRows().filter((r) => r.malformed === 0);

    if (input.category) {
      const wanted = input.category.toLowerCase();
      rows = rows.filter((r) => r.category?.toLowerCase() === wanted);
    }

    if (query) {
      const tokens = query.split(/\s+/).filter(Boolean);
      rows = rows.filter((r) => {
        const haystack = `${r.title ?? ""} ${r.description ?? ""} ${r.category ?? ""} ${r.brand ?? ""}`.toLowerCase();
        return tokens.every((t) => haystack.includes(t));
      });
    }

    let items = rows.map((r) => this.buildSummary(r));

    if (filters.inStock) items = items.filter((s) => s.inStock);
    if (filters.brands?.length) {
      const wanted = filters.brands.map((b) => b.toLowerCase());
      items = items.filter((s) => s.brand && wanted.includes(s.brand.toLowerCase()));
    }
    if (filters.priceMin || filters.priceMax) {
      items = items.filter((s) => {
        if (!s.priceFrom) return false;
        if (filters.priceMin && s.priceFrom!.amount < filters.priceMin.amount) return false;
        if (filters.priceMax && s.priceFrom!.amount > filters.priceMax.amount) return false;
        return true;
      });
    }
    if (filters.attributes) {
      items = items.filter((s) => {
        const row = rows.find((r) => r.id === s.id);
        return row ? this.attributeMatch(row, filters.attributes!) : false;
      });
    }

    const scored = items.map((s) => ({ s, score: query ? relevance(s, query) : 0 }));

    scored.sort(comparatorFor(sort, query !== undefined));

    const total = scored.length;
    const offset = (page - 1) * limit;
    const pageItems = scored.slice(offset, offset + limit).map((x) => x.s);

    return { items: pageItems, total, page, limit, hasMore: offset + pageItems.length < total };
  }

  async getProduct(id: string): Promise<Product> {
    await this.throttle();
    this.checkFault(id);
    const row = this.productRows().find((p) => p.id === id);
    if (!row) throw notFound("product", id);
    return this.buildProduct(row);
  }

  async getVariant(id: string): Promise<Variant> {
    await this.throttle();
    this.checkFault(id);
    const v = this.variantRowById(id);
    if (!v) throw notFound("variant", id);
    return this.buildVariant(v, v.product_id);
  }

  // -------------------------------------------------------------------------
  // CommerceProvider: inventory
  // -------------------------------------------------------------------------

  async checkInventory(input: InventoryQuery): Promise<Availability> {
    await this.throttle();

    if (input.variantId) {
      this.checkFault(input.variantId);
      const v = this.variantRowById(input.variantId);
      if (!v) throw notFound("variant", input.variantId);
      return this.toAvailability(v);
    }

    if (input.productId) {
      this.checkFault(input.productId);
      const row = this.productRows().find((p) => p.id === input.productId);
      if (!row) throw notFound("product", input.productId);
      const states = this.variantRows(row.id).map((v) => this.toAvailability(v));
      if (states.length === 0) return { status: "unknown", updatedAt: this.now() };
      const best = states.reduce((acc, cur) =>
        STOCK_RANK[cur.status] < STOCK_RANK[acc.status] ? cur : acc,
      );
      const sellable = states.reduce(
        (sum, a) => sum + (a.status === "in_stock" || a.status === "limited" ? (a.quantity ?? 0) : 0),
        0,
      );
      return {
        ...best,
        ...(sellable > 0 ? { quantity: sellable } : {}),
        updatedAt: this.now(),
      };
    }

    throw invalidArgument("inventory.check requires variantId or productId");
  }

  // -------------------------------------------------------------------------
  // CommerceProvider: pricing
  // -------------------------------------------------------------------------

  async getOffer(input: OfferInput): Promise<Offer> {
    await this.throttle();

    if (input.currency && input.currency !== "INR") {
      throw invalidArgument(`currency ${input.currency} is not supported by this merchant`);
    }

    if (input.variantId) {
      this.checkFault(input.variantId);
      const v = this.variantRowById(input.variantId);
      if (!v) throw notFound("variant", input.variantId);
      return this.offerForVariant(v);
    }

    if (input.productId) {
      this.checkFault(input.productId);
      const row = this.productRows().find((p) => p.id === input.productId);
      if (!row) throw notFound("product", input.productId);
      if (row.malformed === 1) throw malformedRecord("product", input.productId, "corrupt");
      const variants = this.variantRows(row.id);
      if (variants.length === 0) throw notFound("variant", `${input.productId}:no-variant`);
      const offers = variants
        .map((v) => ({ v, offer: this.offerForVariant(v) }))
        .sort((a, b) => {
          const diff = STOCK_RANK[a.offer.availability.status] - STOCK_RANK[b.offer.availability.status];
          if (diff !== 0) return diff;
          return a.offer.price.amount - b.offer.price.amount;
        });
      return offers[0]!.offer;
    }

    throw invalidArgument("pricing.getOffer requires productId or variantId");
  }
}

export function createMockCommerceProvider(
  options: MockCommerceProviderOptions = {},
): MockCommerceProvider {
  return new MockCommerceProvider(options);
}

function productAttr(row: ProductRow, key: string): string | string[] | undefined {
  switch (key.toLowerCase()) {
    case "material":
      return row.material ?? undefined;
    case "occasion":
    case "occasions": {
      const occasions = JSON.parse(row.occasions_json) as string[];
      return occasions.length ? occasions : undefined;
    }
    case "brand":
      return row.brand ?? undefined;
    default:
      return undefined;
  }
}

function relevance(s: ProductSummary, query: string): number {
  const title = s.title.toLowerCase();
  const category = s.category?.toLowerCase() ?? "";
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (title === token) score += 100;
    else if (title.startsWith(token)) score += 50;
    else if (title.includes(token)) score += 30;
    if (category.includes(token)) score += 5;
    if (s.inStock) score += 1;
  }
  return score;
}

function comparatorFor(
  sort: NonNullable<CatalogSearchInput["sort"]>,
  hasQuery: boolean,
): (a: { s: ProductSummary; score: number }, b: { s: ProductSummary; score: number }) => number {
  switch (sort) {
    case "price_asc":
      return (a, b) => (a.s.priceFrom?.amount ?? Infinity) - (b.s.priceFrom?.amount ?? Infinity);
    case "price_desc":
      return (a, b) => (b.s.priceFrom?.amount ?? -1) - (a.s.priceFrom?.amount ?? -1);
    case "discount":
      return (a, b) => discountDepth(b.s) - discountDepth(a.s);
    case "availability":
      return (a, b) => stockRank(a.s) - stockRank(b.s);
    case "relevance":
    default:
      return hasQuery
        ? (a, b) => b.score - a.score
        : (a, b) => stockRank(a.s) - stockRank(b.s) || a.s.id.localeCompare(b.s.id);
  }
}

function stockRank(s: ProductSummary): number {
  return s.inStock ? 0 : 1;
}

function discountDepth(s: ProductSummary): number {
  if (!s.listPrice || !s.priceFrom || s.listPrice.amount <= s.priceFrom.amount) return 0;
  return Math.round(((s.listPrice.amount - s.priceFrom.amount) / s.listPrice.amount) * 100);
}
