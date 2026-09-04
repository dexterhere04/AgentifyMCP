/**
 * Headless demo agent (MVP 0 + MVP 1).
 *
 * Boots the gateway in-process, then — using the *official* MCP client SDK —
 * independently discovers and shops the merchant the way an AI agent would:
 *
 *   1. discover endpoints (GET /)
 *   2. MCP initialize
 *   3. tools/list  (agent picks tools from the advertised surface)
 *   4. search_catalog  "elegant necklace below Rs 5,000, in stock"
 *   5. get_product → pick a real variant
 *   6. check_availability (live)
 *   7. get_offer (live discounted price)
 *   8. recommend, respecting the buyer's budget
 *
 * There is no hardcoded merchant API knowledge anywhere in this file: the
 * agent learns everything from discovery + MCP. Run with `pnpm demo`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { serve } from "@hono/node-server";
import { createGateway, type Gateway } from "@gateway/app-gateway";

const BUDGET_MINOR = 500000; // Rs 5,000 in paise

function inr(amount: number): string {
  return `₹${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function step(title: string): void {
  console.log("\n" + "─".repeat(72));
  console.log(`◆ ${title}`);
  console.log("─".repeat(72));
}

async function main(): Promise<void> {
  // --- 0. Boot the gateway ------------------------------------------------
  const explicitUrl = process.env.GATEWAY_URL;
  let baseUrl = explicitUrl ?? "http://127.0.0.1:0";
  let gateway: Gateway | undefined;
  let nodeServer: ReturnType<typeof serve> | undefined;

  if (!explicitUrl) {
    gateway = await createGateway({
      config: { port: 0, baseUrl: "https://demo.example", storeUrl: "https://demo.example" },
    });
    nodeServer = serve({ fetch: gateway.app.fetch, port: 0 }, (info) => {
      baseUrl = `http://127.0.0.1:${info.port}`;
      console.log(`[gateway] listening on ${baseUrl}`);
      console.log(`[gateway] MCP: ${baseUrl}/mcp`);
    });
    // wait until nodeServer port is assigned
    await new Promise((r) => setTimeout(r, 50));
  }

  const mcpUrl = `${baseUrl.replace(/\/+$/, "")}/mcp`;

  step("1 · Discover agent endpoints (GET /)");
  const index = await fetch(`${baseUrl.replace(/\/+$/, "")}/`);
  const endpoints = (await index.json()) as { endpoints: Record<string, string>; capabilities: string[] };
  console.log(JSON.stringify(endpoints, null, 2));

  step("2 · MCP initialize + 3 · tools/list");
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  const client = new Client({ name: "headless-demo-agent", version: "0.1.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name);
  console.log(`server negotiated, available tools: ${toolNames.join(", ")}`);

  step("4 · search_catalog — elegant necklace under Rs 5,000, in stock, anniversary");
  const searchRes = await client.callTool({
    name: "search_catalog",
    arguments: {
      query: "necklace",
      occasion: "anniversary",
      inStockOnly: true,
      maxPriceMinor: BUDGET_MINOR,
      sort: "price_asc",
    },
  });
  const searchText = textOf(searchRes);
  console.log(searchText);
  const search = structuredOf<{
    items: Array<{ id: string; title: string; priceFrom: { amount: number; currency: string }; inStock: boolean }>;
    total: number;
  }>(searchRes);
  if (search.total === 0) {
    throw new Error("no products found — demo catalog regression?");
  }

  const candidate = search.items[0]!;
  console.log(`\nAgent selects first within budget: "${candidate.title}" (productId=${candidate.id})`);

  step("5 · get_product — inspect variants");
  const productRes = await client.callTool({
    name: "get_product",
    arguments: { productId: candidate.id },
  });
  const product = structuredOf<{
    id: string;
    title: string;
    variants: Array<{ id: string; sku?: string; title?: string; availability: { status: string; quantity?: number } }>;
  }>(productRes);
  const variant = product.variants.find((v) => v.availability.status !== "out_of_stock") ?? product.variants[0]!;
  console.log(textOf(productRes).split("\n").slice(0, 4).join("\n"));
  console.log(`\nAgent picks variant ${variant.id}${variant.sku ? ` (sku ${variant.sku})` : ""}`);

  step("6 · check_availability (live)");
  const availRes = await client.callTool({
    name: "check_availability",
    arguments: { variantId: variant.id },
  });
  const availability = structuredOf<{ status: string; quantity?: number }>(availRes);
  console.log(textOf(availRes));
  if (availability.status === "out_of_stock" || availability.status === "unknown") {
    throw new Error("variant unexpectedly unavailable");
  }

  step("7 · get_offer (live discounted price)");
  const offerRes = await client.callTool({
    name: "get_offer",
    arguments: { variantId: variant.id, currency: "INR" },
  });
  const offer = structuredOf<{
    productId: string;
    variantId: string;
    productTitle?: string;
    sku?: string;
    price: { amount: number; currency: string };
    listPrice: { amount: number; currency: string };
    originalPrice?: { amount: number };
    savings?: { amount: number };
    discounts: Array<{ id: string; title?: string }>;
    availability: { status: string };
  }>(offerRes);
  console.log(textOf(offerRes));

  step("8 · Final recommendation (respecting the Rs 5,000 budget)");
  if (offer.price.amount > BUDGET_MINOR) {
    throw new Error("agent violated the buyer budget");
  }
  const discountNote =
    offer.discounts.length > 0
      ? ` (incl. ${offer.discounts.map((d) => d.title ?? d.id).join(", ")})`
      : offer.originalPrice
        ? " (on sale)"
        : "";
  const title = offer.productTitle ?? product.title;
  console.log(`✓ ${title}`);
  console.log(`  Variant : ${offer.variantId}${offer.sku ? ` · sku ${offer.sku}` : ""}`);
  console.log(`  Price   : ${inr(offer.price.amount)}${discountNote}`);
  if (offer.originalPrice) console.log(`  Was     : ${inr(offer.originalPrice.amount)}`);
  if (offer.savings) console.log(`  You save: ${inr(offer.savings.amount)}`);
  console.log(`  Stock   : ${offer.availability.status}${availability.quantity !== undefined ? ` (${availability.quantity} available)` : ""}`);
  console.log(`  Budget  : ${inr(BUDGET_MINOR)} — within budget ✓`);
  console.log("\nRecommendation (in-stock, live-verified):");
  console.log(`  "A ${title} at ${inr(offer.price.amount)} is within your ₹5,000 budget. Shall I add it to your cart?"`);

  await client.close();
  if (gateway) await gateway.mcp.close();
  if (nodeServer) nodeServer.close();
}

function textOf(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  if (r.isError) throw new Error(`tool error: ${(r.content ?? [])[0]?.text ?? "unknown"}`);
  return (r.content ?? []).map((c) => c.text ?? "").join("\n");
}

function structuredOf<T>(result: unknown): T {
  const r = result as { structuredContent?: unknown };
  if (r.structuredContent === undefined) throw new Error("tool returned no structuredContent");
  return r.structuredContent as T;
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\nDemo failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
