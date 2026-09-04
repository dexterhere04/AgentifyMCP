import type { ServerResponse, IncomingMessage } from "node:http";
import { PRODUCTS, productById, variantById } from "../testing/basic-store/catalog.js";
import merchantConfig from "../testing/basic-store/merchant.config.json";
import { defaultAgentConfig } from "../apps/dashboard/src/api/store.js";
import type { AgentConfig } from "../apps/dashboard/src/api/store.js";

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export const DEMO_MERCHANT_ID = "common-goods-rest";
export const DEMO_STORE_PATH = "/api/demo-store";

export function origin(req: IncomingMessage): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  const host = (req.headers["x-forwarded-host"] as string) ?? (req.headers.host as string) ?? "localhost";
  return `${proto}://${host}`;
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function notHosted(res: ServerResponse, action: string): void {
  json(res, 409, { error: `Hosted demo — "${action}" runs on your own VM/backend, not on Vercel.` });
}

export function demoConfig(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(merchantConfig));
}

export function storeBase(): { products: typeof PRODUCTS } {
  return { products: PRODUCTS };
}

export { productById, variantById };

export function seededPresets(): Array<{ slug: string; name: string; merchantId: string; config: AgentConfig; createdAt: string; updatedAt: string }> {
  const config = defaultAgentConfig();
  config.agentName = "Common Goods Concierge";
  config.persona = "A warm, precise concierge for Common Goods Co. — home, desk and outdoor everyday goods.";
  config.greeting = "Hi — looking for something particular today?";
  config.instructions =
    "Help the buyer find items across the catalog, check live stock and the discounted offer before recommending, and never finalize a purchase without their explicit approval.";
  const now = new Date().toISOString();
  return [{ slug: "common-goods-concierge", name: "Common Goods Concierge", merchantId: DEMO_MERCHANT_ID, config, createdAt: now, updatedAt: now }];
}

export function llmSettingsFromEnv(): {
  kind: "simulate" | "openai" | "openrouter" | "groq" | "custom";
  model?: string;
  baseUrl?: string;
  apiKey?: string;
} {
  const kind = (process.env.LLM_PROVIDER ?? "simulate") as "simulate" | "openai" | "openrouter" | "groq" | "custom";
  return {
    kind,
    model: process.env.LLM_MODEL || undefined,
    baseUrl: process.env.LLM_BASE_URL || undefined,
    apiKey: process.env.LLM_API_KEY || undefined,
  };
}
