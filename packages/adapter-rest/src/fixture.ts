import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A small, self-contained REST merchant used to exercise the config-driven
 * REST adapter. It is the "second merchant" with a DIFFERENT data shape from
 * the mock: Shape B/C payloads (`product_id`, `pricing.{mrp,selling_price}`,
 * `inventory.{available,quantity}`, `{ "data": [...] }` wrappers), bearer-token
 * auth, and fault injection for failure tests.
 *
 * No canonical/gateway code is imported here — it behaves like any merchant
 * backend the gateway might connect to.
 */

export interface FixtureVariant {
  variant_id: string;
  product_id: string;
  sku: string;
  title: string;
  attributes: Record<string, string>;
  pricing: { mrp: number; selling_price: number };
  inventory: { available: boolean; quantity: number };
}

export interface FixtureProduct {
  product_id: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  material: string;
  images: string[];
  variants: FixtureVariant[];
}

const TOKEN = "test-secret";

const PRODUCTS: FixtureProduct[] = [
  {
    product_id: "sl-pendant",
    title: "Moonstone Pendant Necklace",
    description: "Hammered moonstone pendant on a fine chain (second store).",
    category: "Necklaces",
    brand: "Luna & Co",
    material: "Sterling Silver",
    images: ["https://cdn.second.example/sl-pendant.jpg"],
    variants: [
      {
        variant_id: "v-sl-pendant-silver",
        product_id: "sl-pendant",
        sku: "LUNA-MOON-1",
        title: "Silver",
        attributes: { material: "Sterling Silver", length: "18 inch" },
        pricing: { mrp: 3400, selling_price: 2890 },
        inventory: { available: true, quantity: 14 },
      },
    ],
  },
  {
    product_id: "sl-chain-minimal",
    title: "Minimal Chain Necklace",
    description: "Barely-there everyday chain.",
    category: "Necklaces",
    brand: "Luna & Co",
    material: "14K Gold Vermeil",
    images: ["https://cdn.second.example/sl-chain-minimal.jpg"],
    variants: [
      {
        variant_id: "v-sl-chain-40cm",
        product_id: "sl-chain-minimal",
        sku: "LUNA-CHAIN-40",
        title: "40 cm",
        attributes: { length: "40 cm" },
        pricing: { mrp: 2200, selling_price: 2200 },
        inventory: { available: true, quantity: 8 },
      },
      {
        variant_id: "v-sl-chain-45cm",
        product_id: "sl-chain-minimal",
        sku: "LUNA-CHAIN-45",
        title: "45 cm",
        attributes: { length: "45 cm" },
        pricing: { mrp: 2400, selling_price: 2400 },
        inventory: { available: true, quantity: 5 },
      },
    ],
  },
  {
    product_id: "sl-hoops",
    title: "Hammered Hoops",
    description: "Statement hammered hoops, feather-light.",
    category: "Earrings",
    brand: "Luna & Co",
    material: "Sterling Silver",
    images: ["https://cdn.second.example/sl-hoops.jpg"],
    variants: [
      {
        variant_id: "v-sl-hoops-30",
        product_id: "sl-hoops",
        sku: "LUNA-HOOPS-30",
        title: "30 mm",
        attributes: { size: "30 mm" },
        pricing: { mrp: 1800, selling_price: 1530 },
        inventory: { available: true, quantity: 20 },
      },
    ],
  },
  {
    product_id: "sl-bangle-stack",
    title: "Stackable Bangles Set",
    description: "Set of three mixed-metal stackable bangles.",
    category: "Bangles",
    brand: "Luna & Co",
    material: "Mixed Metal",
    images: ["https://cdn.second.example/sl-bangle-stack.jpg"],
    variants: [
      {
        variant_id: "v-sl-bangle-set",
        product_id: "sl-bangle-stack",
        sku: "LUNA-BNG-SET",
        title: "Set of 3",
        attributes: { quantity: "3" },
        pricing: { mrp: 2600, selling_price: 2080 },
        inventory: { available: false, quantity: 0 },
      },
    ],
  },
  {
    product_id: "sl-ring-luna",
    title: "Luna Signet Ring",
    description: "Chunky silver signet.",
    category: "Rings",
    brand: "Luna & Co",
    material: "Sterling Silver",
    images: ["https://cdn.second.example/sl-ring-luna.jpg"],
    variants: [
      {
        variant_id: "v-sl-ring-6",
        product_id: "sl-ring-luna",
        sku: "LUNA-RING-6",
        title: "Size 6",
        attributes: { size: "6" },
        pricing: { mrp: 1600, selling_price: 1600 },
        inventory: { available: true, quantity: 3 },
      },
      {
        variant_id: "v-sl-ring-7",
        product_id: "sl-ring-luna",
        sku: "LUNA-RING-7",
        title: "Size 7",
        attributes: { size: "7" },
        pricing: { mrp: 1600, selling_price: 1600 },
        inventory: { available: false, quantity: 0 },
      },
    ],
  },
  {
    product_id: "sl-earcuffs",
    title: "Sterling Ear Cuffs",
    description: "Single ear cuff for no-piercing wear.",
    category: "Earrings",
    brand: "Luna & Co",
    material: "Sterling Silver",
    images: ["https://cdn.second.example/sl-earcuffs.jpg"],
    variants: [
      {
        variant_id: "v-sl-earcuffs-1",
        product_id: "sl-earcuffs",
        sku: "LUNA-CUFF-1",
        title: "One size",
        attributes: { size: "one size" },
        pricing: { mrp: 1200, selling_price: 1200 },
        inventory: { available: true, quantity: 1 },
      },
    ],
  },
];

