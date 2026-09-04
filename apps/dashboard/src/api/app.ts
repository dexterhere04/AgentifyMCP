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
import { SqliteAuditStore } from "@agentify/audit";
import { detectCapabilities, isProviderError } from "@agentify/canonical-commerce";
import { MerchantStore } from "./store.js";
import { GatewayManager } from "./gateway-manager.js";

export interface DashboardOptions {
  repoRoot: string;
  dataDir: string;
  auditDbPath?: string;
}

const SCHEMA_REL = join("packages", "adapter-rest", "schemas", "merchant-config.schema.json");

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

function flattenLeaves(value: unknown, prefix = ""): Array<{ path: string; sample: string }> {
  const out: Array<{ path: string; sample: string }> = [];
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) {
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
  const manager = new GatewayManager(opts.repoRoot);
  const schema = readFileSync(join(opts.repoRoot, SCHEMA_REL), "utf8");
  const auditPath = opts.auditDbPath ?? join(opts.dataDir, "audit.db");
  const audit = new SqliteAuditStore(auditPath);

  const app = new Hono();

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
