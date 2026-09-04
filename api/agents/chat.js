import { json, demoConfig, DEMO_MERCHANT_ID, DEMO_STORE_PATH, origin, llmSettingsFromEnv } from "../_lib.js";
import { runAgentChat } from "../../apps/dashboard/src/api/agent-runtime.js";

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

export default async (req, res) => {
  const body = await readBody(req);
  if (body.merchantId !== DEMO_MERCHANT_ID || !Array.isArray(body.messages)) {
    return json(res, 400, { error: "merchantId and messages are required" });
  }
  const cfg = demoConfig();
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  const result = await runAgentChat({ merchant: cfg, agent: body.config, settings: llmSettingsFromEnv(), messages: body.messages });
  json(res, 200, result);
};
