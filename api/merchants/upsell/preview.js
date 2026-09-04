import { json } from "../../_lib.js";
import { createMockCommerceProvider } from "@agentify/adapter-mock";

export default async (_req, res) => {
  try {
    const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    const cart = await provider.cart.create();
    await provider.cart.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
    const items = await provider.recommendations.get({ cartId: cart.id });
    provider.close();
    json(res, 200, { items });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
};
