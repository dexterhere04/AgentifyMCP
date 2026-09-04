# Roadmap

Status of the architecture doc's MVP plan.

| MVP | What | Status |
|-----|------|--------|
| 0 | Canonical model + local mock merchant | ✅ |
| 1 | Agent-queryable catalog (MCP + `agents.md` + `llms.txt`) | ✅ |
| 2 | UCP discovery (`/.well-known/ucp`) | ✅ |
| — | Cart + checkout foundation (approval-gated), `get_order` | ✅ |
| — | `meta.ucp-agent` negotiation | ✅ |
| 3 | Config-driven REST adapter + second merchant | ✅ |
| 7 | Razorpay test-mode payment (webhook-verified + polling) + audit | ✅ |
| 4 | OpenAPI-assisted integration | 🔜 |
| 5 | Catalog index + semantic search | 🔜 |
| 6 | Full checkout fidelity (shipping/coupon, state machine polish) | 🔜 |
| 8 | Integration dashboard + multi-tenant | 🔜 |
| 9 | Revenue intelligence (upsell/cross-sell) | 🔜 |

## Distribution (this effort)

- ✅ `@agentify/*` packages with ESM build + types
- ✅ Framework mounts (`@agentify/middleware`: Express/Hono/Node)
- ✅ CLI (`@agentify/cli`: `init` / `generate` / `serve`)
- ✅ Docker + `docker-compose`
- ✅ REST adapter config JSON Schema
- ✅ GitHub Actions CI + changesets release flow
- ✅ `/docs` (this tree) + TypeDoc entry
- 🔜 Un-private + publish packages to npm (requires npm credentials)
- 🔜 OpenAPI adapter (MVP 4)

## Done criteria (buildathon)

A custom, non-Shopify store connects through the gateway; the store carries no
agent logic; agents discover it (UCP), search/pricing/availability are live;
cart + checkout work; buyer approval is required; Razorpay test mode completes;
an order is created; an audit trail explains every money-changing step; one
graceful failure (stock loss / price change / duplicate request) is handled
safely; and a second merchant connects by config alone.
