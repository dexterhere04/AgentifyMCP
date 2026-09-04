# Security

Threat model for the gateway is defensive-first:

## Data separation

- Merchant API credentials live **only** in adapter config/server-side env.
  They are never serialized into UCP/MCP responses or `agents.md`.
- The UCP profile and MCP tool schemas expose structure, never secrets.

## Merchant backends

- Adapters translate HTTP failures and never leak internal URLs/errors verbatim.
- REST adapter `baseUrl` is a config value (operator-controlled) — a future
  dashboard must SSRF-guard merchant-configured URLs.
- Config validation fails startup on malformed/insecure config.

## Webhooks & payments

- HMAC-SHA256 signature verification over the **raw** body
  (`x-razorpay-signature`) with constant-time comparison.
- Amount + currency must match the payment intent.
- Idempotent per payment id; replay/duplicate callbacks safe.

## Protocol surface

- `tools/list` only exposes implemented capabilities.
- Inputs are JSON-Schema validated (Zod) before any provider call.
- Typed error codes keep internals opaque.

## Agent/buyer trust

- `meta.ucp-agent.profile` is required before transactional tools.
- `complete_checkout` requires explicit buyer approval.
- Every money-changing action is audited.

## Rate limits

Merchant `429`s surface as typed `RATE_LIMITED`; the gateway can impose its own
budget per tenant (see [multi-tenant](deploy/multi-tenant.md)).

## Known future work

SSRF allow-listing for merchant URLs, secret encryption at rest, OAuth 2.1 for
MCP, and UCP identity linking.
