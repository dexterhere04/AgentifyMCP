import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { PRODUCTS, productById, variantById } from "./catalog.js";

const app = new Hono();

app.get("/", (c) =>
  c.json({ name: "Common Goods Co. — basic store test API", health: "/healthz", catalog: "/products" }),
);

app.get("/healthz", (c) => c.json({ ok: true }));

app.get("/products", (c) => {
  const q = (c.req.query("q") ?? "").trim().toLowerCase();
  const category = (c.req.query("category") ?? "").trim();
  const page = Math.max(Number(c.req.query("page") ?? 1) || 1, 1);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12) || 12, 1), 50);

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
  return c.json({ data: rows.slice(start, start + limit), total, page, limit });
});

app.get("/products/:productId", (c) => {
  const product = productById(c.req.param("productId"));
  if (!product) return c.json({ error: "product_not_found" }, 404);
  return c.json(product);
});

app.get("/variants/:variantId", (c) => {
  const row = variantById(c.req.param("variantId"));
  if (!row) return c.json({ error: "variant_not_found" }, 404);
  return c.json(row);
});

app.get("/variants/:variantId/stock", (c) => {
  const row = variantById(c.req.param("variantId"));
  if (!row) return c.json({ error: "variant_not_found" }, 404);
  return c.json({ available: row.stock > 0, quantity: row.stock });
});

app.get("/offers", (c) => {
  const variantId = c.req.query("variant_id");
  const row = variantById(variantId ?? "");
  if (!row) return c.json({ error: "variant_not_found" }, 404);
  return c.json(row);
});

export function createBasicStoreServer(port = 0): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port }, (info) => {
      resolve({
        baseUrl: `http://127.0.0.1:${info.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "\u0000");

if (isMain) {
  const port = Number(process.env.PORT ?? 8799);
  void createBasicStoreServer(port).then(({ baseUrl }) => {
    console.log(`[common-goods] testing store listening on ${baseUrl}`);
    console.log(`[common-goods] merchant base URL for config: http://localhost:${port}`);
  });
}
