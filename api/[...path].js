import { PRODUCTS, productById, variantById } from "../testing/basic-store/catalog.js";
import merchantConfig from "../testing/basic-store/merchant.config.json";
import { defaultAgentConfig } from "../apps/dashboard/src/api/store.js";
import { buildLandscape } from "../apps/dashboard/src/api/landscape.js";
import { runAgentChat } from "../apps/dashboard/src/api/agent-runtime.js";
import { RestCommerceProvider, validateRestConfig } from "@agentify/adapter-rest";
import { detectCapabilities, enabledCapabilities } from "@agentify/canonical-commerce";
import { createMockCommerceProvider } from "@agentify/adapter-mock";

const DEMO_MERCHANT_ID = "common-goods-rest";
const DEMO_STORE_PATH = "/api/demo-store";

const CAP_TOOLS = {
  catalog: ["search_catalog", "get_product", "get_variant"],
  inventory: ["check_availability"],
  pricing: ["get_offer"],
  cart: ["create_cart", "get_cart", "add_to_cart", "update_cart_item", "remove_from_cart"],
  checkout: ["create_checkout", "get_checkout", "complete_checkout", "cancel_checkout"],
  orders: ["get_order"],
};

function auroraConfig() {
  return {
    id: "aurora-optics",
    merchant: {
      name: "Aurora Optics",
      description: "Precision eyewear and optical instruments, sold direct. Agent-accessible catalog with live offers and stock.",
      url: "https://aurora-optics.example",
      country: "US",
      defaultCurrency: "USD",
    },
    http: { baseUrl: "https://api.aurora-optics.example", timeoutMs: 3000 },
    catalog: {
      search: { path: "/products", query: { q: "{query}", page: "{page}", limit: "{limit}" }, itemsPath: "$.data", totalPath: "$.total", pageSize: 12 },
      productUrl: "/products/{productId}",
      variantUrl: "/variants/{variantId}",
      offerUrl: "/offers?variant_id={variantId}",
      stockUrl: "/variants/{variantId}/stock",
    },
    mappings: {
      product: {
        id: "$.id",
        title: "$.title",
        description: "$.description",
        category: "$.category",
        brand: "$.brand",
        images: "$.images",
        variants: {
          path: "$.variants",
          each: {
            id: "$.id",
            sku: "$.sku",
            title: "$.name",
            listPrice: { path: "$.price", unit: "major" },
            salePrice: { path: "$.sale_price", unit: "major" },
            availability: { path: "$.stock" },
          },
        },
      },
      offer: {
        id: "$.id",
        productId: "$.product_id",
        sku: "$.sku",
        title: "$.name",
        productTitle: "$.product_title",
        listPrice: { path: "$.price", unit: "major" },
        salePrice: { path: "$.sale_price", unit: "major" },
        availability: { path: "$.stock" },
      },
    },
  };
}

function booksConfig() {
  return {
    id: "maple-main-books",
    merchant: {
      name: "Maple & Main Books",
      description: "Indie bookshop. Catalog search and product lookup are live; cart and checkout are still being wired up.",
      url: "https://maplemain.books.example",
      country: "CA",
      defaultCurrency: "CAD",
    },
    http: { baseUrl: "https://api.maplemain.books.example", timeoutMs: 3000 },
    catalog: {
      search: { path: "/books", query: { q: "{query}", page: "{page}", limit: "{limit}" }, itemsPath: "$.items", totalPath: "$.meta.total", pageSize: 20 },
      productUrl: "/books/{productId}",
      variantUrl: "/books/{productId}/editions/{variantId}",
    },
    mappings: {
      product: {
        id: "$.id",
        title: "$.title",
        description: "$.description",
        category: "$.category",
        brand: "$.publisher",
        variants: {
          path: "$.editions",
          each: {
            id: "$.id",
            sku: "$.isbn",
            title: "$.format",
            listPrice: { path: "$.price", unit: "major" },
            availability: { path: "$.stock" },
          },
        },
      },
    },
  };
}

const DEMO_MERCHANTS = [
  { id: "common-goods-rest", name: "Common Goods Co.", currency: "INR", state: "ready", tags: ["catalog", "offers", "stock"], description: "Basic ecommerce store served by the /testing REST backend. Fully configured end-to-end through the config-driven adapter." },
  { id: "aurora-optics", name: "Aurora Optics", currency: "USD", state: "ready", tags: ["catalog", "offers", "stock"], description: "Precision eyewear and optical instruments, sold direct." },
  { id: "maple-main-books", name: "Maple & Main Books", currency: "CAD", state: "draft", tags: ["catalog"], description: "Indie bookshop — catalog live, cart/checkout still being wired." },
];

