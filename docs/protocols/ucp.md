# UCP discovery

The gateway serves a Universal Commerce Protocol **business discovery profile**
at `/.well-known/ucp`, conforming to the schema at ucp.dev (Google/Shopify
co-developed standard).

## Example

```jsonc
{
  "ucp": {
    "version": "2026-08-25",
    "services": {
      "dev.ucp.shopping": [
        { "version": "2026-08-25", "transport": "mcp", "endpoint": "https://host/mcp" }
      ]
    },
    "capabilities": {
      "dev.ucp.shopping.catalog.search": [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.catalog.lookup": [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.cart":     [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.checkout": [{ "version": "2026-08-25" }],
      "dev.ucp.shopping.order":    [{ "version": "2026-08-25" }]
    },
    "payment_handlers": {} // e.g. dev.agentify.razorpay.test when payments are wired
  },
  "keys": []
}
```

## Rules

- `version` is `YYYY-MM-DD`; older protocol versions are listed under
  `supported_versions` (not yet generated — single-version today).
- Capabilities are **derived from the provider's capability graph** — never
  hand-authored — so a merchant can only ever advertise what it implements.
- Headers: `Content-Type: application/json`, `Cache-Control: max-age=3600`,
  CORS `*` for agents.
- Non-HTTPS public origins fail startup (localhost exempt).
- The profile is validated at startup (`assertValidUcpProfile`).

See [concepts/capability-graph](../concepts/capability-graph.md) for the
capability mapping.
