import { existsSync, readFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createDashboardApp } from "./app.js";

const ROOT = process.cwd();
const DATA_DIR = process.env.DATA_DIR ?? join(ROOT, "data", "merchants");
const PORT = Number(process.env.DASHBOARD_PORT ?? 8788);
const WEB_DIST = join(ROOT, "apps", "dashboard", "web-dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

const api = createDashboardApp({ repoRoot: ROOT, dataDir: DATA_DIR });

const app = new Hono();
app.route("/", api);

// SPA static fallback for non-/api routes (serves the built UI when present).
app.get("*", (c) => {
  const url = new URL(c.req.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  if (!existsSync(WEB_DIST)) {
    return c.text(
      "Dashboard UI is not built.\nRun `pnpm dashboard:web` (dev) or `pnpm dashboard:build`, then reload.",
      200,
    );
  }
  const base = normalize(WEB_DIST);
  let file = normalize(join(base, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(base) || !existsSync(file) || extname(file) === "") file = join(base, "index.html");
  if (!file.startsWith(base)) file = join(base, "index.html");
  const body = readFileSync(file);
  return c.body(body as never, 200, {
    "content-type": MIME[extname(file)] ?? "application/octet-stream",
  });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[dashboard] http://localhost:${info.port}`);
  console.log(`[dashboard] API  http://localhost:${info.port}/api`);
  console.log(`[dashboard] data ${DATA_DIR}`);
  console.log(existsSync(WEB_DIST) ? "[dashboard] UI: built" : "[dashboard] UI: not built (pnpm dashboard:web)");
});
