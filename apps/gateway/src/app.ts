import { Hono, type Context } from "hono";
import { createMockCommerceProvider } from "@agentify/adapter-mock";
import {
  createAuditedCommerce,
  InMemoryAuditStore,
  SqliteAuditStore,
  type AuditStore,
} from "@agentify/audit";
import {
  detectCapabilities,
  type CommerceProvider,
  type PaymentGateway,
  isProviderError,
} from "@agentify/canonical-commerce";
import { createMetadata, type GeneratedMetadata } from "@agentify/metadata";
import {
  createStreamableHttpEndpoint,
  SERVER_NAME,
  SERVER_VERSION,
  type StreamableHttpEndpoint,
} from "@agentify/mcp";
import { PaymentOrchestrator } from "@agentify/payments";
import {
  assertValidUcpProfile,
  buildUcpProfile,
  UCP_VERSION,
  type BusinessDiscoveryProfile,
} from "@agentify/ucp";
import { loadConfig, type GatewayConfig } from "./config.js";

export interface Gateway {
  app: Hono;
  config: GatewayConfig;
  provider: CommerceProvider;
  metadata: GeneratedMetadata;
  mcp: StreamableHttpEndpoint;
  /** The UCP business discovery profile served at /.well-known/ucp. */
  ucpProfile: BusinessDiscoveryProfile;
  /** Audit trail of money-changing actions. */
  audit: AuditStore;
  /** Present when a payment gateway is wired. */
  payments?: PaymentOrchestrator;
  /** Id of the wired payment gateway (e.g. "razorpay"). */
  paymentGatewayId?: string;
}

export interface CreateGatewayOptions {
  config?: GatewayConfig;
  provider?: CommerceProvider;
  /** Wire a payment provider; activates async, webhook-confirmed checkout. */
  payment?: { gateway: PaymentGateway; handlerName?: string };
}

/**
 * Compose the gateway: one provider drives MCP + metadata; an optional payment
 * gateway makes checkout async (payment link + webhook confirmation). The MCP
 * endpoint and UCP/metadata generation remain pure outputs of the provider's
 * capability graph — no merchant-specific logic lives here.
 */
