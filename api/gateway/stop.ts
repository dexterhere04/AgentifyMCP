import { json, type Handler } from "./_lib.js";

const handler: Handler = (_req, res) => json(res, 200, { running: false });

export default handler;
