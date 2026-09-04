import { json, demoConfig, origin, DEMO_STORE_PATH, DEMO_MERCHANT_ID, type Handler } from "./_lib.js";

const handler: Handler = (req, res) => {
  const base = `${origin(req)}${DEMO_STORE_PATH}`;
  const cfg = demoConfig() as { merchant: { name: string; description?: string; defaultCurrency: string }; http: { baseUrl: string } };
  json(res, 200, [
    {
      id: DEMO_MERCHANT_ID,
      name: cfg.merchant.name,
      description: cfg.merchant.description,
      baseUrl: base,
      currency: cfg.merchant.defaultCurrency,
      updatedAt: new Date().toISOString(),
      state: "ready",
      tags: ["catalog", "offers", "stock"],
    },
  ]);
};

export default handler;
