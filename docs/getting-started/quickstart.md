# Quickstart

## Prerequisites

- Node.js ≥ 22, pnpm ≥ 9.

## Run the demos

```bash
pnpm install
pnpm demo             # first merchant (mock jewellery store) — full agent checkout
pnpm demo:second      # second merchant over REST — only the config changed
pnpm demo:razorpay    # Razorpay test-mode payment (offline fake gateway)
pnpm gateway          # run the gateway server on :8787
```

The first demo is a headless agent built on the **official MCP client SDK**; it
discovers the merchant via `/.well-known/ucp`, lists MCP tools, searches,
prices, carts, checks out and (with buyer approval) completes an order —
verifying live stock and price at every step.

General-purpose agents can also use the reusable
[shopping skill](../SKILL.md) instead of per-store prompting — install it once
and shop any Agentify-powered store (see
[protocols/agent-skill.md](../protocols/agent-skill.md)).

## What a demo prints

```
1 · Discover agent endpoints
2 · Fetch the UCP business discovery profile
3 · MCP initialize + tools/list
...
9 · Final recommendation (respecting budget)
10 · Transact (catalog + cart + checkout) with meta.ucp-agent
```

## Connect your own REST store

1. Copy the template:

   ```bash
   cp packages/adapter-rest/examples/second-store.config.json merchant.config.json
   ```

2. Edit `http.baseUrl`, the `catalog` endpoint paths and the `mappings`
   (JSON-path field mappings from your API's product JSON to canonical fields).
   Validate with the JSON Schema at
   `packages/adapter-rest/schemas/merchant-config.schema.json`.

3. Run the gateway for your config:

   ```bash
   pnpm exec tsx packages/cli/src/cli.ts serve --config merchant.config.json
   ```

4. Check the surfaces:

   ```bash
   curl localhost:8787/.well-known/ucp
   curl localhost:8787/llms.txt
   curl localhost:8787/agents.md
   ```

## Development commands

```bash
pnpm typecheck   # tsc across all packages
pnpm test        # vitest (full suite + contract tests)
pnpm build       # compile ESM + types into dist/
```

See [Testing](testing.md) for the test pyramid and the shared adapter contract
suite every merchant adapter must pass.
