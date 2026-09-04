import {
  availabilityFromSource,
  buildOffer,
  computeBestPrice,
  fromMinor,
  toMinorUnits,
  type Availability,
  type CommerceProvider,
  type Money,
  type Offer,
  type OfferBuildInput,
  type Product,
  type ProductSummary,
  type Variant,
  type CatalogSearchInput,
  type CatalogSearchResult,
  malformedRecord,
  invalidArgument,
} from "@gateway/canonical-commerce";
import { read } from "./path.js";
import type {
  AvailabilityRef,
  MoneyRef,
  OfferMapping,
  ProductMapping,
  RestAdapterConfig,
  VariantMapping,
} from "./config.js";

export interface MappingContext {
  defaultCurrency: string;
}

const STOCK_RANK: Record<Availability["status"], number> = {
  in_stock: 0,
  limited: 1,
  unknown: 2,
  out_of_stock: 3,
};

// ---------------------------------------------------------------------------
// scalar helpers
// ---------------------------------------------------------------------------

function scalarRefString(ref: unknown): string {
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object") {
    const obj = ref as { path?: string; value?: unknown };
    if (typeof obj.path === "string") return obj.path;
  }
  throw new Error("expected a path ref");
}

function refPath(ref: { path: string } | string): string {
  return typeof ref === "string" ? ref : ref.path;
}

/** Read a raw scalar from a row via its ref; constants are returned as-is. */
function readScalar(
  row: Record<string, unknown>,
  ref: unknown,
): unknown {
  if (typeof ref === "string") {
    if (ref.startsWith("$")) return read(row, ref);
    return ref; // constant
  }
  if (ref && typeof ref === "object") {
    const obj = ref as { path?: string; value?: unknown };
    if (obj.path !== undefined) return read(row, obj.path);
    if ("value" in obj) return obj.value;
  }
  return undefined;
}

/** Parse an arbitrary raw money source into canonical minor-unit Money. */
export function moneyFromRaw(
  raw: unknown,
  currency: string,
  unit: "major" | "minor",
): Money | null {
  if (raw === null || raw === undefined || raw === "" || raw === false) return null;

  let amount: number | null = null;
  if (typeof raw === "number") {
    amount = unit === "minor" ? Math.round(raw) : toMinorUnits(raw, currency);
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/[^\d.\-]/g, "").trim();
    if (cleaned === "" || cleaned === "-") return null;
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric)) return null;
    amount = unit === "minor" ? Math.round(numeric) : toMinorUnits(numeric, currency);
  }
  if (amount === null || !Number.isSafeInteger(amount) || amount < 0) return null;
  try {
    return fromMinor(amount, currency);
  } catch {
    return null;
  }
}

function readMoney(
  row: Record<string, unknown>,
  ref: MoneyRef | string | undefined,
  ctx: MappingContext,
): Money | undefined {
  if (ref === undefined) return undefined;
  const spec: MoneyRef =
    typeof ref === "string" ? { path: ref } : ref;
  const currency = spec.currency ?? ctx.defaultCurrency;
  const raw = read(row, spec.path);
  const money = moneyFromRaw(raw, currency, spec.unit ?? "major");
  return money ?? undefined;
}

function readAvailability(
  row: Record<string, unknown>,
  ref: AvailabilityRef | string,
): Availability {
  const raw = read(row, refPath(ref));
  return availabilityFromSource(raw);
}

// ---------------------------------------------------------------------------
// mapping builders
// ---------------------------------------------------------------------------

