# The shopping skill (agent side)

Agentify is **two-sided**:

- **Store side** (built): each merchant exposes `/.well-known/ucp`, an MCP
  server, `agents.md` and `llms.txt` — all derived from one capability graph.
- **Agent side** (this): a reusable, portable playbook any general-purpose
  agent can read/install once and use to browse and shop on **every**
  Agentify-powered store.

This mirrors how Shopify works: every Shopify store's `agents.md` points agents
at the shared `shop.app/SKILL.md`, so a single install lets an agent transact
across all Shopify stores.

## The playbook

- Canonical file: [`docs/SKILL.md`](../SKILL.md)
- Published URL (GitHub Pages, when enabled): `https://dexterhere04.github.io/AgentifyMCP/SKILL.md`

It covers:

1. **Discovery** — `/.well-known/ucp` → MCP endpoint; respect `capabilities`.
2. **Negotiation** — present `meta.ucp-agent.profile` on transactional calls.
3. **Flow** — search → inspect → **live** availability/offer verification →
   cart → checkout → buyer-approved `complete_checkout` → payment-link handoff
   → `get_order`.
4. **Money rules** — minor units + explicit currency; quote only from `get_offer`.
5. **Approval invariant** — never complete/pay without human consent.
6. **Failure handling** — vanished stock, price changes, rate limits, backend
   errors: re-verify live, don't fabricate ids, offer alternatives.
7. **Behavior** — respect budget, prefer in-stock, be transparent.

## How merchants advertise it

`@agentify/metadata` automatically adds a **Recommended skill** section to every
generated `agents.md` and a Shopping skill link to `llms.txt`, pointing agents
at the canonical URL. Toggle with `recommendSkill: false` or override with
`skillUrl` when a store prefers a different playbook.

## Scope

Single-store agent flows today. Cross-store/marketplace search (a
Shop-app-style product) is a separate product for when there is a network of
Agentify merchants — deliberately out of scope for now.
