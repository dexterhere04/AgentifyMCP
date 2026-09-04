import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import {
  buildSecondStoreConfig,
  createFixtureStoreServer,
  FIXTURE_TOKEN,
  RestCommerceProvider,
  validateRestConfig,
  type RestAdapterConfig,
} from "@agentify/adapter-rest";
import { createMockCommerceProvider } from "@agentify/adapter-mock";
import { SqliteAuditStore } from "@agentify/audit";
import { detectCapabilities, enabledCapabilities, isProviderError } from "@agentify/canonical-commerce";
import { AgentConfigStore, defaultAgentConfig, MerchantStore, type AgentConfig } from "./store.js";
import { GatewayManager } from "./gateway-manager.js";
import { DemoStoreManager } from "./demo-store-manager.js";
import { buildLandscape } from "./landscape.js";
import {
  AgentPresetStore,
  LlmSettingsStore,
  runAgentChat,
  slugify,
  type AgentPreset,
  type ChatMessage,
  type LlmProviderKind,
} from "./agent-runtime.js";

export interface DashboardOptions {
  repoRoot: string;
  dataDir: string;
  auditDbPath?: string;
  agentsDir?: string;
  playgroundDir?: string;
}

const SCHEMA_REL = join("packages", "adapter-rest", "schemas", "merchant-config.schema.json");
const DEMO_CONFIG_REL = join("testing", "basic-store", "merchant.config.json");
const DEMO_ID = "common-goods-rest";

function blankConfig(id: string, name: string): RestAdapterConfig {
  return {
    id,
    merchant: { name, defaultCurrency: "INR" },
    http: { baseUrl: "https://api.your-store.example", timeoutMs: 3000 },
    catalog: {
      search: {
        path: "/products",
        query: { q: "{query}", page: "{page}", limit: "{limit}" },
        itemsPath: "$.data",
        totalPath: "$.total",
        pageSize: 20,
      },
      productUrl: "/products/{productId}",
      variantUrl: "/variants/{variantId}",
      offerUrl: "/offers?variant_id={variantId}",
    },
    mappings: {
      product: {
        id: "$.id",
        title: "$.name",
        description: "$.description",
        category: "$.category",
        variants: {
          path: "$.variants",
          each: {
            id: "$.id",
            productId: "$.product_id",
            sku: "$.sku",
            listPrice: { path: "$.price", unit: "major" },
            salePrice: { path: "$.sale_price", unit: "major" },
            availability: { path: "$.stock" },
          },
        },
      },
      offer: {
        id: "$.variant_id",
        productId: "$.product_id",
        listPrice: { path: "$.pricing.mrp", unit: "major" },
        salePrice: { path: "$.pricing.selling_price", unit: "major" },
        availability: { path: "$.inventory" },
      },
    },
  };
}

