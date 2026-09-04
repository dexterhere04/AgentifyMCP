# Agentify — Agentic Commerce Gateway

> **Integrate once, normalize once, expose to every compatible agent protocol.**

Agentify upgrades an existing ecommerce store into an agent-native merchant
without rebuilding the storefront. It adds a canonical commerce model, catalog
+ availability access for AI agents, Universal Commerce Protocol (UCP)
discovery, MCP tools, `agents.md`, `llms.txt`, cart/checkout, payment
orchestration and an audit trail — all through **one integration layer**.

- [Architecture](architecture.md) — the full design document.
- [Quickstart](getting-started/quickstart.md) — run the demos in 2 minutes.
- [Connect your store](integrations/matrix.md) — the many integration methods.
- [Roadmap](roadmap.md) — what exists and what is next.

## The core rule

**UCP and MCP never depend directly on a merchant schema.** Every merchant's
data shape is absorbed by an **adapter**, which normalizes onto a canonical
commerce model. From that single model, the gateway *derives* every agent
surface (UCP profile, MCP tools, `agents.md`, `llms.txt`) via the merchant's
**capability graph**.

## Layout

| Area | Docs |
|------|------|
| Concepts | [Canonical model](concepts/canonical-model.md) · [Provider contract](concepts/provider-contract.md) · [Capability graph](concepts/capability-graph.md) |
| Integrations | [Matrix](integrations/matrix.md) · [REST config](integrations/rest-adapter.md) · [SDK](integrations/sdk-adapter.md) · [Middleware](integrations/middleware.md) |
| Protocols | [UCP](protocols/ucp.md) · [MCP tools](protocols/mcp-tools.md) · [Shopping skill](protocols/agent-skill.md) |
| Payments | [Razorpay](payments/razorpay.md) |
| Deploy | [Server](deploy/server.md) · [Multi-tenant](deploy/multi-tenant.md) |
| Cross-cutting | [Security](security.md) · [Testing](testing.md) |
