---
name: agentify-shopping
description: Shop on any Agentify-powered store (UCP + MCP). Discover, search, verify live offers, build a cart, and complete a buyer-approved checkout via a payment link, then track the order.
version: 0.1.0
---

# Agentify — shopping skill (single store)

A portable playbook for **general-purpose agents** that shop on stores exposed
by the Agentify commerce gateway. Install/read it once; it works across every
store that advertises Agentify's UCP discovery + MCP endpoint (each store's
`agents.md`/`llms.txt` points here).

This is the agent-side counterpart to the store-side surfaces:
`/.well-known/ucp` (UCP), the MCP endpoint, and the merchant `agents.md`.

---

## 1 · Discovery (per store)

1. Fetch the store's discovery profile:
   `GET https://{store}/.well-known/ucp`
2. Read the store's `agents.md` and `llms.txt` for identity, policies and
   rules — every store can add its own constraints on top of this playbook.
3. From the UCP profile, take the **MCP** service endpoint and connect
   (`initialize` → `tools/list` → `tools/call`).

The UCP `capabilities` tell you what the merchant supports:
`dev.ucp.shopping.catalog.search/lookup`, `.cart`, `.checkout`, `.order`.
Only use tools the merchant advertises.

## 2 · Negotiation — present your agent profile

Transactional tools (cart/checkout/order) **require**:

```json
{ "meta": { "ucp-agent": { "profile": "https://your-agent.example/.well-known/ucp" } } }
```

Provide your own UCP profile URI on every cart/checkout/order call. Read-only
catalog calls work without it.

## 3 · The shopping flow

### a. Search

`search_catalog` with free text + structured filters:

```json
{
  "query": "gold necklace",
  "occasion": "anniversary",
  "inStockOnly": true,
  "maxPriceMinor": 500000,
  "currency": "INR"
}
```

### b. Inspect

`get_product { productId }` (all variants) and/or `get_variant { variantId }`.

### c. LIVE verification (never skip)

Search may be indexed/approximate. Before recommending or transacting:

1. `check_availability { variantId }` → in_stock / limited / out_of_stock / unknown
2. `get_offer { variantId }` → the **live discounted price**, list price,
   savings and stock.

Recommend only with a live, in-stock offer at or under the buyer's budget.

### d. Cart

```text
create_cart { meta }                 → cartId
add_to_cart { meta, cartId, variantId, quantity }
get_cart { meta, cartId }            → lines + subtotal
```

`add_to_cart` is live-priced and stock-checked at add time.

### e. Checkout

```text
create_checkout { meta, cartId }     → checkoutId
get_checkout { meta, checkoutId }
```

### f. Complete (BUYER APPROVAL REQUIRED)

```text
complete_checkout {
  meta,
  checkoutId,
  approval: { buyerApproved: true }   // only with explicit human consent
}
```

- If a payment provider is wired, this returns a **payment intent** with a
  `paymentUrl`. Hand the URL to the buyer to approve and pay (Razorpay test
  card example: `4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234`).
- If no payment provider is wired, completion returns the order directly.

### g. Order

After payment is confirmed, fetch the result:

```text
get_order { meta, orderId }
```

(If you have a checkout id and no order id yet, `get_checkout` shows status and
`orderId` once completed.)

---

## 4 · Money rules

- Amounts are integers in **minor currency units** with an explicit ISO
  currency: `{ "amount": 399900, "currency": "INR" }` = ₹3,999.
- Quote prices from `get_offer` only — never from indexed or list data.
- State currency and note discounts/savings when you present a price.

## 5 · Buyer-approval invariant

- Never call `complete_checkout` without explicit, contemporaneous human
  approval (`approval.buyerApproved: true`).
- Never ask for or collect card details yourself — payment happens on the
  merchant-provided payment link (or the merchant's checkout UI).

## 6 · Failure handling

- **Not found / bad ids**: never retry with fabricated ids; if `get_product`
  or `get_variant` returns `NOT_FOUND`, tell the buyer.
- **Stock disappears**: if `complete_checkout` (or the payment step) fails
  because stock ran out, re-run `check_availability` + `get_offer`, do NOT
  attempt payment, and offer in-stock alternatives.
- **Price changed**: re-verify with `get_offer` and re-confirm the new price
  with the buyer before proceeding.
- **Rate limits**: on `RATE_LIMITED` (HTTP 429 / tool error) back off and
  retry a bounded number of times.
- **Backend errors / timeouts**: wait and retry a bounded number of times,
  then report the failure rather than guessing.

## 7 · Behavioral rules

- Respect the buyer's stated budget — never propose an item whose live
  effective price exceeds it.
- Prefer in-stock items when the buyer needs something soon.
- Explain price, discounts, stock and any payment handoff transparently.
- If live verification fails, say so — do not improvise availability/prices.

## Versioning

This playbook may evolve; stores may require a minimum version. When a store's
metadata contradicts this document, the **store's** `agents.md` wins for that
store; general rules in this skill apply everywhere.
