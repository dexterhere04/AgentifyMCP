# API reference

Hand-written orientation to the public surfaces (TypeDoc generation can be
added later; package `dist/*.d.ts` are the authoritative types).

## @agentify/canonical-commerce

- Types & Zod schemas: `Money`, `Product`, `Variant`, `Offer`, `Availability`,
  `Discount`, `Merchant`, `Cart`, `Checkout`, `Order`, `PaymentGateway`,
  `PaymentIntent`.
- Contract: `CommerceProvider`, `detectCapabilities`, `ProviderError` (+codes).
- Math: `computeBestPrice`, `buildOffer`, `availabilityFromSource`,
  `fromMajor/fromMinor`, `isDiscountActive`.

## @agentify/adapter-rest

- `RestCommerceProvider(config)`, `validateRestConfig(config)`, field-mapping
  helpers (`mapProduct`, `mapVariant`, `moneyFromRaw`), JSON-path `read`,
  fixture store (`createFixtureStoreServer`), example config builder
  (`buildSecondStoreConfig`).

## @agentify/mcp

- `CommerceToolRegistry` (list/call), `createCommerceMcpServer`,
  `createStreamableHttpEndpoint` (Web-Standard Streamable HTTP), tool arg
  schemas.

## @agentify/ucp

- `buildUcpProfile`, `validateUcpProfile`, `assertValidUcpProfile`,
  capability-id constants.

## @agentify/metadata

- `createMetadata(provider, config)` → `agentsMarkdown()` / `llmsTxt()`.

## @agentify/payments · @agentify/payments-razorpay

- `PaymentOrchestrator` (`startPayment`, `handleWebhook`), `AuditStore`;
  `RazorpayGateway`, `FakeRazorpayGateway`, `razorpaySignature`.

## @agentify/gateway

- `createGateway({ config?, provider?, payment? })` → `{ app, mcp, metadata,
  ucpProfile, audit, payments, ... }`.

## @agentify/middleware · @agentify/cli

- `mountExpress(app, gateway)`, `mountHono(app, gateway)`,
  `serveGatewayNode(req, res)`; `agentify init|generate|serve`.
