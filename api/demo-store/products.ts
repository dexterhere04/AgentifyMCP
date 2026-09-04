import { json, type Handler } from "../_lib.js";
import { PRODUCTS } from "../../testing/basic-store/catalog.js";

const handler: Handler = (req, res) => {
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
};

export default handler;
