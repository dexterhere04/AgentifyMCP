import { json, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID } from "../_lib.js";
import { validateRestConfig } from "@agentify/adapter-rest";

export default (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  const cfg = demoConfig();
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  const errors = validateRestConfig(cfg);
  json(res, 200, { ok: errors.length === 0, errors });
};
