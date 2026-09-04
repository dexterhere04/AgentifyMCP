import type { CommerceProvider } from "./provider.js";

/**
 * Capability detection.
 *
 * The gateway derives the merchant's advertised capabilities from the methods
 * a CommerceProvider actually implements. UCP discovery and the MCP tool
 * registry are both generated from this graph so that protocol surfaces never
 * advertise capabilities a merchant does not support (doc sections 6.1/6.2).
 */

export const CAPABILITY_NAMES = [
  "catalog",
  "inventory",
  "pricing",
  "cart",
  "checkout",
  "orders",
] as const;

export type CapabilityName = (typeof CAPABILITY_NAMES)[number];

export interface Capabilities {
  catalog: boolean;
  inventory: boolean;
  pricing: boolean;
  cart: boolean;
  checkout: boolean;
  orders: boolean;
}

export function detectCapabilities(provider: CommerceProvider): Capabilities {
  return {
    catalog: true, // required by the contract
    inventory: typeof provider.inventory?.check === "function",
    pricing: typeof provider.pricing?.getOffer === "function",
    cart: typeof provider.cart?.create === "function",
    checkout: typeof provider.checkout?.create === "function",
    orders: typeof provider.orders?.get === "function",
  };
}

export function enabledCapabilities(caps: Capabilities): CapabilityName[] {
  return CAPABILITY_NAMES.filter((name) => caps[name]);
}

/** Human summary of the capability graph for agents.md / dashboards. */
export function capabilitySummary(caps: Capabilities): string[] {
  const enabled: string[] = [];
  if (caps.catalog) enabled.push("catalog (search + lookup)");
  if (caps.inventory) enabled.push("inventory (live availability)");
  if (caps.pricing) enabled.push("pricing (live offers + discounts)");
  if (caps.cart) enabled.push("cart");
  if (caps.checkout) enabled.push("checkout");
  if (caps.orders) enabled.push("orders");
  return enabled;
}
