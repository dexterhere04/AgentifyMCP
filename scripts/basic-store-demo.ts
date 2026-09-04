import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "@hono/node-server";
import { createGateway, type Gateway } from "@agentify/gateway";
import { RestCommerceProvider, type RestAdapterConfig } from "@agentify/adapter-rest";
import { createBasicStoreServer } from "../testing/basic-store/server.js";

async function main(): Promise<void> {
  const store = await createBasicStoreServer(0);
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "testing", "basic-store", "merchant.config.json"), "utf8"),
  ) as RestAdapterConfig;
  config.http.baseUrl = store.baseUrl;
  const provider = new RestCommerceProvider(config);

  console.log(`◆ Basic store backend: ${store.baseUrl}`);
  console.log(`  merchant "${provider.id}" — ${config.merchant.name}`);

  const gateway: Gateway = await createGateway({
    config: { port: 0, baseUrl: "https://common-goods.example", storeUrl: "https://common-goods.example" },
    provider,
  });
  const nodeServer = serve({ fetch: gateway.app.fetch, port: 0 }, (info) => {
    console.log(`[gateway] listening on http://127.0.0.1:${info.port}`);
  });
  await new Promise((r) => setTimeout(r, 50));
  const base = `http://127.0.0.1:${(nodeServer.address() as { port: number }).port}`;

  const profile = (await (await fetch(`${base}/.well-known/ucp`)).json()) as {
    ucp: { capabilities: Record<string, unknown> };
  };
  console.log(`\n◆ UCP capabilities: ${Object.keys(profile.ucp.capabilities).join(", ")}`);

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  const client = new Client({ name: "basic-store-demo", version: "1.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`  tools: ${tools.tools.map((t) => t.name).join(", ")}`);

  const search = await client.callTool({ name: "search_catalog", arguments: { query: "backpack", inStockOnly: true } });
  console.log(`  search: ${textOf(search)}`);

  const offer = await client.callTool({ name: "get_offer", arguments: { variantId: "v-harbor-backpack-navy" } });
  console.log(`  offer : ${textOf(offer)}`);

  console.log("\n✓ Testing-store merchant served through the unchanged gateway.");
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
