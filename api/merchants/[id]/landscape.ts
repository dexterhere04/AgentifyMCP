import { json, origin, demoConfig, DEMO_STORE_PATH, DEMO_MERCHANT_ID, type Handler } from "../../_lib.js";
import { buildLandscape } from "../../../apps/dashboard/src/api/landscape.js";

const handler: Handler = async (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  try {
    const baseOrigin = origin(req);
    const cfg = demoConfig() as { http: { baseUrl: string } };
    cfg.http.baseUrl = `${baseOrigin}${DEMO_STORE_PATH}`;
    const landscape = await buildLandscape(cfg as never, baseOrigin);
    return json(res, 200, { ...landscape, live: false, running: false });
  } catch (err) {
    return json(res, 400, { error: "cannot build agent landscape", reason: err instanceof Error ? err.message : String(err) });
  }
};

export default handler;
