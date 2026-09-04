# Deploy

## Standalone server

```bash
pnpm gateway
```

Environment:

| var | default | purpose |
|-----|---------|---------|
| `PORT` | `8787` | HTTP port |
| `BASE_URL` | `http://localhost:8787` | public origin (used in UCP/metadata) |
| `STORE_URL` | `= BASE_URL` | storefront origin for product URLs |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | — | enable Razorpay test-mode payments |
| `RAZORPAY_WEBHOOK_SECRET` | — | webhook HMAC secret (webhook reconciliation) |
| `RAZORPAY_MODE` | `test` | `test` or `live` |

## Docker

```bash
docker compose up --build
# or
docker build -t agentify-gateway .
docker run -p 8787:8787 -e BASE_URL=http://localhost:8787 agentify-gateway
```

## CLI

```bash
pnpm exec tsx packages/cli/src/cli.ts serve --config merchant.config.json --port 8787
```

## Static / edge files

```bash
pnpm exec tsx packages/cli/src/cli.ts generate --config merchant.config.json --out dist/static
```

Emits `llms.txt`, `agents.md`, `/.well-known/ucp` and `catalog.json` — deploy
to any static host or CDN. For a full interactive MCP endpoint at the edge, the
gateway's transports are Web-Standard and can run on Workers/Deno/Bun.

## Security checklist

- Always terminate TLS (HTTPS) for public origins.
- Keep merchant API credentials server-side only; never expose them to agents.
- Webhook endpoints verify HMAC signatures over the **raw** body.
- Never let MCP parameters reach raw SQL, shell or unchecked internal URLs.
- Apply rate limits at the gateway and translate merchant `429`s.

See [Security](security.md).
