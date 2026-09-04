import { notHosted, type Handler } from "./_lib.js";

const handler: Handler = (_req, res) => notHosted(res, "booting the demo store + gateway");

export default handler;
