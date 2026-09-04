# Config-driven REST adapter

`@agentify/adapter-rest` turns a plain JSON REST API into a `CommerceProvider`
using **only configuration** — no merchant code.

## Config shape

```jsonc
{
  "id": "luna-co-rest",
  "merchant": { "name": "Luna & Co", "defaultCurrency": "INR" },
  "http": {
    "baseUrl": "https://api.example.com",
    "auth": { "type": "bearer", "token": "..." },   // or apiKey / none
    "timeoutMs": 3000
  },
  "catalog": {
    "search": {
      "path": "/products",
      "query": { "q": "{query}", "page": "{page}", "limit": "{limit}" },
      "itemsPath": "$.data",          // where the product rows live
      "totalPath": "$.total",
      "cursorPath": "$.next_cursor"   // optional cursor mode
    },
    "productUrl": "/products/{productId}",
    "variantUrl": "/variants/{variantId}",
    "offerUrl": "/offers?variant_id={variantId}",   // optional live offer
    "stockUrl": "/variants/{variantId}/stock"        // optional live stock
  },
  "mappings": { "product": { /* field mappings below */ } }
}
```

## Field mappings (JSON paths)

Each canonical field maps to a `$`-rooted JSON path:

```jsonc
"product": {
  "id": "$.product_id",
  "title": "$.title",
  "description": "$.description",
  "category": "$.category",
  "brand": "$.brand",
  "images": "$.images",
  "attributes": { "material": "$.material" },
  "variants": {
    "path": "$.variants",           // nested variant array
    "each": {
      "id": "$.variant_id",
      "sku": "$.sku",
      "attributes": { "size": "$.attributes.size" },
      "listPrice": { "path": "$.pricing.mrp", "unit": "major" },
      "salePrice": { "path": "$.pricing.selling_price", "unit": "major" },
      "availability": { "path": "$.inventory" }   // bool | number | {available,quantity} | string
    }
  }
}
```

- **Money**: `{ path, unit: "major" | "minor", currency? }` — converted to
  canonical minor units.
- **Availability**: raw values (`12`, `true`, `"in_stock"`,
  `{available:true,quantity:12}`) normalize to the four-state model.
- Flat products (Shape A: `id/name/price/stock`) use `singleVariant` instead of
  nested `variants`.
- URLs interpolate `{productId}` / `{variantId}` tokens.

## Failures translate cleanly

`404 → NOT_FOUND`, `401/403 → BACKEND_UNAUTHORIZED`, `429 → RATE_LIMITED`,
`5xx → BACKEND_ERROR`, timeout → `BACKEND_TIMEOUT`, invalid JSON →
`BACKEND_ERROR`.

## Validation

Malformed configs **fail at startup** (`validateRestConfig`). A JSON Schema is
published at `packages/adapter-rest/schemas/merchant-config.schema.json`.

Full worked example: `packages/adapter-rest/examples/second-store.config.json`.
