import { notHosted, type Handler } from "./_lib.js";

const handler: Handler = (_req, res) => notHosted(res, "creating new merchants");

export default handler;
