# Integration methods — connect ANY ecommerce backend

Because UCP/MCP never see a merchant's private schema, there are many ways to
plug a store in. Pick the one that fits how you operate.

| # | Method | Code? | Best for | Status |
|---|--------|-------|----------|--------|
| 1 | [Config-driven REST](/integrations/rest-adapter) | No | JSON REST APIs, bearer/API-key auth | ✅ `@agentify/adapter-rest` |
| 2 | [SDK adapter](/integrations/sdk-adapter) | Yes (small) | Full control, in-process, strongest correctness | ✅ `CommerceProvider` |
| 3 | [Framework mount](/integrations/middleware) | Mount call | Express / Fastify / Next.js / Hono backends | ✅ `@agentify/middleware` |
| 4 | Standalone + Docker | No | Run the gateway beside the store | ✅ `Dockerfile`, `pnpm gateway` |
| 5 | CLI (`init`/`generate`/`serve`) | No | Scaffold config, emit static files, boot | ✅ `@agentify/cli` |
| 6 | Static / edge files | No | Any CDN/static host: `llms.txt`, `agents.md`, `/.well-known/ucp`, `catalog.json` | ✅ `agentify generate` |
| 7 | OpenAPI-assisted | No | Upload your OpenAPI spec, get a suggested adapter | 🔜 MVP 4 |
| 8 | GraphQL / DB / feeds | No | Shopify-style DBs, PostgreSQL/MySQL, CSV/JSON/XML feeds | 🔜 planned |
| 9 | Hosted multi-tenant SaaS | No | Dashboard onboarding, encrypted secrets per tenant | 🔜 MVP 8 |

## The golden test

> If a second merchant can be integrated by **only changing the adapter or
> configuration**, the architecture is working.

Run `pnpm demo:second` to see it: the same gateway, a completely different
merchant JSON shape, zero gateway code changes.

## Adapters are open

The adapter is a documented contract, not a hard-coded list. Any backend can be
wrapped by implementing `CommerceProvider` + passing the shared contract suite
— publish your own adapter package and it slots into the same gateway.
