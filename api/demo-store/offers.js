import { json } from "../_lib.js";
import { variantById } from "../../testing/basic-store/catalog.js";

export default (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const row = variantById(url.searchParams.get("variant_id") ?? "");
  if (!row) return json(res, 404, { error: "variant_not_found" });
  json(res, 200, row);
};
