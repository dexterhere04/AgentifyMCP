import { notHosted, type Handler } from "./_lib.js";

const handler: Handler = (_req, res) => notHosted(res, "starting the gateway");

export default handler;
