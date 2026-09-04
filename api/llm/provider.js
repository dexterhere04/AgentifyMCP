import { json, llmSettingsFromEnv } from "../_lib.js";

export default (req, res) => {
  const s = llmSettingsFromEnv();
  if (req.method === "GET") {
    return json(res, 200, {
      kind: s.kind,
      model: s.model,
      baseUrl: s.baseUrl,
      hasKey: Boolean(s.apiKey),
      keyHint: s.apiKey ? `…${s.apiKey.slice(-4)}` : undefined,
    });
  }
  json(res, 200, {
    ok: true,
    provider: {
      kind: s.kind,
      model: s.model,
      baseUrl: s.baseUrl,
      hasKey: Boolean(s.apiKey),
      keyHint: s.apiKey ? `…${s.apiKey.slice(-4)}` : undefined,
    },
    note: "Hosted demo — set LLM_PROVIDER / LLM_MODEL / LLM_API_KEY as Vercel env vars.",
  });
};
