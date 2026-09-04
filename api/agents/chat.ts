import { json, demoConfig, seededPresets, DEMO_MERCHANT_ID, DEMO_STORE_PATH, origin, llmSettingsFromEnv, type Handler } from "../_lib.js";
import { runAgentChat } from "../../apps/dashboard/src/api/agent-runtime.js";
import type { AgentConfig, ChatMessage } from "../../apps/dashboard/src/api/store.js";

function readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const handler: Handler = async (req, res) => {
  const body = (await readBody(req)) as { merchantId?: string; config?: Partial<AgentConfig>; messages?: ChatMessage[] };
  if (body.merchantId !== DEMO_MERCHANT_ID || !Array.isArray(body.messages)) {
    return json(res, 400, { error: "merchantId and messages are required" });
  }
  const cfg = demoConfig() as { http: { baseUrl: string } };
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  const result = await runAgentChat({
    merchant: cfg as never,
    agent: body.config as AgentConfig,
    settings: llmSettingsFromEnv(),
    messages: body.messages,
  });
  return json(res, 200, result);
};

export default handler;
