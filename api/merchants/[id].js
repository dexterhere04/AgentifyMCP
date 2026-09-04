import { json, notHosted, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID } from "../_lib.js";

export default (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  if (req.method === "GET") {
    const cfg = demoConfig();
    cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
    return json(res, 200, cfg);
  }
  return notHosted(res, "editing/saving merchant configuration");
};
