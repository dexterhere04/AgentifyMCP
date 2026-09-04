import { json, notHosted, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID, type Handler } from "../_lib.js";

const handler: Handler = (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) {
    return json(res, 404, { error: "not_found" });
  }
  if (req.method === "GET") {
    const cfg = demoConfig() as { http: { baseUrl: string } };
    cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
    return json(res, 200, cfg);
  }
  return notHosted(res, "editing/saving merchant configuration");
};

export default handler;
