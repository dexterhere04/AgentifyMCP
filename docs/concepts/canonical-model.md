# Canonical commerce model

All downstream logic operates on normalized entities from
`@agentify/canonical-commerce`:

```
Merchant · Product · Variant · Price(Money) · Discount · Offer
Availability · Cart · CartItem · Checkout · PaymentIntent · Order
```

## Money

- `Money = { amount, currency }` with `amount` in **minor units**
  (e.g. `399900` INR paise = ₹3,999) and an explicit ISO currency.
- Adapters convert major-unit or string sources via configured `unit`
  (`major` | `minor`) — see the REST adapter mapping grammar.

## Availability

Four states, never ambiguous:

```
in_stock · limited · out_of_stock · unknown
```

A merchant's `12`, `true`, `"in_stock"` or `{ available: true, quantity: 12 }`
all normalize consistently.

## Product / Variant / Pricing

- Product and variant IDs must stay stable.
- Pricing distinguishes `listPrice` (MRP) from `salePrice`.
- Variants carry attributes (size, material, colour, …), pricing and per-variant
  availability.

## Discounts

Distinguished by:

- type: `percentage` | `fixed` | `coupon` | `automatic`
- scope: `variant` | `product` | `cart` | `order`
- validity windows

Coupons are never auto-applied at offer time; they surface at cart time.

## Offer (the live price)

An **Offer** is the merchant-verified price for a variant *right now*:
effective `price`, `listPrice`, applied discounts, savings and live
availability.

> Search may be indexed; **availability and final price are always verified
> live** (via `get_offer`) before a transactional recommendation.

`extensions` preserve source-specific metadata that has no canonical home.
