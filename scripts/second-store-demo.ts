/**
 * Second-merchant demo (MVP 3): connect Luna & Co — a REST merchant whose JSON
 * shape is completely different from the mock store — using ONLY configuration.
 *
 * Proof of the architecture moat: the gateway's UCP/MCP code is untouched; a
 * new merchant is just a new RestCommerceProvider config. Run with:
 *   pnpm demo:second
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "@hono/node-server";
import { createGateway, type Gateway } from "@agentify/gateway";
import {
  RestCommerceProvider,
  buildSecondStoreConfig,
  createFixtureStoreServer,
  FIXTURE_TOKEN,
} from "@agentify/adapter-rest";

async function main(): Promise<void> {
  console.log("◆ Booting the second merchant's REST backend (Shape B/C JSON)…");
  const store = await createFixtureStoreServer();
  const config = buildSecondStoreConfig({ baseUrl: store.baseUrl, token: FIXTURE_TOKEN });
  const provider = new RestCommerceProvider(config);
  console.log(`  merchant "${provider.id}" at ${store.baseUrl}`);

  const gateway = await createGateway({
    config: { port: 0, baseUrl: "https://second.example", storeUrl: "https://second.example" },
    provider,
  });
  const nodeServer = serve({ fetch: gateway.app.fetch, port: 0 }, (info) => {
    console.log(`[gateway] listening on http://127.0.0.1:${info.port}`);
  });
  await new Promise((r) => setTimeout(r, 50));
  const base = `http://127.0.0.1:${(nodeServer.address() as { port: number }).port}`;

  console.log("\n◆ UCP profile for the second merchant (capabilities derived from config):");
  const profile = (await (await fetch(`${base}/.well-known/ucp`)).json()) as {
    ucp: { capabilities: Record<string, unknown> };
  };
  console.log(`  ${Object.keys(profile.ucp.capabilities).join(", ")}`);

  console.log("\n◆ Agent searches the second merchant via MCP:");
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  const client = new Client({ name: "second-store-demo", version: "1.0.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log(`  tools: ${tools.tools.map((t) => t.name).join(", ")}`);

  const search = await client.callTool({
    name: "search_catalog",
    arguments: { query: "Moonstone", inStockOnly: true },
  });
  console.log(`  ${textOf(search)}`);

  const offer = await client.callTool({
    name: "get_offer",
    arguments: { variantId: "v-sl-pendant-silver" },
  });
  console.log(`  ${textOf(offer)}`);

  console.log("\n✓ Same gateway, second merchant — only the adapter config changed.");
  await client.close();
  await gateway.mcp.close();
  nodeServer.close();
  await store.close();
}

function textOf(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r.isError) throw new Error(`tool error: ${(r.content ?? [])[0]?.text ?? "unknown"}`);
  return (r.content ?? [])
    .map((c) => c.text ?? "")
    .join("\n")
    .split("\n")
    .slice(0, 6)
    .join("\n  ");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nDemo failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
