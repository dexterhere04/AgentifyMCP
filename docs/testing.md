# Testing

The test strategy mirrors the architecture doc's test pyramid.

## Layers

1. **Unit** — money normalization, discount/offer math, availability mapping,
   field mapping (REST adapter), capability detection, payment signature
   helpers.
2. **Contract** — the **shared `CommerceProvider` contract suite**
   (`tests/contracts/contract-suite.ts`) runs **unchanged** against every
   adapter: stable IDs, valid Money, canonical availability, unknown-product
   handling, deterministic pagination, typed failures. A new integration is
   accepted only if it passes.
3. **Protocol (MCP)** — initialize handshake, `tools/list`, valid/invalid
   calls, input-schema rejection, unknown tools, capability-gating, merchant
   backend 500/timeout, rate limiting, session handling.
4. **UCP** — discovery profile shape, version, only-supported capabilities,
   fixture contract (catalog-only vs catalog+cart vs full merchant),
   malformed-config and capability-mismatch validation.
5. **Payments** — orchestrator (start → signed webhook → order), invalid
   signature, amount mismatch, unknown checkout, duplicate-callback
   idempotency, audit events; Razorpay gateway unit surface.
6. **Integration / HTTP** — full MCP agent flow, webhooks over HTTP, second
   merchant via REST adapter, metadata + UCP over HTTP, gateway surfaces.
7. **E2E demos** — `scripts/agent-demo.ts`, `second-store-demo.ts`,
   `razorpay-demo.ts` (headless, driven with the official MCP client SDK).

## Commands

```bash
pnpm test         # everything
pnpm typecheck    # strict TS across all packages
pnpm build        # compile ESM + types (distribution)
pnpm demo*        # runnable end-to-end flows
```

## Failure fixtures

The mock merchant seeds corrupt records (malformed rows, duplicate SKUs),
out-of-stock/limited/unknown inventory, backend timeouts/500s and rate limits;
the REST fixture injects `401/403/404/429/500/timeout/invalid-JSON`. Every one
is covered by a test.
