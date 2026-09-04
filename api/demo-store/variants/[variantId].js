import { json } from "../../_lib.js";
import { variantById } from "../../../testing/basic-store/catalog.js";

export default (req, res) => {
  const id = (req.url ?? "").split("/")[4] ?? "";
  const row = variantById(id);
  if (!row) return json(res, 404, { error: "variant_not_found" });
  json(res, 200, row);
};
