import { notHosted } from "../_lib.js";
export default (_req, res) => notHosted(res, "booting the demo store + gateway");