function variantById(id: string): FixtureVariant | undefined {
  for (const p of PRODUCTS) {
    const v = p.variants.find((x) => x.variant_id === id);
    if (v) return v;
  }
  return undefined;
}

function searchProducts(query: string, category: string): FixtureProduct[] {
  const q = query.toLowerCase().trim();
  return PRODUCTS.filter((p) => {
    if (category) {
      const wanted = category.toLowerCase();
      const brand = p.brand.toLowerCase();
      const title = p.title.toLowerCase();
      const categoryMatch = p.category.toLowerCase() === wanted || brand.includes(wanted) || title.includes(wanted);
      if (!categoryMatch) return false;
    }
    if (q) {
      const haystack = `${p.title} ${p.description} ${p.category} ${p.brand} ${p.material}`.toLowerCase();
      const tokens = q.split(/\s+/).filter(Boolean);
      if (!tokens.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

export interface FixtureStoreOptions {
  /** Require the expected bearer token. Set false for auth-optional fixtures. */
  auth?: boolean;
  /** Simulate latency in ms for every request. */
  latencyMs?: number;
}

export interface FixtureStore {
  /** Base URL the client should call. */
  baseUrl: string;
  server: Server;
  close(): Promise<void>;
}

export function createFixtureStoreServer(options: FixtureStoreOptions = {}): Promise<FixtureStore> {
  const authEnabled = options.auth ?? true;
  const latencyMs = options.latencyMs ?? 0;

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (authEnabled) {
      const header = req.headers.authorization ?? "";
      if (header !== `Bearer ${TOKEN}`) {
        const status = header ? 403 : 401;
        return send(res, status, { error: "unauthorized" });
      }
    }

    if (latencyMs > 0) await delay(latencyMs);

    // failure injection via product/variant ids
    const productMatch = path.match(/^\/products\/([^/]+)$/);
    const variantMatch = path.match(/^\/variants\/([^/]+)$/);

    if (path === "/products" && req.method === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const category = url.searchParams.get("category") ?? "";
      const results = searchProducts(q, category);
      const page = Number(url.searchParams.get("page") ?? 1);
      const limit = Number(url.searchParams.get("limit") ?? 10);
      const start = (page - 1) * limit;
      const slice = results.slice(start, start + limit);
      return send(res, 200, { data: slice, total: results.length, next_cursor: null });
    }

    if (productMatch) {
      const id = productMatch[1]!;
      const fault = faultFor(id);
      if (fault) {
        if (fault.invalidJson) {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end("this is not json {{{");
          return;
        }
        return send(res, fault.status, { error: fault.message });
      }
      const product = PRODUCTS.find((p) => p.product_id === id);
      if (!product) return send(res, 404, { error: "not_found" });
      return send(res, 200, product);
    }

    if (variantMatch) {
      const id = variantMatch[1]!;
      const fault = faultFor(id);
      if (fault) {
        if (fault.invalidJson) {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end("this is not json {{{");
          return;
        }
        return send(res, fault.status, { error: fault.message });
      }
      const variant = variantById(id);
      if (!variant) return send(res, 404, { error: "not_found" });
      return send(res, 200, variant);
    }

    if (path === "/offers" && req.method === "GET") {
      const variantId = url.searchParams.get("variant_id") ?? "";
      const variant = variantById(variantId);
      if (!variant) return send(res, 404, { error: "not_found" });
      const product = PRODUCTS.find((p) => p.product_id === variant.product_id)!;
      return send(res, 200, {
        product_id: product.product_id,
        title: product.title,
        variant_id: variant.variant_id,
        sku: variant.sku,
        variant_title: variant.title,
        pricing: variant.pricing,
        inventory: variant.inventory,
      });
    }

    if (path.startsWith("/variants/") && path.endsWith("/stock")) {
      const id = path.split("/")[2]!;
      const variant = variantById(id);
      if (!variant) return send(res, 404, { error: "not_found" });
      return send(res, 200, variant.inventory);
    }

    return send(res, 404, { error: "unknown_path" });
  }

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        server,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function faultFor(id: string): { status: number; message: string; invalidJson?: boolean } | undefined {
  if (id.startsWith("err-500")) return { status: 500, message: "boom" };
  if (id.startsWith("err-429")) return { status: 429, message: "too many requests" };
  if (id.startsWith("err-403")) return { status: 403, message: "forbidden" };
  if (id.startsWith("err-invalid")) return { status: 200, message: "", invalidJson: true };
  if (id.startsWith("err-timeout")) return { status: 408, message: "timeout" };
  return undefined;
}

function send(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
): void {
  if (!res.headersSent) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  }
  res.end(JSON.stringify(body));
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const FIXTURE_TOKEN = TOKEN;
export { PRODUCTS };
