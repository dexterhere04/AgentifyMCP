import { notHosted } from "../_lib.js";
export default (_req, res) => notHosted(res, "creating new merchants");