async function runSmoke(config: RestAdapterConfig, useFixture: boolean) {
  let effective = config;
  let fixture: Awaited<ReturnType<typeof createFixtureStoreServer>> | undefined;
  if (useFixture) {
    fixture = await createFixtureStoreServer();
    effective = buildSecondStoreConfig({ baseUrl: fixture.baseUrl, token: FIXTURE_TOKEN });
  }
  try {
    const provider = new RestCommerceProvider(effective);
    const caps = detectCapabilities(provider);
    const search = await provider.catalog.search({ limit: 3 });
    const first = search.items[0];
    const product = first ? await provider.catalog.getProduct(first.id) : undefined;
    let offer;
    if (provider.pricing && product?.variants[0]) {
      offer = await provider.pricing.getOffer({ variantId: product.variants[0].id });
    }
    return {
      ok: true,
      capabilities: caps,
      search: { total: search.total, items: search.items },
      product: product ? { id: product.id, title: product.title, variants: product.variants.length } : undefined,
      offer: offer ? { price: offer.price, availability: offer.availability, productTitle: offer.productTitle } : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: isProviderError(err)
        ? { code: err.code, message: err.message }
        : { code: "INTERNAL", message: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    if (fixture) await fixture.close();
  }
}

const CAP_TOOLS: Record<string, string[]> = {
  catalog: ["search_catalog", "get_product", "get_variant"],
  inventory: ["check_availability"],
  pricing: ["get_offer"],
  cart: ["create_cart", "get_cart", "add_to_cart", "update_cart_item", "remove_from_cart"],
  checkout: ["create_checkout", "get_checkout", "complete_checkout", "cancel_checkout"],
  orders: ["get_order"],
  recommendations: ["get_recommendations"],
};

function toolsForCaps(caps: import("@agentify/canonical-commerce").Capabilities): string[] {
  return enabledCapabilities(caps).flatMap((k) => CAP_TOOLS[k] ?? []).concat("get_audit_trail");
}

function buildAgentKit(config: RestAdapterConfig, agent: AgentConfig, base: string) {
  const b = base.replace(/\/+$/, "");
  const caps = detectCapabilities(new RestCommerceProvider(config));
  const tools = toolsForCaps(caps);
  const mcpUrl = `${b}/mcp`;
  const ucpUrl = `${b}/.well-known/ucp`;
  const agentsMdUrl = `${b}/agents.md`;
  const llmsTxtUrl = `${b}/llms.txt`;
  const instructions = [
    `# ${agent.agentName} — instructions for ${config.merchant.name}`,
    agent.greeting ? `Greeting: ${agent.greeting}` : null,
    `Persona: ${agent.persona}`,
    agent.instructions,
    `Checkout: ${agent.checkout.mode === "in_app" ? "in-app (embedded Razorpay Checkout)" : "payment link handoff"} — completion always requires explicit buyer approval.`,
    agent.recommendations.enabled
      ? `Suggestions: recommend upsells/cross-sells for the cart (max ${agent.recommendations.maxSuggestions}, budget guard ${agent.recommendations.budgetGuard ? "on" : "off"}) — use get_recommendations.`
      : "Suggestions: do not upsell or cross-sell.",
    "Verify availability + live offer before recommending anything.",
    `MCP endpoint: ${mcpUrl}`,
  ]
    .filter((l): l is string => !!l)
    .join("\n");
  const mcpServersJson = JSON.stringify(
    { mcpServers: { [config.id]: { url: mcpUrl } } },
    null,
    2,
  );
  const checkoutSnippet = agent.checkout.mode === "in_app"
    ? [
        "// Conversational in-app checkout (Razorpay Checkout.js).",
        "// When the agent creates a checkout it returns a checkoutId; ask it to start the",
        "// embedded payment, then open the returned orderId in the Razorpay Checkout modal.",
        "const options = {",
        '  key: "YOUR_RAZORPAY_KEY_ID",   // public key id (test: rzp_test_...)',
        "  order_id: orderId,             // returned by the gateway",
        "  handler: async (res) => {",
        '    await fetch(`${BASE}/payments/verify`, { method: "POST", headers: { "content-type": "application/json" },',
        "      body: JSON.stringify({ orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature }) });",
        "    // order is now complete — the agent can read it via get_order",
        "  },",
        "};",
        "const rzp = new Razorpay(options); rzp.open();",
      ].join("\n")
    : "// Link mode: hand the buyer the paymentUrl from complete_checkout.";
  return {
    merchantId: config.id,
    agent: agent,
    baseUrl: b,
    endpoints: { mcp: mcpUrl, ucp: ucpUrl, agentsMd: agentsMdUrl, llmsTxt: llmsTxtUrl },
    tools,
    instructions,
    mcpServersJson,
    checkoutSnippet,
  };
}

function flattenLeaves(value: unknown, prefix = ""): Array<{ path: string; sample: string }> {
  const out: Array<{ path: string; sample: string }> = [];
  if (value === null || value === undefined) return out;  if (Array.isArray(value)) {
    if (value.length) flattenLeaves(value[0], prefix);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenLeaves(v, `${prefix}.${k}`);
    }
    return out;
  }
  out.push({ path: prefix || "$", sample: String(value) });
  return out;
}

export function createDashboardApp(opts: DashboardOptions): Hono {
  const store = new MerchantStore(opts.dataDir);
  const agents = new AgentConfigStore(opts.agentsDir ?? join(opts.dataDir, "..", "agents"));
  const playgroundDir = opts.playgroundDir ?? join(opts.dataDir, "..", "playground");
  const llm = new LlmSettingsStore(playgroundDir);
  const presets = new AgentPresetStore(join(playgroundDir, "presets"));
  const manager = new GatewayManager(opts.repoRoot);
  const demoStore = new DemoStoreManager(opts.repoRoot);
  const schema = readFileSync(join(opts.repoRoot, SCHEMA_REL), "utf8");
  const auditPath = opts.auditDbPath ?? join(opts.dataDir, "audit.db");
  const audit = new SqliteAuditStore(auditPath);

  const app = new Hono();

  // CORS: the dashboard UI may be hosted on a different origin (e.g. Vercel CDN).
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    const allow = origin ?? "*";
    c.header("Access-Control-Allow-Origin", allow);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    c.header("Access-Control-Allow-Headers", "content-type, authorization, x-requested-with");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  // merchants
  app.get("/api/merchants", (c) => c.json(store.list()));
  app.get("/api/merchants/:id", (c) => {
    try {
      return c.json(store.get(c.req.param("id")));
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });
  app.put("/api/merchants/:id", async (c) => {
    const config = (await c.req.json()) as RestAdapterConfig;
    const errors = validateRestConfig(config);
    if (errors.length) return c.json({ ok: false, errors }, 400);
    const summary = store.save(c.req.param("id"), config);
    return c.json({ ok: true, merchant: summary });
  });
  app.delete("/api/merchants/:id", (c) => {
    try {
      store.remove(c.req.param("id"));
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });

  // ---- agent playground ----------------------------------------------------
  app.get("/api/merchants/:id/agent", (c) => {
    try {
      return c.json(agents.get(c.req.param("id")));
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });
  app.put("/api/merchants/:id/agent", async (c) => {
    const raw = (await c.req.json()) as Partial<AgentConfig>;
    const config = { ...defaultAgentConfig(), ...raw };
    if (!config.agentName) return c.json({ error: "agentName is required" }, 400);
    agents.save(c.req.param("id"), config);
    return c.json({ ok: true, config });
  });
  app.get("/api/merchants/:id/agent/tools", async (c) => {
    try {
      const config = store.get(c.req.param("id"));
      const provider = new RestCommerceProvider(config);
      const caps = detectCapabilities(provider);
      return c.json({ capabilities: enabledCapabilities(caps), tools: toolsForCaps(caps) });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "not_found" }, 404);
    }
  });
  app.get("/api/merchants/:id/agent/kit", (c) => {
    try {
      const config = store.get(c.req.param("id"));
      let agent: AgentConfig;
      try {
        agent = agents.get(c.req.param("id"));
      } catch {
        agent = defaultAgentConfig();
      }
      const base = (manager.getStatus().running && manager.getStatus().baseUrl) || config.http.baseUrl;
      return c.json(buildAgentKit(config, agent, base));
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });
  // ---- LLM provider (used to test agents in the playground) --------------
  app.get("/api/llm/provider", (c) => c.json(llm.publicView()));
  app.put("/api/llm/provider", async (c) => {
    const raw = (await c.req.json()) as Partial<{
      kind: LlmProviderKind;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
    }>;
    if (!raw.kind) return c.json({ error: "kind is required" }, 400);
    const prev = llm.get();
    let apiKey = prev.apiKey;
    if (typeof raw.apiKey === "string") apiKey = raw.apiKey.trim() ? raw.apiKey.trim() : undefined;
    llm.save({
      kind: raw.kind,
      ...(raw.model?.trim() ? { model: raw.model.trim() } : {}),
      ...(raw.baseUrl?.trim() ? { baseUrl: raw.baseUrl.trim() } : {}),
      ...(apiKey ? { apiKey } : {}),
    });
    return c.json({ ok: true, provider: llm.publicView() });
  });

  // ---- named agent presets + public chat endpoint ------------------------
  const originOf = (c: import("hono").Context) => new URL(c.req.url).origin;

  app.get("/api/agents/presets", (c) => c.json(presets.list()));
  app.put("/api/agents/presets/:slug", async (c) => {
    const slug = c.req.param("slug");
    const raw = (await c.req.json()) as { name?: string; merchantId?: string; config?: Partial<AgentConfig> };
    if (!raw.name?.trim()) return c.json({ error: "name is required" }, 400);
    if (!raw.merchantId) return c.json({ error: "merchantId is required" }, 400);
    let merchantConfig: RestAdapterConfig;
    try {
      merchantConfig = store.get(raw.merchantId);
    } catch {
      return c.json({ error: "merchant not found" }, 404);
    }
    const config = { ...defaultAgentConfig(), ...(raw.config ?? {}) };
    if (!config.agentName?.trim()) config.agentName = merchantConfig.merchant.name;
    const now = new Date().toISOString();
    const existing = presets.list().find((p) => p.slug === slug);
    const preset: AgentPreset = {
      slug,
      name: raw.name.trim(),
      merchantId: raw.merchantId,
      config,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    presets.save(preset);
    return c.json({ ok: true, preset, endpoint: `${originOf(c)}/api/agents/${slug}/chat` });
  });
  app.delete("/api/agents/presets/:slug", (c) => {
    try {
      presets.remove(c.req.param("slug"));
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });

  app.post("/api/agents/chat", async (c) => {
    const body = (await c.req.json()) as { merchantId?: string; config?: Partial<AgentConfig>; messages?: ChatMessage[] };
    if (!body.merchantId || !Array.isArray(body.messages)) {
      return c.json({ error: "merchantId and messages are required" }, 400);
    }
    let merchantConfig: RestAdapterConfig;
    try {
      merchantConfig = store.get(body.merchantId);
    } catch {
      return c.json({ error: "merchant not found" }, 404);
    }
    const agent = { ...defaultAgentConfig(), ...(body.config ?? {}) };
    const result = await runAgentChat({
      merchant: merchantConfig,
      agent,
      settings: llm.get(),
      messages: body.messages,
    });
    return c.json(result);
  });

  app.post("/api/agents/:slug/chat", async (c) => {
    const slug = c.req.param("slug");
    const body = (await c.req.json()) as { messages?: ChatMessage[] };
    if (!Array.isArray(body.messages)) return c.json({ error: "messages are required" }, 400);
    let preset: AgentPreset;
    try {
      preset = presets.get(slug);
    } catch {
      return c.json({ error: "agent preset not found" }, 404);
    }
    let merchantConfig: RestAdapterConfig;
    try {
      merchantConfig = store.get(preset.merchantId);
    } catch {
      return c.json({ error: "preset merchant no longer exists" }, 404);
    }
    const result = await runAgentChat({
      merchant: merchantConfig,
      agent: preset.config,
      settings: llm.get(),
      messages: body.messages,
    });
    return c.json(result);
  });

  app.post("/api/merchants/upsell/preview", async (c) => {
    const body = (await c.req.json()) as { budgetMinor?: number };
    const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    const cart = await provider.cart!.create();
    await provider.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
    const items = await provider.recommendations!.get({
      cartId: cart.id,
      ...(body?.budgetMinor ? { budgetMinor: body.budgetMinor } : {}),
    });
    provider.close();
    return c.json({ items });
  });

  app.get("/api/merchants/:id/landscape", async (c) => {
    const id = c.req.param("id");
    let config: RestAdapterConfig;
    try {
      config = store.get(id);
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
    const status = manager.getStatus();
    const live = status.running === true && status.kind === "rest" && status.merchantId === id;
    const baseUrl = (live && status.baseUrl) || status.baseUrl || "http://localhost:8787";
    try {
      const landscape = await buildLandscape(config, baseUrl);
      return c.json({ ...landscape, live, running: status.running });
    } catch (err) {
      return c.json(
        { error: "cannot build agent landscape for this config", reason: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
  });

  app.post("/api/merchants/validate", async (c) => {
    const config = (await c.req.json()) as RestAdapterConfig;
    return c.json({ ok: validateRestConfig(config).length === 0, errors: validateRestConfig(config) });
  });

  app.get("/api/schema", (c) => c.json(JSON.parse(schema)));
  app.get("/api/templates/blank", (c) => c.json(blankConfig("my-store", "My Store")));

  app.post("/api/merchants/test", async (c) => {
    const body = (await c.req.json()) as { config: RestAdapterConfig; fixture?: boolean };
    return c.json(await runSmoke(body.config, body.fixture ?? false));
  });

  app.post("/api/merchants/sample", async (c) => {
    const body = (await c.req.json()) as { url: string; bearer?: string };
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (body.bearer) headers.authorization = `Bearer ${body.bearer}`;
      const res = await fetch(body.url, { headers });
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return c.json({
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get("content-type"),
        body: parsed !== undefined ? parsed : text.slice(0, 2000),
        leaves: parsed !== undefined ? flattenLeaves(parsed).slice(0, 200) : [],
      });
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  // gateway child
  app.get("/api/gateway/status", (c) => c.json(manager.getStatus()));
  app.get("/api/gateway/logs", (c) => c.json(manager.logs));
  app.post("/api/gateway/start", async (c) => {
    const body = (await c.req.json()) as {
      kind: "mock" | "rest";
      merchantId?: string;
      configPath?: string;
      port?: number;
      baseUrl?: string;
      razorpay?: { keyId?: string; keySecret?: string; webhookSecret?: string };
    };
    try {
      const configPath =
        body.kind === "rest" ? (body.configPath ?? (body.merchantId ? store.filePath(body.merchantId) : undefined)) : undefined;
      if (body.kind === "rest" && !configPath) {
        return c.json({ error: "rest start requires a merchantId or configPath" }, 400);
      }
      return c.json(manager.start({ kind: body.kind, configPath, port: body.port, baseUrl: body.baseUrl, razorpay: body.razorpay, auditPath }));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });
  app.post("/api/gateway/stop", (c) => c.json(manager.stop()));
  app.get("/api/gateway/readiness", async (c) => {
    const st = manager.getStatus();
    if (!st.running || !st.baseUrl) return c.json({ running: false });
    try {
      const ucp = (await (await fetch(`${st.baseUrl}/.well-known/ucp`)).json()) as {
        ucp: { capabilities: Record<string, unknown>; payment_handlers: Record<string, unknown> };
      };
      const caps = Object.keys(ucp.ucp.capabilities);
      const hasPayment = Object.keys(ucp.ucp.payment_handlers).length > 0;
      const labels: Record<string, string> = {
        "dev.ucp.shopping.catalog.search": "Catalog (search)",
        "dev.ucp.shopping.catalog.lookup": "Catalog (lookup)",
        "dev.ucp.shopping.cart": "Cart",
        "dev.ucp.shopping.checkout": "Checkout",
        "dev.ucp.shopping.order": "Orders",
      };
      return c.json({
        running: true,
        capabilities: Object.keys(labels).map((k) => ({ id: k, label: labels[k], on: caps.includes(k) })),
        payment: hasPayment,
      });
    } catch {
      return c.json({ running: false, error: "could not reach gateway" });
    }
  });

  // demo REST store (testing/basic-store backend)
  app.get("/api/demo-rest/status", (c) => {
    let installed = false;
    try {
      store.get(DEMO_ID);
      installed = true;
    } catch {
      /* not installed yet */
    }
    return c.json({ id: DEMO_ID, installed, store: demoStore.getStatus(), gateway: manager.getStatus() });
  });

  app.post("/api/demo-rest/boot", async (c) => {
    let config: RestAdapterConfig;
    try {
      config = store.get(DEMO_ID);
    } catch {
      config = JSON.parse(readFileSync(join(opts.repoRoot, DEMO_CONFIG_REL), "utf8")) as RestAdapterConfig;
      store.save(config.id, config);
    }
    const current = manager.getStatus();
    if (current.running) {
      return c.json({ error: `a gateway is already running (${current.kind}); stop it first` }, 409);
    }
    try {
      demoStore.start();
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
    try {
      const gateway = manager.start({
        kind: "rest",
        merchantId: DEMO_ID,
        configPath: store.filePath(DEMO_ID),
      });
      return c.json({
        ok: true,
        merchant: {
          id: DEMO_ID,
          name: config.merchant.name,
          currency: config.merchant.defaultCurrency,
          baseUrl: config.http.baseUrl,
        },
        store: demoStore.getStatus(),
        gateway,
      });
    } catch (err) {
      demoStore.stop();
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 409);
    }
  });

  app.post("/api/demo-rest/stop", (c) => {
    const gateway = manager.stop();
    const storeStatus = demoStore.stop();
    return c.json({ ok: true, gateway, store: storeStatus });
  });

  // audit viewer (shared SQLite file)
  app.get("/api/audit", (c) => {
    const checkoutId = c.req.query("checkoutId");
    const type = c.req.query("type");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 200;
    return c.json(
      audit.list({ ...(checkoutId ? { checkoutId } : {}), ...(type ? { type } : {}), limit }).slice().reverse(),
    );
  });

  return app;
}
