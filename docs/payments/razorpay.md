# Payments (Razorpay test mode)

Payment is **gateway infrastructure, not a merchant capability** — a merchant
owns checkout; the gateway orchestrates a `PaymentGateway` and finalizes the
merchant order on confirmed payment.

## Flow

```
agent  complete_checkout(approval=true)
   └─► PaymentOrchestrator.startPayment
        ├─ create Razorpay Order (Orders API)
        ├─ create Payment Link          ──► buyer approves & pays (short_url)
        └─ audit: payment.order.created, payment_link.created
Razorpay webhook  POST /webhooks/razorpay  (payment_link.paid)
   └─► verify HMAC-SHA256 signature (x-razorpay-signature)
        ├─ parse event -> referenceId (checkout), amount, currency
        ├─ match pending intent; amount + currency must equal
        ├─ audit: payment.received
        └─ provider.checkout.complete(id, { approval: true })
             └─ order created + audit: checkout.completed
agent  get_order ──► confirmed order + total
```

## Safety

- **Signatures** are validated with the webhook secret (HMAC-SHA256); forged
  callbacks → `INVALID_SIGNATURE` (HTTP 400).
- **Amount/currency** must match the intent → `AMOUNT_MISMATCH` otherwise.
- **Idempotency**: each payment id reconciles once; duplicate callbacks return
  the existing order.
- **Approval gate**: nothing completes without `approval.buyerApproved`.
- **Audit**: every money-changing step records an event with merchant, checkout,
  order, payment, agent, amount/currency and approval state.

## Offline development

`FakeRazorpayGateway` implements the same `PaymentGateway` interface with a
real signing key, so orchestration, webhooks and signatures are fully testable
offline (`pnpm demo:razorpay`).

## Real keys

Real gateway: `@agentify/payments-razorpay` wraps the official SDK
(`orders.create`, `paymentLink.create`, `validateWebhookSignature`). Test keys
(`rzp_test_*`) are enforced; live mode requires an explicit opt-in and is out of
scope for this MVP.
