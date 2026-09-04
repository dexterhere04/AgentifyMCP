import { json, seededPresets, type Handler } from "../_lib.js";

const handler: Handler = (req, res) => {
  if (req.method === "GET") return json(res, 200, seededPresets());
  // Read-only demo: keep the UI working, but nothing is persisted.
  return json(res, 200, { ok: true, note: "Hosted demo — presets are read-only; manage them on your own VM/backend." });
};

export default handler;
