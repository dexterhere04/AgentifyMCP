# SDK adapter (write code, full control)

For merchants willing to add code — the strongest-correctness integration.
Implement the `CommerceProvider` contract (see
[Provider contract](../concepts/provider-contract.md)) in-process.

```ts
import { createGateway } from "@agentify/gateway";
import type { CommerceProvider } from "@agentify/canonical-commerce";

const provider: CommerceProvider = {
  id: "my-store",
  async merchant() {
    return { id: "my-store", name: "My Store", defaultCurrency: "USD" };
  },
  catalog: {
    search: (input) => searchMyProducts(input),   // normalize -> canonical
    getProduct: async (id) => normalize(await api.get(`/p/${id}`)),
    getVariant: async (id) => normalize(await api.get(`/v/${id}`)),
  },
  inventory: { check: (input) => api.stock(input.variantId) },
  pricing: { getOffer: (input) => computeOffer(input) },
  // cart / checkout / orders: only what you support — the gateway derives
  // the advertised capabilities from what you implement.
};

const gateway = await createGateway({ provider });
```

Because capability detection is structural, the SDK adapter grows naturally:
implement `cart` → the MCP surface and UCP profile add cart automatically.

Recommended: also run the shared **contract suite** against your provider
(`tests/contracts/contract-suite.ts`) — it is the acceptance gate for every
adapter.
