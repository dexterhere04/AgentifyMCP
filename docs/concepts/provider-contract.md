# The CommerceProvider contract

Every merchant integration implements the same interface
(`@agentify/canonical-commerce`):

```ts
interface CommerceProvider {
  readonly id: string;
  merchant(): Promise<Merchant>;
  catalog: {
    search(input?): Promise<CatalogSearchResult>;
    getProduct(id): Promise<Product>;
    getVariant(id): Promise<Variant>;
  };
  inventory?:  { check(input): Promise<Availability> };
  pricing?:    { getOffer(input): Promise<Offer> };
  cart?:       { create/get/addItem/updateItem/removeItem };
  checkout?:   { create/get/complete/cancel };
  orders?:     { get(id): Promise<Order> };
}
```

## Rules

- Only `catalog` + `merchant` are required. Everything else is **optional** and
  drives capability detection.
- A catalog-only merchant never implements cart/checkout — the gateway simply
  stops advertising them.
- `checkout.complete` requires an explicit `approval: { buyerApproved: true }`.
- Transactional calls carry `TransactionMeta.agentProfile` (the calling agent's
  UCP profile, i.e. `meta.ucp-agent.profile`) for negotiation + audit.

## Typed errors

Backends never leak their own errors to agents. Adapters translate to
`ProviderError` codes:

```
BACKEND_ERROR · BACKEND_TIMEOUT · BACKEND_UNAUTHORIZED · NOT_FOUND
MALFORMED_RECORD · INVALID_ARGUMENT · RATE_LIMITED · UNSUPPORTED_CAPABILITY · INTERNAL
```

## The contract suite

Every adapter must pass the **shared contract suite**
(`tests/contracts/contract-suite.ts`): stable IDs, valid Money, canonical
availability, unknown-product handling, deterministic pagination and typed
failures. A new integration is only "done" when it passes the suite unchanged.
See [Testing](testing.md).
