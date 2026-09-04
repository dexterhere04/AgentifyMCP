import { json, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID } from "../../../_lib.js";
import { RestCommerceProvider } from "@agentify/adapter-rest";
import { detectCapabilities, enabledCapabilities } from "@agentify/canonical-commerce";

const CAP_TOOLS = {
  catalog: ["search_catalog", "get_product", "get_variant"],
  inventory: ["check_availability"],
  pricing: ["get_offer"],
  cart: ["create_cart", "get_cart", "add_to_cart", "update_cart_item", "remove_from_cart"],
  checkout: ["create_checkout", "get_checkout", "complete_checkout", "cancel_checkout"],
  orders: ["get_order"],
};

export default (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  const cfg = demoConfig();
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  const caps = detectCapabilities(new RestCommerceProvider(cfg));
  const enabled = enabledCapabilities(caps);
  const tools = enabled.flatMap((k) => CAP_TOOLS[k] ?? []).concat("get_audit_trail");
  json(res, 200, { capabilities: enabled, tools });
};
