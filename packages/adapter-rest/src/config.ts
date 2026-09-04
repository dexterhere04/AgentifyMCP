/**
 * Config-driven REST adapter model (architecture doc section 5.2).
 *
 * A merchant describes its HTTP surface + field mappings in this config; no
 * merchant-specific code is required. The same adapter class serves every
 * merchant — only the config changes.
 */

/** A scalar read: a JSON path (`$`-rooted) or a constant value. */
export type ScalarRef =
  | string
  | { path: string }
  | { value: string | number | boolean | null };

export interface MoneyRef {
  path: string;
  /** Interpretation of the raw value. Defaults to "major" units. */
  unit?: "major" | "minor";
  /** Fixed currency; defaults to the merchant defaultCurrency. */
  currency?: string;
}

export interface AvailabilityRef {
  path: string;
}

/** Maps one merchant variant row into a canonical Variant. */
export interface VariantMapping {
  id: string;
  /** When absent, falls back to `$.product_id` then the parent product id. */
  productId?: string;
  sku?: string;
  title?: string;
  attributes?: Record<string, string>;
  listPrice: MoneyRef | string;
  salePrice?: MoneyRef | string;
  availability: AvailabilityRef | string;
}

export interface ProductVariantRows {
  /** Path to the nested variant array (e.g. "$.variants"). */
  path: string;
  each: VariantMapping;
}

/** Maps one merchant product row into a canonical Product. */
export interface ProductMapping {
  id: string;
  title: string;
  description?: string;
  category?: string;
  brand?: string;
  images?: string;
  attributes?: Record<string, string>;
  variants?: ProductVariantRows;
  /**
   * Some merchants return a flat product row (Shape A: id/price/stock). When
   * `variants` is absent or empty, `singleVariant` is applied to the SAME row
   * to synthesize one variant (whose id usually equals the product id).
   */
  singleVariant?: VariantMapping;
}

/** Extends VariantMapping with the live product title for offer building. */
export interface OfferMapping extends VariantMapping {
  productTitle?: string;
}

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "apiKey"; header: string; key: string };

export interface SearchEndpointConfig {
  /** Path template relative to baseUrl, e.g. "/products". */
  path: string;
  /** Query templates keyed by parameter name; values may interpolate {query},{category},{page},{limit}. */
  query?: Record<string, string>;
  /** Path to the array of product rows inside the response. Default "$". */
  itemsPath?: string;
  /** Optional path to a total count for pagination. */
  totalPath?: string;
  /** Optional path to a next-page cursor value. */
  cursorPath?: string;
  pageParam?: string;
  limitParam?: string;
  pageSize?: number;
}

export interface RestHttpConfig {
  baseUrl: string;
  auth?: AuthConfig;
  headers?: Record<string, string>;
  /** Request timeout in ms. Default 5000. */
  timeoutMs?: number;
}

export interface RestCatalogEndpoints {
  search: SearchEndpointConfig;
  /** Template with {productId}. */
  productUrl: string;
  /** Template with {variantId}. */
  variantUrl: string;
  /** Optional live-offer template with {variantId}. */
  offerUrl?: string;
  /** Optional live-stock template with {variantId}. */
  stockUrl?: string;
}

export interface RestAdapterConfig {
  id: string;
  merchant: {
    name: string;
    description?: string;
    url?: string;
    supportEmail?: string;
    country?: string;
    defaultCurrency: string;
  };
  http: RestHttpConfig;
  catalog: RestCatalogEndpoints;
  mappings: {
    product: ProductMapping;
    offer?: OfferMapping;
  };
}
