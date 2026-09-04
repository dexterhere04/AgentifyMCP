import { json, type Handler } from "../_lib.js";

const handler: Handler = (_req, res) =>
  json(res, 200, { running: false, lastError: "Hosted demo — the gateway runs on your own VM/backend." });

export default handler;
