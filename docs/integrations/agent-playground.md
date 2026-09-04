# Agent playground (dashboard)

A per-merchant page where store owners configure the AI agent that will serve
their store, and get the connection kit to let that agent access the store's
MCP + tools.

Open it from the sidebar → **Sell to agents → Agent playground**, pick a
merchant, configure, then Save and use the **Connection kit** tab.

## What you configure

- **Agent identity** — agent name, greeting, persona and system instructions.
- **Checkout mode**
  - *Embedded (Razorpay Checkout)*: the gateway creates a Razorpay Order and a
    storefront snippet renders Razorpay Checkout.js; on success the snippet
    posts `orderId` + `paymentId` + `signature` to `POST /payments/verify`,
    which verifies and completes the order.
  - *Payment link*: the classic redirect handoff.
  - Approval is always required before completion.
- **Upsell & cross-sell** — enable a `get_recommendations` tool with
  max suggestions and a hard budget guard (a demo preview runs against the mock
  catalogue). Suggestions never re-offer items already in the cart and never
  exceed the budget.

## What the agent gets

The **connection kit** exposes:

- the store's `MCP` / `UCP` / `agents.md` / `llms.txt` endpoints,
- the exact tool manifest the merchant supports,
- personalized **instructions**,
- an `mcpServers.json` block to paste into Claude/OpenAI-style configs,
- an **embedded checkout snippet** (reference) for the in-app mode.

## Backend notes

- Agent configs are stored per merchant under `data/agents/<merchantId>.json`
  (git-ignored); endpoints: `GET/PUT /api/merchants/:id/agent`,
  `/agent/tools`, `/agent/kit`, and the demo `POST /api/merchants/upsell/preview`.
- Recommendations are a gateway capability (`provider.recommendations.get`) and
  MCP tool — any adapter can implement them; the mock provides the reference
  rules engine.