export async function createGateway(options: CreateGatewayOptions = {}): Promise<Gateway> {
  const config = options.config ?? loadConfig();
  const rawProvider: CommerceProvider =
    options.provider ?? createMockCommerceProvider({ storeUrl: config.storeUrl });

  // Explainable/bounded/gated audit trail. Persist to SQLite when
  // AGENTIFY_AUDIT_PATH is set (e.g. ./data/audit.db); in-memory otherwise.
  const auditPath = process.env.AGENTIFY_AUDIT_PATH;
  const audit: AuditStore =
    auditPath && auditPath.trim() !== "" ? new SqliteAuditStore(auditPath) : new InMemoryAuditStore();

  // Every cart/checkout money action emits an audit event with explanation,
  // bounds and approval state. When a payment gateway is wired, the
  // PaymentOrchestrator owns completion events (no duplicates).
  const provider = createAuditedCommerce(rawProvider, audit, { recordCompletion: !options.payment });

  const metadata = await createMetadata(provider, { baseUrl: config.baseUrl });
  const capabilities = detectCapabilities(provider);

  let payments: PaymentOrchestrator | undefined;
  if (options.payment) {
    const merchant = await provider.merchant();
    payments = new PaymentOrchestrator(
      provider,
      options.payment.gateway,
      audit,
      merchant.id,
    );
  }

  const completeCheckout = payments
    ? (checkoutId: string, opts: { approval: { buyerApproved: boolean }; agentProfile?: string }) =>
        payments.startPayment(checkoutId, { agent: opts.agentProfile })
    : undefined;

  const mcp = createStreamableHttpEndpoint(provider, { ...(completeCheckout ? { completeCheckout } : {}), audit });

  // UCP business discovery profile. Built and validated at startup so a
  // malformed/inconsistent configuration fails fast instead of serving an
  // invalid discovery document.
  const paymentHandlers =
    options.payment && payments
      ? {
          [options.payment.handlerName ?? "dev.agentify.razorpay.test"]: [
            {
              version: UCP_VERSION,
              id: "test",
              config: {
                mode: "test",
                provider: options.payment.gateway.id,
                webhook_url: `${config.baseUrl}/webhooks/razorpay`,
              },
            },
          ],
        }
      : undefined;
  const ucpProfile = buildUcpProfile({ capabilities, baseUrl: config.baseUrl, paymentHandlers });
  assertValidUcpProfile(ucpProfile);

  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      service: SERVER_NAME,
      version: SERVER_VERSION,
      description: "Agentic Commerce Gateway",
      endpoints: {
        mcp: `${config.baseUrl}/mcp`,
        ucp: `${config.baseUrl}/.well-known/ucp`,
        agentsMd: `${config.baseUrl}/agents.md`,
        llmsTxt: `${config.baseUrl}/llms.txt`,
      },
      capabilities: Object.entries(capabilities)
        .filter(([, on]) => on)
        .map(([name]) => name),
    }),
  );

  app.get("/healthz", (c) =>
    c.json({ status: "ok", service: SERVER_NAME, version: SERVER_VERSION, timestamp: new Date().toISOString() }),
  );

  app.all("/mcp", (c) => mcp.handle(c.req.raw));

  app.get("/.well-known/ucp", (c) =>
    c.json(ucpProfile, 200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "max-age=3600",
      "Access-Control-Allow-Origin": "*",
    }),
  );

  app.get("/agents.md", (c) =>
    c.text(metadata.agentsMarkdown(), 200, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "max-age=60",
    }),
  );

  app.get("/llms.txt", (c) =>
    c.text(metadata.llmsTxt(), 200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "max-age=60",
    }),
  );

  if (payments) {
    app.post("/webhooks/razorpay", async (c) => {
      const rawBody = await c.req.text();
      const signature = c.req.header("x-razorpay-signature") ?? null;
      try {
        const order = await payments.handleWebhook(rawBody, signature);
        return c.json({ ok: true, order });
      } catch (err) {
        return paymentWebhookError(c, err);
      }
    });

    // Embedded (Checkout.js) payment confirmation.
    app.post("/payments/verify", async (c) => {
      try {
        const body = (await c.req.json()) as { orderId: string; paymentId: string; signature: string };
        const order = await payments.verifyInAppPayment({
          orderId: body.orderId,
          paymentId: body.paymentId,
          signature: body.signature ?? "",
        });
        return c.json({ ok: true, order });
      } catch (err) {
        return paymentWebhookError(c, err);
      }
    });
  }

  // Audit trail (explainable, bounded, gated) — read-only.
  app.get("/audit", (c) => {
    const checkoutId = c.req.query("checkoutId");
    const orderId = c.req.query("orderId");
    const type = c.req.query("type");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    return c.json(audit.list({
      ...(checkoutId ? { checkoutId } : {}),
      ...(orderId ? { orderId } : {}),
      ...(type ? { type } : {}),
      ...(limit ? { limit } : {}),
    }));
  });

  app.get("/audit/:checkoutId", (c) => c.json(audit.byCheckout(c.req.param("checkoutId"))));

  // Read-only developer/search endpoints (useful for agents and curl demos).
  app.get("/catalog/search", async (c) => {
    try {
      const result = await provider.catalog.search({
        query: c.req.query("q") || undefined,
        category: c.req.query("category") || undefined,
        limit: Number(c.req.query("limit") ?? 10),
        page: Number(c.req.query("page") ?? 1),
      });
      return c.json(result);
    } catch (err) {
      return providerErrorResponse(c, err);
    }
  });

  app.get("/catalog/products/:id", async (c) => {
    try {
      return c.json(await provider.catalog.getProduct(c.req.param("id")));
    } catch (err) {
      return providerErrorResponse(c, err);
    }
  });

  app.get("/catalog/products/:id/offer", async (c) => {
    try {
      if (!provider.pricing) {
        return c.json({ error: { code: "UNSUPPORTED_CAPABILITY", message: "merchant does not expose pricing" } }, 501);
      }
      return c.json(await provider.pricing.getOffer({ productId: c.req.param("id") }));
    } catch (err) {
      return providerErrorResponse(c, err);
    }
  });

  app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

  app.onError((err, c) => {
    if (isProviderError(err)) return providerErrorResponse(c, err);
    c.status(500);
    return c.json({ error: { code: "INTERNAL", message: err.message } });
  });

  return {
    app,
    config,
    provider,
    metadata,
    mcp,
    ucpProfile,
    audit,
    payments,
    paymentGatewayId: options.payment?.gateway.id,
  };
}

function providerErrorResponse(c: Context, err: unknown): Response {
  if (isProviderError(err)) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "INVALID_ARGUMENT"
          ? 400
          : err.code === "PRICE_CHANGED"
            ? 409
            : err.code === "RATE_LIMITED"
              ? 429
              : err.code === "UNSUPPORTED_CAPABILITY"
                ? 501
                : 502;
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, status);
  }
  return c.json({ error: { code: "INTERNAL", message: err instanceof Error ? err.message : "internal error" } }, 500);
}

function paymentWebhookError(c: Context, err: unknown): Response {
  const code = (err as { code?: string })?.code ?? "INTERNAL";
  const status =
    code === "NOT_FOUND"
      ? 404
      : code === "INVALID_SIGNATURE" || code === "AMOUNT_MISMATCH" || code === "CURRENCY_MISMATCH"
        ? 400
        : 502;
  return c.json(
    {
      ok: false,
      error: { code, message: err instanceof Error ? err.message : String(err) },
    },
    status,
  );
}
