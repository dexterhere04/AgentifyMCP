#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createMockCommerceProvider, type MockCommerceProvider } from "@agentify/adapter-mock";
import {
  RestCommerceProvider,
  validateRestConfig,
  type RestAdapterConfig,
} from "@agentify/adapter-rest";
import type { CommerceProvider, PaymentGateway } from "@agentify/canonical-commerce";
import { detectCapabilities } from "@agentify/canonical-commerce";
import { createMetadata } from "@agentify/metadata";
import { buildUcpProfile, serializeUcpProfile } from "@agentify/ucp";

// Node does not load .env implicitly — pull it in when present (repo root).
if (existsSync(".env") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(".env");
}

/**
 * `agentify` CLI
 *
 *   agentify init                        scaffold a merchant config from a template
 *   agentify generate --config <file>    emit static agent files (llms.txt, agents.md,
 *                                        /.well-known/ucp, catalog.json)
 *   agentify serve  --config <file>      boot the gateway for a merchant config
 *
 * Use `--mock` instead of `--config` to run against the built-in demo merchant.
 */

interface CommonOptions {
  config?: string;
  mock?: boolean;
}

async function loadProvider(opts: CommonOptions): Promise<CommerceProvider> {
  if (opts.mock) {
    return createMockCommerceProvider({ storeUrl: "https://demo.example" }) as CommerceProvider;
  }
  if (!opts.config) {
    throw new Error("provide --config <merchant-config.json> or --mock");
  }
  const raw = await readFile(opts.config, "utf8");
  const config = JSON.parse(raw) as RestAdapterConfig;
  const errors = validateRestConfig(config);
  if (errors.length > 0) {
    throw new Error(`invalid merchant config:\n- ${errors.join("\n- ")}`);
  }
  return new RestCommerceProvider(config);
}

export async function runGenerate(opts: CommonOptions & { out: string; baseUrl: string }): Promise<string[]> {
  const provider = await loadProvider(opts);
  const capabilities = detectCapabilities(provider);
  const metadata = await createMetadata(provider, { baseUrl: opts.baseUrl });
  const ucpProfile = buildUcpProfile({ capabilities, baseUrl: opts.baseUrl });

  // collect the whole (paged) catalog as summaries
  const items = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 20) {
    const result = await provider.catalog.search({ limit: 50, page });
    items.push(...result.items);
    hasMore = result.hasMore;
    page += 1;
  }
  const catalog = JSON.stringify({ generated_at: new Date().toISOString(), total: items.length, items }, null, 2);

  const files: Array<[string, string]> = [
    ["llms.txt", metadata.llmsTxt()],
    ["agents.md", metadata.agentsMarkdown()],
    ["catalog.json", catalog],
    [".well-known/ucp", serializeUcpProfile(ucpProfile)],
  ];
  const written: string[] = [];
  for (const [rel, content] of files) {
    const abs = resolve(opts.out, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    written.push(abs);
  }
  return written;
}

async function runServe(
  opts: CommonOptions & { port: number; baseUrl: string; payment?: string },
): Promise<void> {
  const { serve } = await import("@hono/node-server");
  const { createGateway } = await import("@agentify/gateway");
  const provider = await loadProvider(opts);
  let payment: PaymentGateway | undefined;
  if (opts.payment === "razorpay") {
    const { razorpayGatewayFromEnv } = await import("@agentify/payments-razorpay");
    payment = razorpayGatewayFromEnv();
    if (!payment) {
      throw new Error("--payment razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars");
    }
  }
  const gateway = await createGateway({
    config: { port: opts.port, baseUrl: opts.baseUrl, storeUrl: opts.baseUrl },
    provider,
    ...(payment ? { payment: { gateway: payment, handlerName: "dev.agentify.razorpay.test" } } : {}),
  });
  const server = serve({ fetch: gateway.app.fetch, port: opts.port }, (info) => {
    console.log(`[agentify] listening on http://localhost:${info.port}`);
    console.log(`[agentify] mcp      ${opts.baseUrl}/mcp`);
    console.log(`[agentify] ucp      ${opts.baseUrl}/.well-known/ucp`);
    console.log(`[agentify] agents.md ${opts.baseUrl}/agents.md`);
    console.log(`[agentify] llms.txt ${opts.baseUrl}/llms.txt`);
    if (payment) console.log(`[agentify] payment  razorpay webhook ${opts.baseUrl}/webhooks/razorpay`);
  });
  await new Promise<void>((resolvePromise) => {
    process.on("SIGINT", () => {
      void gateway.mcp.close();
      server.close(() => resolvePromise());
    });
  });
}

function parse(argv: string[]): { command: string | undefined; values: Record<string, unknown> } {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      config: { type: "string" },
      out: { type: "string" },
      "base-url": { type: "string" },
      port: { type: "string" },
      mock: { type: "boolean", default: false },
      payment: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  return { command, values };
}

async function main(): Promise<void> {
  const { command, values } = parse(process.argv.slice(2));
  if (values.help || !command) {
    printHelp();
    return;
  }
  const common: CommonOptions = {
    config: values.config as string | undefined,
    mock: values.mock as boolean,
  };
  const baseUrl = (values["base-url"] as string | undefined) ?? "http://localhost:8787";

  switch (command) {
    case "generate": {
      const out = (values.out as string | undefined) ?? "agentify-static";
      const files = await runGenerate({ ...common, out, baseUrl });
      for (const f of files) console.log(`wrote ${f}`);
      console.log("\nDeploy these files to any static host/CDN or the edge.");
      break;
    }
    case "serve": {
      const port = Number(values.port ?? 8787);
      await runServe({ ...common, port, baseUrl, payment: values.payment as string | undefined });
      break;
    }
    case "init": {
      await runInit();
      break;
    }
    default:
      printHelp();
      process.exitCode = 1;
  }
}

async function runInit(): Promise<void> {
  console.log("agentify init — scaffolding a merchant config from a template.");
  console.log("Copy packages/adapter-rest/examples/second-store.config.json and edit:\n");
  console.log("  id         a stable merchant id");
  console.log("  http.baseUrl   your store's API base URL");
  console.log("  catalog.*      your search/product/variant/offer endpoint paths");
  console.log("  mappings.*     JSON-path field mappings for your product JSON\n");
  console.log("Validate it anytime with the JSON Schema at:");
  console.log("  packages/adapter-rest/schemas/merchant-config.schema.json");
  console.log("\nThen run:  agentify serve --config merchant.config.json");
  void ((): unknown => null);
}

function printHelp(): void {
  console.log(`agentify — Agentic Commerce Gateway CLI

USAGE
  agentify init
  agentify generate --config merchant.config.json [--mock] [--out dir] [--base-url url]
  agentify serve   --config merchant.config.json [--mock] [--port 8787] [--base-url url] [--payment razorpay]

OPTIONS
  --config <file>    path to a merchant REST adapter config (JSON)
  --mock             use the built-in demo merchant instead of --config
  --out <dir>        output directory for generated static files (default agentify-static)
  --base-url <url>   public origin used in llms.txt/agents.md/ucp (default http://localhost:8787)
  --port <n>         serve port (default 8787)
  --payment <name>   enable payment (razorpay) using RAZORPAY_KEY_ID/KEY_SECRET env
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
