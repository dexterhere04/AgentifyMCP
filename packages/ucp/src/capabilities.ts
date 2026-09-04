import type { Capabilities } from "@agentify/canonical-commerce";

/**
 * Map the gateway's canonical capability graph onto UCP capability ids.
 *
 * UCP capabilities are reverse-domain identifiers. The gateway only ever
 * advertises the subset a merchant actually implements (doc §6.1: "advertise
 * only capabilities the merchant actually supports").
 *
 * Canonical capability -> UCP capabilities:
 *   catalog   -> dev.ucp.shopping.catalog.search, dev.ucp.shopping.catalog.lookup
 *   cart      -> dev.ucp.shopping.cart
 *   checkout  -> dev.ucp.shopping.checkout
 *   orders    -> dev.ucp.shopping.order
 * inventory/pricing are catalog affordances (live availability + offers) and
 * are exposed through the catalog capability over MCP.
 */

export const UCP_CAPABILITY_CATALOG_SEARCH = "dev.ucp.shopping.catalog.search";
export const UCP_CAPABILITY_CATALOG_LOOKUP = "dev.ucp.shopping.catalog.lookup";
export const UCP_CAPABILITY_CART = "dev.ucp.shopping.cart";
export const UCP_CAPABILITY_CHECKOUT = "dev.ucp.shopping.checkout";
export const UCP_CAPABILITY_ORDER = "dev.ucp.shopping.order";

export function ucpCapabilityIdsFor(caps: Capabilities): string[] {
  const ids: string[] = [];
  if (caps.catalog) {
    ids.push(UCP_CAPABILITY_CATALOG_SEARCH, UCP_CAPABILITY_CATALOG_LOOKUP);
  }
  if (caps.cart) ids.push(UCP_CAPABILITY_CART);
  if (caps.checkout) ids.push(UCP_CAPABILITY_CHECKOUT);
  if (caps.orders) ids.push(UCP_CAPABILITY_ORDER);
  return ids;
}
