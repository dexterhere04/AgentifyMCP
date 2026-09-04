import { serve } from "@hono/node-server";
import { createGateway } from "./app.js";
import { loadConfig } from "./config.js";

/**
 * Gateway server entry point. Run with `pnpm gateway` (root) or
 * `pnpm --filter @agentify/gateway start`.
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    console.log(`[gateway] booting, base URL ${config.baseUrl}`);
    const gateway = await createGateway({ config });

    const server = serve(
      { fetch: gateway.app.fetch, port: config.port },
      (info) => {
        console.log(`[gateway] listening on http://localhost:${info.port}`);
        console.log(`[gateway] MCP endpoint : ${config.baseUrl}/mcp`);
        console.log(`[gateway] agents.md     : ${config.baseUrl}/agents.md`);
        console.log(`[gateway] llms.txt      : ${config.baseUrl}/llms.txt`);
        console.log(`[gateway] health        : ${config.baseUrl}/healthz`);
      },
    );

    const shutdown = async (): Promise<void> => {
      await gateway.mcp.close();
      const closeable = gateway.provider as { close?: () => void };
      if (typeof closeable.close === "function") closeable.close();
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  } catch (err) {
    console.error("[gateway] failed to start:", err);
    process.exit(1);
  }
}

void main();
