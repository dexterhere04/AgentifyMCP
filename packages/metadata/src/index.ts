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
  /** Path to the UCP discovery endpoint. */
  ucpPath?: string;
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

function mcpToolNames(capabilities: CapabilityName[]): string {
  const has = (name: CapabilityName) => capabilities.includes(name);
  const tools: string[] = [];
  tools.push("search_catalog", "get_product", "get_variant");
  if (has("inventory")) tools.push("check_availability");
  if (has("pricing")) tools.push("get_offer");
  if (has("cart")) {
    tools.push("create_cart", "get_cart", "add_to_cart", "update_cart_item", "remove_from_cart");
  }
  if (has("checkout")) {
    tools.push("create_checkout", "get_checkout", "complete_checkout", "cancel_checkout");
  }
  return tools.join(", ");
}

export function agentsMarkdown(ctx: MetadataContext): string {
  const { merchant, capabilities, config } = ctx;
  const base = config.baseUrl.replace(/\/+$/, "");
  const mcpUrl = url(base, config.mcpPath ?? "/mcp");
  const ucpUrl = url(base, config.ucpPath ?? "/.well-known/ucp");
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
  lines.push(`- UCP discovery profile: \`${ucpUrl}\` (capabilities + transports)`);
  lines.push(`- \`agents.md\`: ${url(base, "/agents.md")}`);
  lines.push(`- \`llms.txt\`: ${url(base, "/llms.txt")}`);
  lines.push("");
  lines.push("## Supported actions");
  lines.push("");
  lines.push("This merchant currently supports the following actions. Do not attempt actions outside this list.");
  for (const item of supports) lines.push(`- ${item}`);
  const hasCart = capabilities.includes("cart");
  const hasCheckout = capabilities.includes("checkout");
  const hasOrders = capabilities.includes("orders");
  if (!hasCart && !hasCheckout) {
    lines.push("");
    lines.push("> This merchant is catalog-queryable only. **No cart or checkout is possible.**");
    lines.push("> Never ask the buyer for payment information.");
  } else if (hasCheckout) {
    lines.push("");
    lines.push("> Checkout is available but **simulated** in this environment: it creates an order without a live payment.");
    lines.push("> Completing a checkout **requires explicit, contemporaneous human approval** (`approval.buyerApproved = true`). Never complete a checkout without it.");
    if (!hasOrders) {
      lines.push("> Order history/lookup is not available yet; keep the order id returned by checkout completion.");
    }
    lines.push("> Transactional tools require `meta.ucp-agent.profile` (your agent's UCP profile URI).");
  } else {
    lines.push("");
    lines.push("> Cart is available, but **checkout is not yet supported**. Stop after cart preparation.");
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
  const { merchant, config, capabilities } = ctx;
  const base = config.baseUrl.replace(/\/+$/, "");
  const mcpUrl = url(base, config.mcpPath ?? "/mcp");
  const ucpUrl = url(base, config.ucpPath ?? "/.well-known/ucp");

  const toolList = mcpToolNames(capabilities);
  const out: string[] = [];
  out.push(`# ${merchant.name}`);
  out.push("");
  out.push(`> ${merchant.description ?? `AI-accessible catalog for ${merchant.name}.`} Browse this file to find the agent interfaces, then follow links only when you need detail.`);
  out.push("");
  out.push(`${merchant.name} sells jewellery in ${merchant.defaultCurrency}. AI agents should read the linked \`agents.md\` for behavioral rules and use the MCP endpoint for structured catalog queries. The full catalog is not embedded here.`);
  out.push("");
  out.push("## Agent interfaces");
  out.push("");
  out.push(`- [UCP discovery profile](${ucpUrl}): Machine-readable capability + transport discovery (Universal Commerce Protocol)`);
  out.push(`- [agents.md](${url(base, "/agents.md")}): Behavioural instructions for AI agents shopping this store`);
  out.push(`- [MCP endpoint](${mcpUrl}): Post JSON-RPC 2.0 (Streamable HTTP). initialize → tools/list → tools/call. Tools: ${toolList}. Transactional tools require meta.ucp-agent.profile.`);
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
