import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { razorpayGatewayFromEnv } from "@agentify/payments-razorpay";
import { createGateway } from "./app.js";
import { loadConfig } from "./config.js";

// Node does not load .env implicitly — pull it in when present (repo root).
if (existsSync(".env") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(".env");
}

/**
 * Gateway server entry point. Run with `pnpm gateway` (root) or
 * `pnpm --filter @agentify/gateway start`.
 *
 * Payment (Razorpay test mode) is enabled when RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET are set:
 *   RAZORPAY_KEY_ID         rzp_test_...
 *   RAZORPAY_KEY_SECRET     ...
 *   RAZORPAY_WEBHOOK_SECRET webhook secret (webhook reconciliation)
 *   RAZORPAY_MODE           test | live (default test)
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const razorpay = razorpayGatewayFromEnv();
    console.log(`[gateway] booting, base URL ${config.baseUrl}`);
    const gateway = await createGateway({
      config,
      ...(razorpay ? { payment: { gateway: razorpay, handlerName: "dev.agentify.razorpay.test" } } : {}),
    });

    const server = serve(
      { fetch: gateway.app.fetch, port: config.port },
      (info) => {
        console.log(`[gateway] listening on http://localhost:${info.port}`);
        console.log(`[gateway] MCP endpoint : ${config.baseUrl}/mcp`);
        console.log(`[gateway] UCP          : ${config.baseUrl}/.well-known/ucp`);
        console.log(`[gateway] agents.md     : ${config.baseUrl}/agents.md`);
        console.log(`[gateway] llms.txt      : ${config.baseUrl}/llms.txt`);
        console.log(`[gateway] health        : ${config.baseUrl}/healthz`);
        if (razorpay) {
          console.log(`[gateway] payment       : razorpay (${config.baseUrl}/webhooks/razorpay)`);
          console.log(`[gateway]   reconcile    : webhook OR poll order status`);
        } else {
          console.log(`[gateway] payment       : none (set RAZORPAY_KEY_ID/KEY_SECRET to enable)`);
        }
      },
    );

    const shutdown = async (): Promise<void> => {
      await gateway.mcp.close();
      const closeable = gateway.provider as { close?: () => void };
      if (typeof closeable.close === "function") closeable.close();
      const auditStore = gateway.audit as { close?: () => void };
      if (typeof auditStore.close === "function") auditStore.close();
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
