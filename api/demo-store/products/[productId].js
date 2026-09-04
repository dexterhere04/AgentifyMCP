import { json } from "../../_lib.js";
import { productById } from "../../../testing/basic-store/catalog.js";

export default (req, res) => {
  const id = (req.url ?? "").split("/")[4] ?? "";
  const product = productById(id);
  if (!product) return json(res, 404, { error: "product_not_found" });
  json(res, 200, product);
};
