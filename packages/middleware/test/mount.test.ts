import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { Hono } from "hono";
import { createMockCommerceProvider } from "@agentify/adapter-mock";
import { createGateway, type Gateway } from "@agentify/gateway";
import { mountExpress, expressRouter } from "../src/express.js";
import { mountHono } from "../src/hono.js";

async function buildGateway(): Promise<Gateway> {
  return createGateway({
    config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
    provider: createMockCommerceProvider({ storeUrl: "https://demo.example" }),
  });
}

let servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((r) => {
          s.close(() => r());
        }),
    ),
  );
  servers = [];
});

async function startHttp(app: express.Express): Promise<string> {
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("express mount", () => {
  it("serves the full agent surface on an Express app", async () => {
    const gateway = await buildGateway();
    const app = express();
    mountExpress(app, gateway);
    const base = await startHttp(app);

    const health = await (await fetch(`${base}/healthz`)).json();
    expect(health.status).toBe("ok");

    const ucp = await (await fetch(`${base}/.well-known/ucp`)).json();
    expect(ucp.ucp.capabilities["dev.ucp.shopping.checkout"]).toBeDefined();

    const agents = await (await fetch(`${base}/agents.md`)).text();
    expect(agents).toContain("Agent Instructions");

    const llms = await (await fetch(`${base}/llms.txt`)).text();
    expect(llms.startsWith("# Aarna Jewels")).toBe(true);

    // raw-body MCP initialize survives the Node bridge
    const init = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      }),
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeTruthy();

    await gateway.mcp.close();
  });

  it("mounts under a prefix via expressRouter", async () => {
    const gateway = await buildGateway();
    const app = express();
    app.use("/agents", expressRouter(gateway));
    const base = await startHttp(app);

    const res = await fetch(`${base}/agents/llms.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.startsWith("# Aarna Jewels")).toBe(true);
    await gateway.mcp.close();
  });
});

describe("hono mount", () => {
  it("proxies the gateway through an existing Hono app", async () => {
    const gateway = await buildGateway();
    const parent = new Hono();
    mountHono(parent, gateway);

    const health = await (await parent.request("/healthz")).json();
    expect(health.status).toBe("ok");

    const ucpRes = await parent.request("/.well-known/ucp");
    const profile = (await ucpRes.json()) as { ucp: { capabilities: Record<string, unknown> } };
    expect(profile.ucp.capabilities["dev.ucp.shopping.catalog.search"]).toBeDefined();

    await gateway.mcp.close();
  });
});
