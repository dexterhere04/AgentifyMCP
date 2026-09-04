# Local dashboard

`apps/dashboard` is a **standalone local admin tool** — separate process, own
port — for configuring, testing and running Agentify merchants with a friendly
UI. It never embeds into the gateway; it only writes config files, runs the
same shared smoke tests, and can spawn the gateway as a child process.

```
apps/dashboard (UI at :5173 dev / API at :8788)
  ├─ merchants CRUD       data/merchants/*.json  (REST adapter configs)
  ├─ validate             merchant-config.schema.json + validateRestConfig
  ├─ test                 live smoke OR offline "Luna & Co" fixture
  ├─ sample               probe an endpoint and copy JSON paths for mapping
  ├─ run                  start/stop a child gateway (mock or REST merchant)
  └─ audit                explainable money-action trail (shared SQLite file)
```

## Run

```bash
pnpm dashboard:build   # build the UI once (into apps/dashboard/web-dist)
pnpm dashboard         # API + built UI on http://localhost:8788

# Development (hot reload):
pnpm dashboard         # terminal 1 — API on :8788
pnpm dashboard:web     # terminal 2 — Vite UI on :5173 (proxies /api)
```

## What you can do

1. **Merchants** — create a REST merchant (blank template) or start the demo.
2. **Config** — edit the JSON config (identity, connection, endpoints, field
   mappings) with live validation; fetch a **sample** payload to grab JSON
   paths for the mapping step.
3. **Test** — run the shared smoke (`search → getProduct → getOffer`) against
   the live store or the offline fixture, and see normalized rows + capability
   status.
4. **Run** — start the gateway as a child for the saved merchant (or the demo
   mock), with optional Razorpay test keys; watch logs; open `/mcp`,
   `/.well-known/ucp`, `agents.md`, `llms.txt`.
5. **Readiness** — live checklist derived from the child gateway's UCP profile.
6. **Audit** — every explainable, bounded, gated money action by checkout/cart.

## Environment

| var | default | purpose |
|-----|---------|---------|
| `DASHBOARD_PORT` | `8788` | dashboard API/UI port |
| `DATA_DIR` | `./data/merchants` | merchant config files |
| `AGENTIFY_AUDIT_PATH` | `<DATA_DIR>/audit.db` | shared SQLite audit file |

Merchant files are plain `RestAdapterConfig` JSON — the gateway/CLI can consume
the same files (`MERCHANT_CONFIG=<file> pnpm gateway`).

Tests: `pnpm --filter @agentify/dashboard test` (merchants CRUD/validation,
fixture smoke, gateway child start/readiness/stop).
