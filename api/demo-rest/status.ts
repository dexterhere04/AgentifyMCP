import { json, DEMO_MERCHANT_ID, type Handler } from "../_lib.js";

const handler: Handler = (_req, res) =>
  json(res, 200, {
    id: DEMO_MERCHANT_ID,
    installed: true,
    store: { running: false, port: 8799 },
    gateway: { running: false, lastError: "Hosted demo — the gateway runs on your own VM/backend." },
  });

export default handler;