function merchantEntry(id) {
  return DEMO_MERCHANTS.find((m) => m.id === id);
}

function configFor(id, req) {
  if (id === "common-goods-rest") return demoConfigFor(req);
  if (id === "aurora-optics") return auroraConfig();
  if (id === "maple-main-books") return booksConfig();
  return undefined;
}

function origin(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function notHosted(res, action) {
  json(res, 409, { error: `Hosted demo — "${action}" runs on your own VM/backend, not on Vercel.` });
}

function demoConfig() {
  return JSON.parse(JSON.stringify(merchantConfig));
}

function demoConfigFor(req) {
  const cfg = demoConfig();
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  return cfg;
}

function seededPresets() {
  const now = new Date().toISOString();
  const concierge = defaultAgentConfig();
  concierge.agentName = "Common Goods Concierge";
  concierge.persona = "A warm, precise concierge for Common Goods Co. — home, desk and outdoor everyday goods.";
  concierge.greeting = "Hi — looking for something particular today?";
  concierge.tone = "friendly";

  const optician = defaultAgentConfig();
  optician.agentName = "Aurora Optician Assistant";
  optician.persona = "A knowledgeable optical specialist who helps buyers choose eyewear and verifies prescriptions and fit.";
  optician.greeting = "Hi — let's find the right pair for you.";
  optician.tone = "professional";

  const bookseller = defaultAgentConfig();
  bookseller.agentName = "Maple & Main Bookseller";
  bookseller.persona = "An enthusiastic indie bookseller who recommends titles by taste, budget and availability.";
  bookseller.greeting = "Hi — what are you in the mood to read?";
  bookseller.tone = "friendly";

  return [
    { slug: "common-goods-concierge", name: "Common Goods Concierge", merchantId: "common-goods-rest", config: concierge, createdAt: now, updatedAt: now },
    { slug: "aurora-optician", name: "Aurora Optician", merchantId: "aurora-optics", config: optician, createdAt: now, updatedAt: now },
    { slug: "maple-bookseller", name: "Maple & Main Bookseller", merchantId: "maple-main-books", config: bookseller, createdAt: now, updatedAt: now },
  ];
}

function llmSettingsFromEnv() {
  const kind = process.env.LLM_PROVIDER ?? "simulate";
  return {
    kind,
    model: process.env.LLM_MODEL || undefined,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    apiKey: process.env.LLM_API_KEY || undefined,
  };
}

function publicLlm() {
  const s = llmSettingsFromEnv();
  return {
    kind: s.kind,
    model: s.model,
    baseUrl: s.baseUrl,
    hasKey: Boolean(s.apiKey),
    keyHint: s.apiKey ? `…${s.apiKey.slice(-4)}` : undefined,
  };
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function flattenLeaves(value, prefix = "") {
  const out = [];
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
    if (value.length) flattenLeaves(value[0], prefix);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flattenLeaves(v, `${prefix}.${k}`);
    return out;
  }
  out.push({ path: prefix || "$", sample: String(value) });
  return out;
}

function merchantTools(cfg) {
  const caps = detectCapabilities(new RestCommerceProvider(cfg));
  return enabledCapabilities(caps).flatMap((k) => CAP_TOOLS[k] ?? []).concat("get_audit_trail");
}

export default async function handler(req, res) {
  const pathname = new URL(req.url ?? "/", "http://x").pathname;
  const seg = pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method ?? "GET";
  const key = seg.join("/");
  const id = seg[1] ?? "";
  const id2 = seg[2] ?? "";

  if (seg[0] === "demo-store") {
    if (key === "demo-store/healthz") return json(res, 200, { ok: true });
    if (key === "demo-store/products") {
      const url = new URL(req.url ?? "/", "http://x");
      const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
      const category = (url.searchParams.get("category") ?? "").trim();
      const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 12) || 12, 1), 50);
      let rows = PRODUCTS;
      if (category) rows = rows.filter((p) => p.category.toLowerCase() === category.toLowerCase());
      if (q) {
        rows = rows.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q),
        );
      }
      const total = rows.length;
      const start = (page - 1) * limit;
      return json(res, 200, { data: rows.slice(start, start + limit), total, page, limit });
    }
    if (seg[1] === "products" && seg[2]) {
      const product = productById(seg[2]);
      if (!product) return json(res, 404, { error: "product_not_found" });
      return json(res, 200, product);
    }
    if (seg[1] === "variants" && seg[2] && seg[3] === "stock") {
      const row = variantById(seg[2]);
      if (!row) return json(res, 404, { error: "variant_not_found" });
      return json(res, 200, { available: row.stock > 0, quantity: row.stock });
    }
    if (seg[1] === "variants" && seg[2]) {
      const row = variantById(seg[2]);
      if (!row) return json(res, 404, { error: "variant_not_found" });
      return json(res, 200, row);
    }
    if (seg[1] === "offers") {
      const url = new URL(req.url ?? "/", "http://x");
      const row = variantById(url.searchParams.get("variant_id") ?? "");
      if (!row) return json(res, 404, { error: "variant_not_found" });
      return json(res, 200, row);
    }
    return json(res, 404, { error: "not_found" });
  }

  if (key === "merchants" && method === "GET") {
    return json(
      res,
      200,
      DEMO_MERCHANTS.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        baseUrl: m.id === "common-goods-rest" ? `${origin(req)}${DEMO_STORE_PATH}` : configFor(m.id, req).http.baseUrl,
        currency: m.currency,
        updatedAt: new Date().toISOString(),
        state: m.state,
        tags: m.tags,
      })),
    );
  }
  if (seg[0] === "merchants" && id && key === `merchants/${id}`) {
    const cfg = configFor(id, req);
    if (!cfg) return json(res, 404, { error: "not_found" });
    if (method === "GET") return json(res, 200, cfg);
    return notHosted(res, "editing/saving merchant configuration");
  }
  if (seg[0] === "merchants" && id && key === `merchants/${id}/agent`) {
    if (!merchantEntry(id)) return json(res, 404, { error: "not_found" });
    if (method === "GET") return json(res, 200, defaultAgentConfig());
    return notHosted(res, "saving agent configuration");
  }
  if (seg[0] === "merchants" && id && key === `merchants/${id}/agent/tools`) {
    const cfg = configFor(id, req);
    if (!cfg) return json(res, 404, { error: "not_found" });
    return json(res, 200, { capabilities: enabledCapabilities(detectCapabilities(new RestCommerceProvider(cfg))), tools: merchantTools(cfg) });
  }
  if (seg[0] === "merchants" && id && key === `merchants/${id}/agent/kit`) {
    const cfg = configFor(id, req);
    if (!cfg) return json(res, 404, { error: "not_found" });
    const baseOrigin = origin(req);
    const agent = defaultAgentConfig();
    return json(res, 200, {
      merchantId: id,
      agent,
      baseUrl: baseOrigin,
      endpoints: {
        mcp: `${baseOrigin}/mcp`,
        ucp: `${baseOrigin}/.well-known/ucp`,
        agentsMd: `${baseOrigin}/agents.md`,
        llmsTxt: `${baseOrigin}/llms.txt`,
      },
      tools: merchantTools(cfg),
      instructions: [
        `# ${agent.agentName} — instructions for ${cfg.merchant.name}`,
        `Persona: ${agent.persona}`,
        agent.instructions,
        "Verify availability + live offer before recommending anything.",
        "Hosted demo: transact against a gateway you run on your own VM.",
      ].join("\n"),
      mcpServersJson: JSON.stringify({ mcpServers: { [id]: { url: `${baseOrigin}/mcp` } } }, null, 2),
      checkoutSnippet: "// Hosted demo: checkout runs against a gateway on your VM.",
    });
  }
  if (seg[0] === "merchants" && id && key === `merchants/${id}/landscape`) {
    const cfg = configFor(id, req);
    if (!cfg) return json(res, 404, { error: "not_found" });
    try {
      const landscape = await buildLandscape(cfg, origin(req));
      return json(res, 200, { ...landscape, live: false, running: false });
    } catch (err) {
      return json(res, 400, { error: "cannot build agent landscape", reason: err instanceof Error ? err.message : String(err) });
    }
  }
  if (key === "merchants/validate" && method === "POST") {
    const errors = validateRestConfig(demoConfigFor(req));
    return json(res, 200, { ok: errors.length === 0, errors });
  }
  if (key === "merchants/sample" && method === "POST") {
    const body = await readBody(req);
    let parsedUrl;
    try {
      parsedUrl = new URL(body.url ?? "");
    } catch {
      return json(res, 400, { ok: false, error: "invalid url" });
    }
    const own = new URL(origin(req));
    if (parsedUrl.host !== own.host) {
      return json(res, 403, { ok: false, error: "Hosted demo: sample fetches are limited to this deployment's demo store." });
    }
    try {
      const upstream = await fetch(parsedUrl.toString(), { headers: { accept: "application/json" } });
      const text = await upstream.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      return json(res, 200, {
        ok: upstream.ok,
        status: upstream.status,
        contentType: upstream.headers.get("content-type"),
        body: parsed !== undefined ? parsed : text.slice(0, 2000),
        leaves: parsed !== undefined ? flattenLeaves(parsed).slice(0, 200) : [],
      });
    } catch (err) {
      return json(res, 502, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (key === "merchants/upsell/preview" && method === "POST") {
    try {
      const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
      const cart = await provider.cart.create();
      await provider.cart.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
      const items = await provider.recommendations.get({ cartId: cart.id });
      provider.close();
      return json(res, 200, { items });
    } catch (err) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (key === "gateway/status") return json(res, 200, { running: false, lastError: "Hosted demo — the gateway runs on your own VM/backend." });
  if (key === "gateway/logs") return json(res, 200, []);
  if (key === "gateway/start") return notHosted(res, "starting the gateway");
  if (key === "gateway/stop") return json(res, 200, { running: false });

  if (key === "demo-rest/status") {
    return json(res, 200, {
      id: DEMO_MERCHANT_ID,
      installed: true,
      store: { running: false, port: 8799 },
      gateway: { running: false, lastError: "Hosted demo — the gateway runs on your own VM/backend." },
    });
  }
  if (key === "demo-rest/boot") return notHosted(res, "booting the demo store + gateway");
  if (key === "demo-rest/stop") return json(res, 200, { ok: true, gateway: { running: false }, store: { running: false } });

  if (key === "llm/provider") {
    if (method === "GET") return json(res, 200, publicLlm());
    return json(res, 200, { ok: true, provider: publicLlm(), note: "Hosted demo — set LLM_PROVIDER / LLM_MODEL / LLM_API_KEY as Vercel env vars." });
  }

  if (key === "agents/presets") {
    if (method === "GET") return json(res, 200, seededPresets());
    return json(res, 200, { ok: true, note: "Hosted demo — presets are read-only; manage them on your own VM/backend." });
  }
  if (key === "agents/chat" && method === "POST") {
    const body = await readBody(req);
    const cfg = configFor(body.merchantId, req);
    if (!cfg || !Array.isArray(body.messages)) {
      return json(res, 400, { error: "merchantId and messages are required" });
    }
    const result = await runAgentChat({
      merchant: cfg,
      agent: body.config,
      settings: llmSettingsFromEnv(),
      messages: body.messages,
    });
    return json(res, 200, result);
  }
  if (seg[0] === "agents" && id2 === "chat" && id) {
    const slug = id;
    const preset = seededPresets().find((p) => p.slug === slug);
    if (!preset) return json(res, 404, { error: "agent preset not found" });
    const body = await readBody(req);
    if (!Array.isArray(body.messages)) return json(res, 400, { error: "messages are required" });
    const result = await runAgentChat({
      merchant: demoConfigFor(req),
      agent: preset.config,
      settings: llmSettingsFromEnv(),
      messages: body.messages,
    });
    return json(res, 200, result);
  }

  if (key === "audit") {
    const t = Date.now();
    return json(res, 200, [
      { event: "cart.created", timestamp: new Date(t - 60000).toISOString(), amount: 0, approval: { required: false }, explanation: "Agent opened a new cart for the buyer." },
      { event: "cart.item_added", timestamp: new Date(t - 45000).toISOString(), amount: 209900, currency: "INR", approval: { required: false }, explanation: "Harbor Canvas Backpack (Navy) added — 1 × ₹2,099.00." },
      { event: "offer.verified", timestamp: new Date(t - 30000).toISOString(), amount: 209900, currency: "INR", approval: { required: false }, explanation: "Live offer re-verified before quoting the buyer." },
      { event: "checkout.completed", timestamp: new Date(t - 15000).toISOString(), amount: 209900, currency: "INR", approval: { required: true, granted: true }, explanation: "Buyer approved the purchase; order recorded." },
      { event: "payment.authorized", timestamp: new Date(t - 5000).toISOString(), amount: 209900, currency: "INR", approval: { required: false }, explanation: "Razorpay test-mode payment authorized (order rzp-test-8842)." },
    ]);
  }
  if (key === "templates/blank") return notHosted(res, "creating new merchants");

  return json(res, 404, { error: "not_found" });
}
