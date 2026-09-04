import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { createDashboardApp } from "../src/api/app.js";

function findRepoRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("repo root not found");
}

const REPO = findRepoRoot(process.cwd());

let dir: string;
let app: Hono;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dash-"));
  app = createDashboardApp({
    repoRoot: REPO,
    dataDir: join(dir, "merchants"),
    auditDbPath: join(dir, "audit.db"),
    agentsDir: join(dir, "agents"),
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("dashboard API — merchants", () => {
  it("creates, saves, lists and deletes a merchant", async () => {
    const blank = (await (await app.request("/api/templates/blank")).json()) as { id: string };
    const save = await app.request(`/api/merchants/${blank.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(blank),
    });
    expect(save.status).toBe(200);

    const list = (await (await app.request("/api/merchants")).json()) as Array<{ id: string; name: string }>;
    expect(list.some((m) => m.id === blank.id)).toBe(true);

    const del = await app.request(`/api/merchants/${blank.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const after = (await (await app.request("/api/merchants")).json()) as unknown[];
    expect(after).toHaveLength(0);
  });

  it("validates a bad config and rejects saving it", async () => {
    const bad = { id: "x" };
    const v = await app.request("/api/merchants/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bad),
    });
    const body = (await v.json()) as { ok: boolean; errors: string[] };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);

    const save = await app.request("/api/merchants/x", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bad),
    });
    expect(save.status).toBe(400);
  });
});

describe("dashboard API — test against the Luna fixture", () => {
  it("runs the smoke test offline against the fixture store", async () => {
    const res = await app.request("/api/merchants/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: {}, fixture: true }),
    });
    const body = (await res.json()) as {
      ok: boolean;
      search?: { total: number };
      product?: { title: string };
      offer?: { price?: { amount: number } };
    };
    expect(body.ok).toBe(true);
    expect(body.search?.total).toBeGreaterThan(0);
    expect(body.product?.title).toBeTruthy();
    expect(body.offer?.price?.amount).toBeGreaterThan(0);
  });
});

describe("dashboard API — gateway child manager", () => {
  it("starts the demo gateway, reports readiness, and stops it", async () => {
    const port = await freePort();
    const start = await app.request("/api/gateway/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "mock", port, baseUrl: `http://localhost:${port}` }),
    });
    expect(start.status).toBe(200);
    expect(((await start.json()) as { running: boolean }).running).toBe(true);

    // wait until the child gateway is healthy
    let ready = false;
    for (let i = 0; i < 20; i += 1) {
      await sleep(500);
      const readiness = (await (await app.request("/api/gateway/readiness")).json()) as { running: boolean };
      if (readiness.running) {
        ready = true;
        break;
      }
    }
    expect(ready).toBe(true);

    const logs = (await (await app.request("/api/gateway/logs")).json()) as string[];
    expect(logs.join("\n")).toContain("listening");

    await app.request("/api/gateway/stop", { method: "POST" });
    for (let i = 0; i < 20; i += 1) {
      await sleep(300);
      const status = (await (await app.request("/api/gateway/status")).json()) as { running: boolean };
      if (!status.running) break;
    }
    const status = (await (await app.request("/api/gateway/status")).json()) as { running: boolean };
    expect(status.running).toBe(false);
  }, 60000);
});

describe("dashboard API — agent playground", () => {
  async function seedMerchant(): Promise<string> {
    const blank = (await (await app.request("/api/templates/blank")).json()) as { id: string };
    await app.request(`/api/merchants/${blank.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(blank) });
    return blank.id;
  }

  it("saves and reloads an agent config", async () => {
    const id = await seedMerchant();
    const cfg = {
      agentName: "Luna Shopper",
      persona: "helpful",
      instructions: "verify offers",
      checkout: { mode: "in_app" },
      recommendations: { enabled: true, maxSuggestions: 2, budgetGuard: true, overrides: [] },
      capabilities: {},
    };
    const put = await app.request(`/api/merchants/${id}/agent`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg) });
    expect(put.status).toBe(200);
    const got = (await (await app.request(`/api/merchants/${id}/agent`)).json()) as { agentName: string };
    expect(got.agentName).toBe("Luna Shopper");
  });

  it("returns a tools manifest and a connection kit", async () => {
    const id = await seedMerchant();
    const tools = (await (await app.request(`/api/merchants/${id}/agent/tools`)).json()) as { tools: string[] };
    expect(tools.tools).toContain("search_catalog");
    const kit = (await (await app.request(`/api/merchants/${id}/agent/kit`)).json()) as {
      endpoints: { mcp: string };
      mcpServersJson: string;
      tools: string[];
    };
    expect(kit.endpoints.mcp).toContain("/mcp");
    expect(kit.mcpServersJson).toContain("/mcp");
    expect(kit.tools.length).toBeGreaterThan(0);
  });

  it("runs the upsell/cross-sell demo preview", async () => {
    const res = await app.request("/api/merchants/upsell/preview", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await res.json()) as { items: Array<{ kind: string }> };
    expect(body.items.some((i) => i.kind === "upsell")).toBe(true);
  });
});
