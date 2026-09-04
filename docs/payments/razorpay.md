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

## Real keys & test mode

`@agentify/payments-razorpay` wraps the official SDK
(`orders.create`, `paymentLink.create`, `orders.fetch`, `validateWebhookSignature`).
Test keys (`rzp_test_*`) are enforced; live mode requires an explicit opt-in and
is out of scope for this MVP.

### Enable real test mode

Get **test** API keys from the Razorpay dashboard: Settings → API Keys (test
mode shows `rzp_test_...`). Set env and run:

```bash
RAZORPAY_KEY_ID=rzp_test_... \
RAZORPAY_KEY_SECRET=... \
pnpm demo:razorpay:real
```

| Env var | Purpose |
|---------|---------|
| `RAZORPAY_KEY_ID` | `rzp_test_...` key id |
| `RAZORPAY_KEY_SECRET` | matching key secret |
| `RAZORPAY_WEBHOOK_SECRET` | webhook secret (webhook reconciliation) |
| `RAZORPAY_MODE` | `test` (default) or `live` |

The server (`pnpm gateway`) and CLI (`agentify serve --payment razorpay`)
enable payments automatically when `RAZORPAY_KEY_ID/SECRET` are set.

### Paying with test cards

Open the printed payment link (`short_url`) in a browser and use a test card:

- Success: `4111 1111 1111 1111` · any future expiry · any CVV · OTP `1234`
- Decline: `4000 0000 0000 0002`
- UPI: `success@razorpay` / `failure@razorpay`

### Two reconciliation paths

1. **Polling** (no infra, local-friendly): `reconcileByPolling(checkoutId)`
   polls `paymentLink.fetch(linkId)` until `status === "paid"` and
   `amount_paid` matches, then finalizes. The buyer pays the hosted payment
   link, so the link — not any independently created order — is the status
   source. Used by `pnpm demo:razorpay:real`.
2. **Webhook** (production): Razorpay POSTs to
   `/webhooks/razorpay` (`payment_link.paid`). Configure the event in the
   dashboard and expose the URL publicly (or a tunnel such as ngrok /
   cloudflared). Signatures are verified with `RAZORPAY_WEBHOOK_SECRET`.

Both paths are idempotent and share the same audit events; a checkout can never
be completed twice.
