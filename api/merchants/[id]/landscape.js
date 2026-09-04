import { json, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID } from "../../_lib.js";
import { buildLandscape } from "../../../apps/dashboard/src/api/landscape.js";

export default async (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  try {
    const baseOrigin = origin(req);
    const cfg = demoConfig();
    cfg.http.baseUrl = `${baseOrigin}${DEMO_STORE_PATH}`;
    const landscape = await buildLandscape(cfg, baseOrigin);
    json(res, 200, { ...landscape, live: false, running: false });
  } catch (err) {
    json(res, 400, { error: "cannot build agent landscape", reason: err instanceof Error ? err.message : String(err) });
  }
};
