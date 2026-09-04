import type { RestAdapterConfig } from "./config.js";

/**
 * Ready-made config for the fixture "second store" (Luna & Co). It is pure
 * data — the same `RestCommerceProvider` serves any merchant; only this object
 * changes between merchants.
 */
export function buildSecondStoreConfig(opts: {
  baseUrl: string;
  token: string;
}): RestAdapterConfig {
  const { baseUrl, token } = opts;
  return {
    id: "luna-co-rest",
    merchant: {
      name: "Luna & Co",
      description: "Second merchant connected via config-driven REST adapter (Shape B/C).",
      url: "https://www.second.example",
      supportEmail: "care@second.example",
      country: "US",
      defaultCurrency: "INR",
    },
    http: {
      baseUrl,
      auth: { type: "bearer", token },
      timeoutMs: 3000,
    },
    catalog: {
      search: {
        path: "/products",
        query: { q: "{query}", category: "{category}", page: "{page}", limit: "{limit}" },
        itemsPath: "$.data",
        totalPath: "$.total",
        cursorPath: "$.next_cursor",
        pageSize: 10,
      },
      productUrl: "/products/{productId}",
      variantUrl: "/variants/{variantId}",
      offerUrl: "/offers?variant_id={variantId}",
      stockUrl: "/variants/{variantId}/stock",
    },
    mappings: {
      product: {
        id: "$.product_id",
        title: "$.title",
        description: "$.description",
        category: "$.category",
        brand: "$.brand",
        images: "$.images",
        attributes: { material: "$.material", brand: "$.brand" },
        variants: {
          path: "$.variants",
          each: secondStoreVariantMapping(),
        },
      },
      offer: {
        ...secondStoreVariantMapping(),
        id: "$.variant_id",
        productId: "$.product_id",
        title: "$.variant_title",
        productTitle: "$.title",
        sku: "$.sku",
      },
    },
  };
}

export function secondStoreVariantMapping() {
  return {
    id: "$.variant_id",
    productId: "$.product_id",
    sku: "$.sku",
    title: "$.title",
    attributes: {
      size: "$.attributes.size",
      length: "$.attributes.length",
      material: "$.attributes.material",
      quantity: "$.attributes.quantity",
    },
    listPrice: { path: "$.pricing.mrp", unit: "major" },
    salePrice: { path: "$.pricing.selling_price", unit: "major" },
    availability: { path: "$.inventory" },
  } as const;
}
