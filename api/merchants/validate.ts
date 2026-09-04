import { json, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID, type Handler } from "../_lib.js";
import { validateRestConfig } from "@agentify/adapter-rest";

const handler: Handler = (req, res) => {
  void origin(req);
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  const cfg = demoConfig() as { http: { baseUrl: string } };
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  return json(res, 200, { ok: validateRestConfig(cfg as never).length === 0, errors: validateRestConfig(cfg as never) });
};

export default handler;
