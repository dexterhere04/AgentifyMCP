import { z } from "zod";
import type { Availability } from "./availability.js";
import type { Merchant } from "./merchant.js";
import type { Money } from "./money.js";
import type { Offer, OfferInput } from "./offer.js";
import type { Product, Variant } from "./product.js";

/**
 * The Merchant Adapter contract (architecture doc section 4).
 *
 * Every integration implements the same logical interface. Capabilities are
 * OPTIONAL: a catalog-only merchant does not implement cart/checkout/orders.
 * The gateway derives advertised capabilities from the methods a provider
 * actually implements.
 */

export const SORT_OPTIONS = ["relevance", "price_asc", "price_desc", "discount", "availability"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 50;

export interface CatalogFilters {
  /** Only products that currently have any sellable stock. */
  inStock?: boolean;
  /** Filter on the cheapest live effective price across variants. */
  priceMin?: Money;
  priceMax?: Money;
  brands?: string[];
  /** Merchant-specific structured attribute filters (e.g. material, occasion). */
  attributes?: Record<string, string>;
}

export interface CatalogSearchInput {
  query?: string;
  category?: string;
  /** Requested result currency; the adapter must translate if supported. */
  currency?: string;
  filters?: CatalogFilters;
  sort?: SortOption;
  /** 1-based page number. */
  page?: number;
  limit?: number;
}

export interface ProductSummary {
  id: string;
  title: string;
  category?: string;
  brand?: string;
  currency: string;
  /** Cheapest live effective offer across variants (sale/automatic discounts applied). */
  priceFrom?: Money;
  priceTo?: Money;
  /** Cheapest list price across variants (used to show discount depth). */
  listPrice?: Money;
  inStock: boolean;
  hasDiscount: boolean;
  images: string[];
  variantsCount: number;
  sourceUrl?: string;
}

export interface CatalogSearchResult {
  items: ProductSummary[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface InventoryQuery {
  variantId?: string;
  productId?: string;
}

// ---------------------------------------------------------------------------
// Transactional capability types (added in later MVPs; the contract is typed
// now so adapters can grow without breaking consumers).
// ---------------------------------------------------------------------------

export type CartStatus = "active" | "abandoned" | "merged" | "converted";

export const CartStatusSchema = z.enum(["active", "abandoned", "merged", "converted"]);

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  title: string;
  unitPrice: Money;
  quantity: number;
  image?: string;
  sku?: string;
  attributes?: Record<string, string>;
}

export interface Cart {
  id: string;
  status: CartStatus;
  currency: string;
  items: CartItem[];
  subtotal: Money;
  updatedAt: string;
  expiresAt?: string;
}

export interface CartOperation {
  cartId?: string;
}

export interface AddCartItemInput extends CartOperation {
  variantId: string;
  quantity: number;
}

/**
 * Identity/negotiation metadata passed on transactional calls. The `agentProfile`
 * is the calling agent's own UCP discovery URI (`meta.ucp-agent.profile`), used
 * for capability negotiation and audit before any money-changing action.
 */
export interface TransactionMeta {
  agentProfile?: string;
}

/** Explicit, contemporaneous buyer approval for a checkout completion. */
export interface BuyerApproval {
  buyerApproved: boolean;
}

export interface CheckoutTotals {
  subtotal: Money;
  shipping?: Money;
  tax?: Money;
  discounts?: Money;
  total: Money;
  currency: string;
}

export interface Checkout {
  id: string;
  status: "created" | "ready_for_payment" | "awaiting_approval" | "payment_pending" | "completed" | "cancelled" | "failed" | "expired";
  currency: string;
  totals?: CheckoutTotals;
  orderId?: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface Order {
  id: string;
  checkoutId?: string;
  currency: string;
  status: "created" | "confirmed" | "fulfilled" | "cancelled" | "refunded";
  total?: Money;
  createdAt: string;
}

/**
 * The adapter contract. Only `catalog` (and `merchant`) is always required.
 * inventory/pricing/cart/checkout/orders are optional and drive capability
 * detection — a catalog-only merchant simply omits the others.
 */
export interface CommerceProvider {
  readonly id: string;

  merchant(): Promise<Merchant>;

  catalog: {
    search(input?: CatalogSearchInput): Promise<CatalogSearchResult>;
    getProduct(id: string): Promise<Product>;
    getVariant(id: string): Promise<Variant>;
  };

  inventory?: {
    check(input: InventoryQuery): Promise<Availability>;
  };

  pricing?: {
    getOffer(input: OfferInput): Promise<Offer>;
  };

  cart?: {
    create(input?: { currency?: string } & TransactionMeta): Promise<Cart>;
    get(cartId: string): Promise<Cart>;
    addItem(input: AddCartItemInput & TransactionMeta): Promise<Cart>;
    updateItem(input: { cartId?: string; itemId: string; quantity: number } & TransactionMeta): Promise<Cart>;
    removeItem(input: CartOperation & { itemId: string } & TransactionMeta): Promise<Cart>;
  };

  checkout?: {
    create(input: { cartId: string } & TransactionMeta): Promise<Checkout>;
    get(id: string): Promise<Checkout>;
    complete(id: string, options?: { approval?: BuyerApproval } & TransactionMeta): Promise<Order>;
    cancel(id: string, options?: TransactionMeta): Promise<Checkout>;
  };

  orders?: {
    get(id: string): Promise<Order>;
  };

  /** Optional: budget-aware upsell/cross-sell suggestions for a cart. */
  recommendations?: {
    get(input: RecommendationInput): Promise<RecommendationItem[]>;
  };
}

export interface RecommendationItem {
  productId: string;
  variantId: string;
  title: string;
  kind: "upsell" | "cross-sell";
  /** Why the agent may suggest it (e.g. "higher spec of an item in your cart"). */
  reason: string;
  price: Money;
  listPrice?: Money;
  inStock: boolean;
}

export interface RecommendationInput {
  cartId: string;
  /** Hard budget ceiling in minor units — suggestions never exceed it. */
  budgetMinor?: number;
  currency?: string;
}

export type ResolvedProvider = {
  provider: CommerceProvider;
  capabilities: import("./capability.js").Capabilities;
};
