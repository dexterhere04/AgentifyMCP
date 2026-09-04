import { json, notHosted, DEMO_MERCHANT_ID, type Handler } from "../../_lib.js";
import { defaultAgentConfig } from "../../../apps/dashboard/src/api/store.js";

const handler: Handler = (req, res) => {
  const id = (req.url ?? "").split("/")[3];
  if (id !== DEMO_MERCHANT_ID) return json(res, 404, { error: "not_found" });
  if (req.method === "GET") return json(res, 200, defaultAgentConfig());
  return notHosted(res, "saving agent configuration");
};

export default handler;
