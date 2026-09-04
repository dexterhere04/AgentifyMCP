# Agentify — Agentic Commerce Gateway

Turn **any ecommerce backend** into an agent-native merchant — discoverable
(UCP), queryable and transactable (MCP) — without rebuilding the storefront.

> Integrate once, normalize once, expose to every compatible agent protocol.

- **Merchant adapters** absorb the merchant's data shape (REST config, mock, SDK)
  and normalize it onto a canonical commerce model.
- **Agent surfaces** are derived from one capability graph: `/.well-known/ucp`,
  an MCP server (`/mcp`), `agents.md` and `llms.txt`.
- **Transactional** cart + checkout with explicit buyer approval, optional
  Razorpay test-mode payment (webhook-verified), and a full audit trail.

## Quickstart

```bash
pnpm install
pnpm demo             # first merchant (mock jewellery store) — full agent checkout
pnpm demo:second      # second merchant over REST — only config changed
pnpm demo:razorpay    # Razorpay test-mode payment (offline fake gateway)
pnpm gateway          # run the gateway server (default :8787)
```

Connect your own REST store in minutes: copy
`packages/adapter-rest/examples/second-store.config.json`, point it at your
API, map your product fields, and run `pnpm gateway`.

## Integrate with ANY ecommerce site — multiple methods

| Method | How | Try it |
|--------|-----|--------|
| Config-driven REST | JSON/YAML field mappings — no code | `packages/adapter-rest` |
| SDK adapter | Implement `CommerceProvider` in code | `@agentify/canonical-commerce` |
| Framework mount | Express / Fastify / Next / Hono | `@agentify/middleware` |
| Standalone | `pnpm gateway` / Docker | `Dockerfile` |
| CLI | `agentify init` (wizard), `generate` (static files) | `@agentify/cli` |
| Static / edge | emit `llms.txt`/`agents.md`/`ucp` + catalog JSON | `agentify generate` |

## Repository

```
packages/
  canonical-commerce   # canonical model, CommerceProvider contract, capability detection
  adapter-mock         # demo merchant (SQLite jewellery store)
  adapter-rest         # config-driven REST adapter + fixture second merchant
  mcp                  # capability-gated MCP tools + Streamable HTTP server
  ucp                  # Universal Commerce Protocol business discovery profile
  metadata             # agents.md + llms.txt generators
  payments             # payment orchestration + audit trail
  payments-razorpay    # Razorpay (test-mode) + offline fake
apps/gateway           # composer: createGateway({ provider, payment }) + server
```

## Documentation

Full docs live in [`/docs`](docs/). Start with
[`docs/index.md`](docs/index.md) and the
[integration matrix](docs/integrations/).

## Development

```bash
pnpm typecheck   # tsc across all packages
pnpm test        # vitest — full suite
pnpm build       # compile ESM + types into dist/ (for publishing)
pnpm demo*       # runnable demos
```

## License

MIT — see [LICENSE](LICENSE).
