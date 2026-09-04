import { notHosted } from "../_lib.js";
export default (_req, res) => notHosted(res, "starting the gateway");
