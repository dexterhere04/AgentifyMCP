import {
  capabilitySummary,
  detectCapabilities,
  type CapabilityName,
  type CommerceProvider,
  type Merchant,
} from "@gateway/canonical-commerce";

/**
 * Merchant-facing metadata generators.
 *
 * - agents.md: merchant-specific behavioral instructions for AI agents (doc 6.3)
 * - llms.txt:   human/LLM-readable orientation and navigation (doc 6.4, llms.txt v2)
 *
 * Both are generated from the provider's capability graph so they never
 * advertise actions the merchant does not support.
 */

export interface MetadataEndpointConfig {
  /** Public origin of the gateway, e.g. https://demo.example (no trailing slash). */
  baseUrl: string;
  /** Path to the MCP endpoint. */
  mcpPath?: string;
  /** Currencies/countries restrictions when known. */
  supportedCountries?: string[];
  /** Optional rate limit note. */
  rateLimitNote?: string;
}

export interface GeneratedMetadata {
  agentsMarkdown(): string;
  llmsTxt(): string;
}

export interface MetadataContext {
  merchant: Merchant;
  capabilities: CapabilityName[];
  config: MetadataEndpointConfig;
}

async function buildContext(provider: CommerceProvider, config: MetadataEndpointConfig): Promise<MetadataContext> {
  const merchant = await provider.merchant();
  const caps = detectCapabilities(provider);
  const capabilities = Object.entries(caps)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name as CapabilityName);
  return { merchant, capabilities, config };
}

