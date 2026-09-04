# The capability graph

Every agent surface is **derived from one source of truth**: the methods a
merchant's `CommerceProvider` actually implements.

```
CommerceProvider
      │  detectCapabilities()
      ▼
 Capabilities { catalog, inventory, pricing, cart, checkout, orders }
      │
      ├──► /.well-known/ucp    (UCP capability ids)
      ├──► MCP tools/list      (which tools exist)
      ├──► agents.md           (supported actions)
      └──► llms.txt            (tool list)
```

Canonical capability → UCP capability:

| canonical | UCP capability |
|-----------|----------------|
| catalog   | `dev.ucp.shopping.catalog.search`, `dev.ucp.shopping.catalog.lookup` |
| cart      | `dev.ucp.shopping.cart` |
| checkout  | `dev.ucp.shopping.checkout` |
| orders    | `dev.ucp.shopping.order` |

Rule (from the architecture doc): the gateway advertises **only** the
capabilities a merchant actually supports. If the merchant has no cart, no cart
tools are listed and the UCP profile does not advertise `dev.ucp.shopping.cart`.

This is what makes the "second merchant" proof possible: connecting a merchant
with a different data shape changes **only the adapter config** — the UCP
profile, MCP surface and metadata follow automatically.
