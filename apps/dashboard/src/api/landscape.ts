import {
  detectCapabilities,
  enabledCapabilities,
  type Capabilities,
  type CapabilityName,
} from "@agentify/canonical-commerce";
import { RestCommerceProvider, type RestAdapterConfig } from "@agentify/adapter-rest";
import { agentsMarkdown, llmsTxt, DEFAULT_SKILL_URL, type MetadataContext } from "@agentify/metadata";
import { buildUcpProfile } from "@agentify/ucp";

const CAP_DETAIL: Record<CapabilityName, { label: string; what: string }> = {
  catalog: {
    label: "Catalog search & browse",
    what: "Agents can search the catalogue and open individual products with their variants, images and descriptions.",
  },
  inventory: {
    label: "Live stock & availability",
    what: "Agents check real-time availability and quantity before they recommend or buy anything.",
  },
  pricing: {
    label: "Live pricing & discounts",
    what: "Agents read the current discounted offer price from a live lookup — never a stale list price.",
  },
  cart: {
    label: "Shopping cart",
    what: "Agents can create a cart and add, update or remove items on the buyer's behalf.",
  },
  checkout: {
    label: "Approval-gated checkout",
    what: "Agents can complete checkout, but every completion requires an explicit human approval first.",
  },
  orders: {
    label: "Order lookup",
    what: "After a purchase, agents can look up order status by id.",
  },
  recommendations: {
    label: "Upsell & cross-sell",
    what: "Agents can suggest a premium option or a pairing for the cart, always within the buyer's budget.",
  },
};

function plainLanguageNotes(caps: Capabilities, defaultCurrency: string): string[] {
  const notes: string[] = [];
  const buyable = caps.cart || caps.checkout;
  if (!buyable) {
    notes.push(
      "Your storefront is discovery-only for agents right now: they can browse, compare and verify prices and stock, but they cannot add to cart or place an order. Adding cart/checkout support turns your storefront into one agents can shop end to end.",
    );
  } else if (!caps.checkout) {
    notes.push(
      "Agents can assemble a cart for your store, but checkout is not yet available — the flow stops once the cart is ready for the buyer.",
    );
  } else {
    notes.push(
      "Agents can complete a full purchase journey — search, cart and checkout — but checkout always stops for an explicit human approval before any money moves.",
    );
  }
  if (caps.inventory) {
    notes.push("Stock levels are fetched live, so an agent will never recommend an item that just went out of stock.");
  }
  if (caps.pricing) {
    notes.push("Prices are verified live too: an agent quotes the current discounted offer, not the list price in the catalogue.");
  }
  notes.push(`All money is handled in ${defaultCurrency} and amounts are always shown with an explicit currency.`);
  return notes;
}

export interface MerchantLandscape {
  id: string;
  name: string;
  description?: string;
  url?: string;
  country?: string;
  defaultCurrency: string;
  baseUrl: string;
  live: boolean;
  running: boolean;
  endpoints: {
    ucp: string;
    mcp: string;
    agentsMd: string;
    llmsTxt: string;
    skillUrl: string;
  };
  capabilities: Array<{ key: string; label: string; what: string }>;
  notes: string[];
  agents: string;
  llms: string;
  ucpProfile: Record<string, unknown>;
}

export async function buildLandscape(config: RestAdapterConfig, baseUrl: string): Promise<MerchantLandscape> {
  const provider = new RestCommerceProvider(config);
  const merchant = await provider.merchant();
  const caps = detectCapabilities(provider);
  const enabled = enabledCapabilities(caps);
  const base = baseUrl.replace(/\/+$/, "");

  const ctx: MetadataContext = {
    merchant,
    capabilities: enabled,
    config: { baseUrl: base, skillUrl: DEFAULT_SKILL_URL },
  };

  const ucpProfile = buildUcpProfile({ capabilities: caps, baseUrl: base }) as unknown as Record<string, unknown>;

  return {
    id: merchant.id,
    name: merchant.name,
    description: merchant.description,
    url: merchant.url,
    country: merchant.country,
    defaultCurrency: merchant.defaultCurrency,
    baseUrl: base,
    live: false,
    running: false,
    endpoints: {
      ucp: `${base}/.well-known/ucp`,
      mcp: `${base}/mcp`,
      agentsMd: `${base}/agents.md`,
      llmsTxt: `${base}/llms.txt`,
      skillUrl: DEFAULT_SKILL_URL,
    },
    capabilities: enabled.map((key) => ({ key, label: CAP_DETAIL[key].label, what: CAP_DETAIL[key].what })),
    notes: plainLanguageNotes(caps, merchant.defaultCurrency),
    agents: agentsMarkdown(ctx),
    llms: llmsTxt(ctx),
    ucpProfile,
  };
}
