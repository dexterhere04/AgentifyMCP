import { json, demoConfig, seededPresets, DEMO_STORE_PATH, origin, llmSettingsFromEnv, type Handler } from "../../_lib.js";
import { runAgentChat, type ChatMessage } from "../../../apps/dashboard/src/api/agent-runtime.js";

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
  const slug = (req.url ?? "").split("/")[3];
  const preset = seededPresets().find((p) => p.slug === slug);
  if (!preset) return json(res, 404, { error: "agent preset not found" });
  const body = (await readBody(req)) as { messages?: ChatMessage[] };
  if (!Array.isArray(body.messages)) return json(res, 400, { error: "messages are required" });
  const cfg = demoConfig() as { http: { baseUrl: string } };
  cfg.http.baseUrl = `${origin(req)}${DEMO_STORE_PATH}`;
  const result = await runAgentChat({
    merchant: cfg as never,
    agent: preset.config,
    settings: llmSettingsFromEnv(),
    messages: body.messages,
  });
  return json(res, 200, result);
};

export default handler;