function url(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export function agentsMarkdown(ctx: MetadataContext): string {
  const { merchant, capabilities, config } = ctx;
  const base = config.baseUrl.replace(/\/+$/, "");
  const mcpUrl = url(base, config.mcpPath ?? "/mcp");
  const c = capabilities;
  const supports = capabilitySummary({ catalog: true, inventory: true, pricing: true, cart: c.includes("cart"), checkout: c.includes("checkout"), orders: c.includes("orders") });

  const lines: string[] = [];
  lines.push(`# ${merchant.name} — Agent Instructions`);
  lines.push("");
  lines.push(`> ${merchant.description ?? "Agent-accessible commerce merchant."}`);
  lines.push("");
  lines.push("## Merchant identity");
  lines.push("");
  lines.push(`- Store: **${merchant.name}**${merchant.url ? ` (${merchant.url})` : ""}`);
  lines.push(`- Merchant id: \`${merchant.id}\``);
  if (merchant.supportEmail) lines.push(`- Support: ${merchant.supportEmail}`);
  lines.push(`- Default currency: \`${merchant.defaultCurrency}\``);
  lines.push(`- Supported currencies: ${merchant.supportedCurrencies.join(", ")}`);
  if (merchant.country || config.supportedCountries?.length) {
    lines.push(`- Operating country: ${merchant.country ?? config.supportedCountries!.join(", ")}`);
  }
  lines.push("");
  lines.push("## Discovery endpoints");
  lines.push("");
  lines.push(`- MCP endpoint: \`${mcpUrl}\` (Streamable HTTP, JSON-RPC 2.0)`);
  lines.push(`- \`agents.md\`: ${url(base, "/agents.md")}`);
  lines.push(`- \`llms.txt\`: ${url(base, "/llms.txt")}`);
  lines.push("");
  lines.push("## Supported actions");
  lines.push("");
  lines.push("This merchant currently supports the following actions. Do not attempt actions outside this list.");
  for (const item of supports) lines.push(`- ${item}`);
  if (!capabilities.includes("checkout")) {
    lines.push("");
    lines.push("> This merchant is catalog-queryable only. **No cart, checkout, or payment is possible.**");
    lines.push("> Never ask the buyer for payment information.");
  }
  lines.push("");
  lines.push("## Money and pricing rules");
  lines.push("");
  lines.push("- All amounts are in **minor currency units** with an explicit ISO currency.");
  lines.push("- Always state effective offer prices from \`get_offer\` — never rely on indexed or list prices for a recommendation.");
  lines.push("- \`check_availability\` before proposing or transacting an item.");
  lines.push("");
  if (config.rateLimitNote) {
    lines.push("## Rate limits");
    lines.push("");
    lines.push(`- ${config.rateLimitNote}`);
    lines.push("");
  }
  lines.push("## Preferred agent behavior");
  lines.push("");
  lines.push("- Respect the buyer's stated budget; never propose an item whose effective price exceeds it.");
  lines.push("- Explain price, discounts, and stock status transparently.");
  lines.push("- Prefer results that are in stock when the buyer needs the item soon.");
  lines.push("- If a live availability or offer check fails, tell the buyer rather than guessing.");
  lines.push("");
  lines.push("## Policies");
  lines.push("");
  lines.push(`- Shipping: ${merchant.policies?.shipping ?? "not published"}`);
  lines.push(`- Returns: ${merchant.policies?.returns ?? "not published"}`);
  lines.push(`- Refunds: ${merchant.policies?.refunds ?? "not published"}`);
  lines.push(`- Privacy: ${merchant.policies?.privacy ?? "not published"}`);
  lines.push(`- Terms: ${merchant.policies?.terms ?? "not published"}`);
  lines.push("");
  lines.push("## Failure handling expectations");
  lines.push("");
  lines.push("- If a product id is not found, do not retry with fabricated ids.");
  lines.push("- If the backend is slow or errors, wait and retry a bounded number of times, then report failure.");
  return lines.join("\n");
}

export function llmsTxt(ctx: MetadataContext): string {
  const { merchant, config } = ctx;
  const base = config.baseUrl.replace(/\/+$/, "");
  const mcpUrl = url(base, config.mcpPath ?? "/mcp");

  const out: string[] = [];
  out.push(`# ${merchant.name}`);
  out.push("");
  out.push(`> ${merchant.description ?? `AI-accessible catalog for ${merchant.name}.`} Browse this file to find the agent interfaces, then follow links only when you need detail.`);
  out.push("");
  out.push(`${merchant.name} sells jewellery in ${merchant.defaultCurrency}. AI agents should read the linked \`agents.md\` for behavioral rules and use the MCP endpoint for structured catalog queries. The full catalog is not embedded here.`);
  out.push("");
  out.push("## Agent interfaces");
  out.push("");
  out.push(`- [agents.md](${url(base, "/agents.md")}): Behavioural instructions for AI agents shopping this store`);
  out.push(`- [MCP endpoint](${mcpUrl}): Post JSON-RPC 2.0 (Streamable HTTP). initialize → tools/list → tools/call. Tools: search_catalog, get_product, get_variant, check_availability, get_offer`);
  out.push(`- [Store home](${merchant.url ?? base}): Human-facing storefront`);
  out.push("");
  out.push("## Policies and support");
  out.push("");
  out.push(`- [Shipping policy](${merchant.policies?.shipping ?? `${base}/policies/shipping`})`);
  out.push(`- [Returns policy](${merchant.policies?.returns ?? `${base}/policies/returns`})`);
  out.push(`- [Refund policy](${merchant.policies?.refunds ?? `${base}/policies/refunds`})`);
  out.push(`- [Privacy policy](${merchant.policies?.privacy ?? `${base}/policies/privacy`})`);
  out.push(`- [Terms of service](${merchant.policies?.terms ?? `${base}/terms`})`);
  out.push("");
  out.push("## Optional");
  out.push("");
  if (merchant.supportEmail) out.push(`- [Contact support](mailto:${merchant.supportEmail})`);
  out.push(`- [Merchant home](${merchant.url ?? base})`);
  return out.join("\n");
}

export async function createMetadata(
  provider: CommerceProvider,
  config: MetadataEndpointConfig,
): Promise<GeneratedMetadata> {
  const ctx = await buildContext(provider, config);
  return {
    agentsMarkdown: () => agentsMarkdown(ctx),
    llmsTxt: () => llmsTxt(ctx),
  };
}
