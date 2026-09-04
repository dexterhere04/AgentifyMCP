import { PRODUCTS, productById, variantById } from "../testing/basic-store/catalog.js";
import merchantConfig from "../testing/basic-store/merchant.config.json";
import { defaultAgentConfig } from "../apps/dashboard/src/api/store.js";

export const DEMO_MERCHANT_ID = "common-goods-rest";
export const DEMO_STORE_PATH = "/api/demo-store";

export function origin(req) {
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function notHosted(res, action) {
  json(res, 409, { error: `Hosted demo — "${action}" runs on your own VM/backend, not on Vercel.` });
}

export function demoConfig() {
  return JSON.parse(JSON.stringify(merchantConfig));
}

export { productById, variantById };

export function seededPresets() {
  const config = defaultAgentConfig();
  config.agentName = "Common Goods Concierge";
  config.persona = "A warm, precise concierge for Common Goods Co. — home, desk and outdoor everyday goods.";
  config.greeting = "Hi — looking for something particular today?";
  config.instructions =
    "Help the buyer find items across the catalog, check live stock and the discounted offer before recommending, and never finalize a purchase without their explicit approval.";
  const now = new Date().toISOString();
  return [{ slug: "common-goods-concierge", name: "Common Goods Concierge", merchantId: DEMO_MERCHANT_ID, config, createdAt: now, updatedAt: now }];
}

export function llmSettingsFromEnv() {
  const kind = process.env.LLM_PROVIDER ?? "simulate";
  return {
    kind,
    model: process.env.LLM_MODEL || undefined,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    apiKey: process.env.LLM_API_KEY || undefined,
  };
}
