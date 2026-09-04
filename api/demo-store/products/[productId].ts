import { json, type Handler } from "../../_lib.js";
import { productById } from "../../../testing/basic-store/catalog.js";

const handler: Handler = (req, res) => {
  const id = (req.url ?? "").split("/")[4] ?? "";
  const product = productById(id);
  if (!product) return json(res, 404, { error: "product_not_found" });
  return json(res, 200, product);
};

export default handler;