export function mapVariant(
  row: Record<string, unknown>,
  mapping: VariantMapping,
  ctx: MappingContext,
  parentProductId?: string,
): Variant {
  const id = readScalar(row, mapping.id);
  if (typeof id !== "string" || id === "") {
    throw malformedRecord("variant", String(id), "missing variant id in merchant row");
  }
  const productId =
    (typeof readScalar(row, mapping.productId ?? "$.product_id") === "string"
      ? String(readScalar(row, mapping.productId ?? "$.product_id"))
      : undefined) ?? parentProductId;
  if (!productId) {
    throw malformedRecord("variant", id, "missing product reference");
  }
  const listPrice = readMoney(row, mapping.listPrice, ctx);
  if (!listPrice) {
    throw malformedRecord("variant", id, "missing list price");
  }
  const salePrice = readMoney(row, mapping.salePrice, ctx);
  const normalizedSale =
    salePrice && salePrice.currency === listPrice.currency ? salePrice : undefined;

  const attributes: Record<string, string> = {};
  if (mapping.attributes) {
    for (const [key, path] of Object.entries(mapping.attributes)) {
      const value = readScalar(row, path);
      if (typeof value === "string") attributes[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") attributes[key] = String(value);
    }
  }
  const sku = readScalar(row, mapping.sku ?? "");
  const title = readScalar(row, mapping.title ?? "");
  return {
    id,
    productId,
    ...(typeof sku === "string" && sku ? { sku } : {}),
    ...(typeof title === "string" && title ? { title } : {}),
    attributes,
    pricing: {
      listPrice,
      ...(normalizedSale ? { salePrice: normalizedSale } : {}),
    },
    availability: readAvailability(row, mapping.availability),
    images: [],
  };
}

export function mapProduct(
  row: Record<string, unknown>,
  mapping: ProductMapping,
  ctx: MappingContext,
): Product {
  const id = readScalar(row, mapping.id);
  if (typeof id !== "string" || id === "") {
    throw malformedRecord("product", String(id), "missing product id in merchant row");
  }
  const title = readScalar(row, mapping.title);
  if (typeof title !== "string" || title === "") {
    throw malformedRecord("product", id, "missing product title in merchant row");
  }

  const attributes: Record<string, string | string[]> = {};
  if (mapping.attributes) {
    for (const [key, ref] of Object.entries(mapping.attributes)) {
      const raw = read(row, refPath(ref));
      if (Array.isArray(raw)) {
        attributes[key] = raw.map((x) => String(x));
      } else if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        attributes[key] = String(raw);
      }
    }
  }

  let variants: Variant[] = [];
  if (mapping.variants) {
    const rows = read(row, mapping.variants.path);
    if (Array.isArray(rows)) {
      for (const v of rows) {
        if (v && typeof v === "object") {
          variants.push(mapVariant(v as Record<string, unknown>, mapping.variants.each, ctx, id));
        }
      }
    }
  }
  if (variants.length === 0 && mapping.singleVariant) {
    const single = mapVariant(row, mapping.singleVariant, ctx, id);
    variants = [single];
  }

  const imagesRaw = mapping.images ? read(row, refPath(mapping.images)) : undefined;
  const images = Array.isArray(imagesRaw) ? imagesRaw.map((x) => String(x)) : [];

  const product: Product = {
    id,
    title,
    ...(typeof readScalar(row, mapping.description ?? "") === "string"
      ? { description: String(readScalar(row, mapping.description!)) }
      : {}),
    ...(typeof readScalar(row, mapping.category ?? "") === "string"
      ? { category: String(readScalar(row, mapping.category!)) }
      : {}),
    ...(typeof readScalar(row, mapping.brand ?? "") === "string"
      ? { brand: String(readScalar(row, mapping.brand!)) }
      : {}),
    images,
    attributes,
    variants,
  };
  return product;
}

export function summaryFromProduct(product: Product): ProductSummary {
  let cheapest;
  let priciest;
  let inStock = false;
  let hasDiscount = false;
  for (const variant of product.variants) {
    const decision = computeBestPrice(variant.pricing.listPrice, variant.pricing.salePrice, []);
    if (!cheapest || decision.effective.amount < cheapest.amount) cheapest = decision.effective;
    if (!priciest || decision.effective.amount > priciest.amount) priciest = decision.effective;
    if (decision.savings) hasDiscount = true;
    if (variant.availability.status === "in_stock" || variant.availability.status === "limited") {
      inStock = true;
    }
  }
  const first = product.variants[0];
  return {
    id: product.id,
    title: product.title,
    ...(product.category ? { category: product.category } : {}),
    ...(product.brand ? { brand: product.brand } : {}),
    currency: cheapest?.currency ?? ctx_currency(product),
    ...(cheapest ? { priceFrom: cheapest } : {}),
    ...(priciest && priciest.amount !== cheapest?.amount ? { priceTo: priciest } : {}),
    ...(first ? { listPrice: first.pricing.listPrice } : {}),
    inStock,
    hasDiscount,
    images: product.images,
    variantsCount: product.variants.length,
  };
}

function ctx_currency(product: Product): string {
  return product.variants[0]?.pricing.listPrice.currency ?? "INR";
}

