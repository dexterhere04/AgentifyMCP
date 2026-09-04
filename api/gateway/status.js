import { json } from "../_lib.js";
export default (_req, res) => json(res, 200, { running: false, lastError: "Hosted demo — the gateway runs on your own VM/backend." });
