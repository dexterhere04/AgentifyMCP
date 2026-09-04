import { json } from "../_lib.js";
export default (_req, res) => json(res, 200, { running: false });