/** Map a live offer row into a canonical Offer (primary path: dedicated offer endpoint). */
export function mapOfferRow(
  row: Record<string, unknown>,
  mapping: OfferMapping,
  ctx: MappingContext,
  fallbackTitle?: string,
): Offer {
  const productId =
    (typeof readScalar(row, mapping.productId ?? "$.product_id") === "string"
      ? String(readScalar(row, mapping.productId ?? "$.product_id"))
      : undefined) ?? "";
  const variantId = String(readScalar(row, mapping.id) ?? "");
  if (!variantId) throw malformedRecord("offer", variantId, "missing variant id");
  const listPrice = readMoney(row, mapping.listPrice, ctx);
  if (!listPrice) throw malformedRecord("offer", variantId, "missing list price");
  const salePrice = readMoney(row, mapping.salePrice, ctx);
  const sku = readScalar(row, mapping.sku ?? "");
  const title = readScalar(row, mapping.title ?? "");
  const productTitleRaw = mapping.productTitle ? readScalar(row, mapping.productTitle) : undefined;
  const productTitle =
    (typeof productTitleRaw === "string" && productTitleRaw ? productTitleRaw : undefined) ??
    fallbackTitle ??
    "Product";

  return buildOffer({
    productId,
    variantId,
    productTitle,
    ...(typeof title === "string" && title ? { variantTitle: title } : {}),
    ...(typeof sku === "string" && sku ? { sku } : {}),
    listPrice,
    ...(salePrice && salePrice.currency === listPrice.currency ? { salePrice } : {}),
    discounts: [],
    availability: readAvailability(row, mapping.availability),
  });
}

/** Build a live offer from an already-canonical product + variant. */
export function offerFromCanonicalVariant(product: Product, variant: Variant): Offer {
  return buildOffer({
    productId: product.id,
    variantId: variant.id,
    productTitle: product.title,
    ...(variant.title ? { variantTitle: variant.title } : {}),
    ...(variant.sku ? { sku: variant.sku } : {}),
    listPrice: variant.pricing.listPrice,
    ...(variant.pricing.salePrice ? { salePrice: variant.pricing.salePrice } : {}),
    discounts: [],
    availability: variant.availability,
  });
}

export function searchResultFilter(
  items: ProductSummary[],
  input: CatalogSearchInput,
): ProductSummary[] {
  const filters = input.filters ?? {};
  let result = items;
  if (filters.inStock) result = result.filter((s) => s.inStock);
  if (filters.brands?.length) {
    const wanted = filters.brands.map((b) => b.toLowerCase());
    result = result.filter((s) => s.brand && wanted.includes(s.brand.toLowerCase()));
  }
  if (filters.priceMin || filters.priceMax) {
    result = result.filter((s) => {
      if (!s.priceFrom) return false;
      if (filters.priceMin && s.priceFrom!.amount < filters.priceMin.amount) return false;
      if (filters.priceMax && s.priceFrom!.amount > filters.priceMax.amount) return false;
      return true;
    });
  }
  return result;
}

export function sortSummaries(
  items: ProductSummary[],
  sort: NonNullable<CatalogSearchInput["sort"]>,
): ProductSummary[] {
  const copy = [...items];
  switch (sort) {
    case "price_asc":
      copy.sort((a, b) => (a.priceFrom?.amount ?? Infinity) - (b.priceFrom?.amount ?? Infinity));
      break;
    case "price_desc":
      copy.sort((a, b) => (b.priceFrom?.amount ?? -1) - (a.priceFrom?.amount ?? -1));
      break;
    case "discount":
      copy.sort((a, b) => discountDepth(b) - discountDepth(a));
      break;
    case "availability":
      copy.sort((a, b) => stockRank(a) - stockRank(b));
      break;
    case "relevance":
      copy.sort((a, b) => stockRank(a) - stockRank(b) || a.id.localeCompare(b.id));
      break;
  }
  return copy;
}

function stockRank(s: ProductSummary): number {
  return s.inStock ? 0 : 1;
}

function discountDepth(s: ProductSummary): number {
  if (!s.listPrice || !s.priceFrom || s.listPrice.amount <= s.priceFrom.amount) return 0;
  return Math.round(((s.listPrice.amount - s.priceFrom.amount) / s.listPrice.amount) * 100);
}

export function invalidCurrency(currency: string, supported: string[]): void {
  if (currency && !supported.includes(currency)) {
    throw invalidArgument(`currency ${currency} is not supported by this merchant`, { supported });
  }
}
