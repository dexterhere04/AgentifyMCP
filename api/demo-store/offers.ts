import { json, type Handler } from "../_lib.js";
import { variantById } from "../../testing/basic-store/catalog.js";

const handler: Handler = (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const variantId = url.searchParams.get("variant_id") ?? "";
  const row = variantById(variantId);
  if (!row) return json(res, 404, { error: "variant_not_found" });
  return json(res, 200, row);
};

export default handler;
