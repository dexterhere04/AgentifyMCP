# MCP tools

The gateway exposes a **capability-gated** MCP server at `/mcp`
(Streamable HTTP, JSON-RPC 2.0). `tools/list` returns only the tools the
merchant actually supports.

| Tool | Capability | Purpose |
|------|-----------|---------|
| `search_catalog` | catalog | free-text + structured filters |
| `get_product` | catalog | full product + variants |
| `get_variant` | catalog | single variant |
| `check_availability` | inventory | live stock (4-state) |
| `get_offer` | pricing | live discounted price + availability |
| `create_cart` / `get_cart` | cart | cart lifecycle |
| `add_to_cart` | cart | add variant (live-priced, stock-checked) |
| `update_cart_item` / `remove_from_cart` | cart | edit cart |
| `create_checkout` / `get_checkout` | checkout | checkout lifecycle |
| `complete_checkout` | checkout | buyer-approved finalize (see below) |
| `cancel_checkout` | checkout | cancel |
| `get_order` | orders | fetch order result |

## meta.ucp-agent negotiation

Transactional (cart/checkout/orders) tools **require**
`meta.ucp-agent.profile` — the calling agent's UCP profile URI — mirroring how
Shopify stores negotiate. Catalog tools are open. The profile is echoed back in
the tool result `_meta` and threaded into audit events.

## complete_checkout

Requires `approval.buyerApproved = true` and `meta.ucp-agent.profile`.

- **No payment wired**: completes immediately and returns the order.
- **Payment wired** (e.g. Razorpay): starts the payment and returns a payment
  intent (`payment_pending`, a buyer payment URL, provider order id); the order
  is finalized when the provider webhook confirms payment. Agents then call
  `get_order`.

## Conventions

- Money is `{ amount, currency }` in **minor units**.
- `structuredContent` carries the canonical object; `content` is human text.
- Errors are typed `isError` results (`NOT_FOUND`, `INVALID_ARGUMENT`,
  `BACKEND_ERROR`, `RATE_LIMITED`, `UNSUPPORTED_CAPABILITY`, …).
