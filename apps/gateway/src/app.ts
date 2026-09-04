import { Hono, type Context } from "hono";
import { createMockCommerceProvider } from "@gateway/adapter-mock";
import {
  detectCapabilities,
  type CommerceProvider,
  isProviderError,
} from "@gateway/canonical-commerce";
import { createMetadata, type GeneratedMetadata } from "@gateway/metadata";
import {
  createStreamableHttpEndpoint,
  SERVER_NAME,
  SERVER_VERSION,
  type StreamableHttpEndpoint,
} from "@gateway/mcp";
import {
  assertValidUcpProfile,
  buildUcpProfile,
  type BusinessDiscoveryProfile,
} from "@gateway/ucp";
import { loadConfig, type GatewayConfig } from "./config.js";

export interface Gateway {
  app: Hono;
  config: GatewayConfig;
  provider: CommerceProvider;
  metadata: GeneratedMetadata;
  mcp: StreamableHttpEndpoint;
  /** The UCP business discovery profile served at /.well-known/ucp. */
  ucpProfile: BusinessDiscoveryProfile;
}

export interface CreateGatewayOptions {
  config?: GatewayConfig;
  provider?: CommerceProvider;
}

/**
 * Compose the gateway: one provider drives MCP + metadata. The MCP endpoint
 * and UCP/metadata generation are pure outputs of the provider's capability
 * graph — no merchant-specific logic lives here.
 */
export async function createGateway(options: CreateGatewayOptions = {}): Promise<Gateway> {
  const config = options.config ?? loadConfig();
  const provider: CommerceProvider =
    options.provider ?? createMockCommerceProvider({ storeUrl: config.storeUrl });
  const metadata = await createMetadata(provider, { baseUrl: config.baseUrl });
  const mcp = createStreamableHttpEndpoint(provider);
  const capabilities = detectCapabilities(provider);

  // UCP business discovery profile. Built and validated at startup so a
  // malformed/inconsistent configuration fails fast instead of serving an
  // invalid discovery document.
  const ucpProfile = buildUcpProfile({ capabilities, baseUrl: config.baseUrl });
  assertValidUcpProfile(ucpProfile);

  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      service: SERVER_NAME,
      version: SERVER_VERSION,
      description: "Agentic Commerce Gateway (MVP 0 + MVP 1 + MVP 2)",
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

  return { app, config, provider, metadata, mcp, ucpProfile };
}

function providerErrorResponse(c: Context, err: unknown): Response {
  if (isProviderError(err)) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "INVALID_ARGUMENT"
          ? 400
          : err.code === "RATE_LIMITED"
            ? 429
            : err.code === "UNSUPPORTED_CAPABILITY"
              ? 501
              : 502;
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, status);
  }
  return c.json({ error: { code: "INTERNAL", message: err instanceof Error ? err.message : "internal error" } }, 500);
}
