import { json, seededPresets } from "../_lib.js";

export default (req, res) => {
  if (req.method === "GET") return json(res, 200, seededPresets());
  json(res, 200, { ok: true, note: "Hosted demo — presets are read-only; manage them on your own VM/backend." });
};
