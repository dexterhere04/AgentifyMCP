import { json, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID } from "../../../_lib.js";
import { RestCommerceProvider } from "@agentify/adapter-rest";
import { detectCapabilities, enabledCapabilities } from "@agentify/canonical-commerce";
import { defaultAgentConfig } from "../../../../apps/dashboard/src/api/store.js";

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
  const baseOrigin = origin(req);
  const cfg = demoConfig();
  cfg.http.baseUrl = `${baseOrigin}${DEMO_STORE_PATH}`;
  const caps = detectCapabilities(new RestCommerceProvider(cfg));
  const tools = enabledCapabilities(caps).flatMap((k) => CAP_TOOLS[k] ?? []).concat("get_audit_trail");
  const agent = defaultAgentConfig();
  json(res, 200, {
    merchantId: DEMO_MERCHANT_ID,
    agent,
    baseUrl: baseOrigin,
    endpoints: {
      mcp: `${baseOrigin}/mcp`,
      ucp: `${baseOrigin}/.well-known/ucp`,
      agentsMd: `${baseOrigin}/agents.md`,
      llmsTxt: `${baseOrigin}/llms.txt`,
    },
    tools,
    instructions: [
      `# ${agent.agentName} — instructions for ${cfg.merchant.name}`,
      `Persona: ${agent.persona}`,
      agent.instructions,
      "Verify availability + live offer before recommending anything.",
      "Hosted demo: transact against a gateway you run on your own VM.",
    ].join("\n"),
    mcpServersJson: JSON.stringify({ mcpServers: { [DEMO_MERCHANT_ID]: { url: `${baseOrigin}/mcp` } } }, null, 2),
    checkoutSnippet: "// Hosted demo: checkout runs against a gateway on your VM.\n// See the mcpServers/kit docs to wire it.",
  });
};
