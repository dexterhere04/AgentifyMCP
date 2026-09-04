/* API origin. On Vercel the built UI lives on the CDN and talks to your
   always-on dashboard backend, so the origin is injected at build time via
   VITE_API_ORIGIN (or set at runtime in localStorage under agentify.apiOrigin).
   Left empty, the UI calls the same origin (/api) — the local dev default. */
function apiOrigin(): string {
  const runtime = typeof localStorage !== "undefined" ? (localStorage.getItem("agentify.apiOrigin") ?? "") : "";
  const envOrigin = (import.meta.env?.VITE_API_ORIGIN as string | undefined) ?? "";
  return (runtime.trim() || envOrigin.trim()).replace(/\/+$/, "");
}

const API_ORIGIN = apiOrigin();

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_ORIGIN}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

export const apiJson = {
  merchants: () => api<MerchantSummary[]>("/merchants"),
  merchant: (id: string) => api<unknown>(`/merchants/${id}`),
  save: (id: string, config: unknown) => api<{ ok: boolean; merchant: MerchantSummary }>(`/merchants/${id}`, { method: "PUT", body: JSON.stringify(config) }),
  remove: (id: string) => api<{ ok: boolean }>(`/merchants/${id}`, { method: "DELETE" }),
  validate: (config: unknown) => api<{ ok: boolean; errors: string[] }>("/merchants/validate", { method: "POST", body: JSON.stringify(config) }),
  blankTemplate: () => api<unknown>("/templates/blank"),
  testMerchant: (config: unknown, fixture: boolean) => api<TestResult>("/merchants/test", { method: "POST", body: JSON.stringify({ config, fixture }) }),
  sample: (url: string, bearer: string) => api<SampleResult>("/merchants/sample", { method: "POST", body: JSON.stringify({ url, bearer: bearer || undefined }) }),
  gatewayStatus: () => api<GatewayStatus>("/gateway/status"),
  gatewayLogs: () => api<string[]>("/gateway/logs"),
  gatewayStart: (req: StartReq) => api<GatewayStatus>("/gateway/start", { method: "POST", body: JSON.stringify(req) }),
  gatewayStop: () => api<GatewayStatus>("/gateway/stop", { method: "POST" }),
  readiness: () => api<Readiness>("/gateway/readiness"),
  audit: (params: string) => api<AuditRow[]>(`/audit?${params}`),
  demoRestStatus: () => api<DemoRestStatus>("/demo-rest/status"),
  demoRestBoot: () => api<DemoRestBootResult>("/demo-rest/boot", { method: "POST" }),
  demoRestStop: () => api<{ ok: boolean }>("/demo-rest/stop", { method: "POST" }),
  merchantLandscape: (id: string) => api<MerchantLandscape>(`/merchants/${id}/landscape`),
  agentConfig: (id: string) => api<AgentConfig>(`/merchants/${id}/agent`),
  saveAgentConfig: (id: string, cfg: AgentConfig) => api<{ ok: boolean; config: AgentConfig }>(`/merchants/${id}/agent`, { method: "PUT", body: JSON.stringify(cfg) }),
  agentTools: (id: string) => api<{ capabilities: string[]; tools: string[] }>(`/merchants/${id}/agent/tools`),
  agentKit: (id: string) => api<AgentKit>(`/merchants/${id}/agent/kit`),
  upsellPreview: (budgetMinor?: number) => api<{ items: RecommendationItem[] }>("/merchants/upsell/preview", { method: "POST", body: JSON.stringify({ budgetMinor }) }),
  llmProvider: () => api<PublicLlmSettings>("/llm/provider"),
  saveLlmProvider: (s: { kind: LlmProviderKind; model?: string; baseUrl?: string; apiKey?: string }) => api<{ ok: boolean; provider: PublicLlmSettings }>("/llm/provider", { method: "PUT", body: JSON.stringify(s) }),
  agentPresets: () => api<AgentPreset[]>("/agents/presets"),
  saveAgentPreset: (slug: string, preset: { name: string; merchantId: string; config: AgentConfig }) => api<{ ok: boolean; preset: AgentPreset; endpoint: string }>(`/agents/presets/${slug}`, { method: "PUT", body: JSON.stringify(preset) }),
  deleteAgentPreset: (slug: string) => api<{ ok: boolean }>(`/agents/presets/${slug}`, { method: "DELETE" }),
  agentChatTest: (merchantId: string, config: AgentConfig, messages: ChatMessage[]) => api<ChatResult>("/agents/chat", { method: "POST", body: JSON.stringify({ merchantId, config, messages }) }),
  agentPresetChat: (slug: string, messages: ChatMessage[]) => api<ChatResult>(`/agents/${slug}/chat`, { method: "POST", body: JSON.stringify({ messages }) }),
};

export interface AgentConfig {
  agentName: string;
  persona: string;
  instructions: string;
  greeting?: string;
  checkout: { mode: "link" | "in_app" };
  recommendations: { enabled: boolean; maxSuggestions: number; budgetGuard: boolean; overrides: Array<{ productId: string; suggestProductId: string; note?: string }> };
  capabilities: Record<string, boolean>;
}

export interface AgentKit {
  merchantId: string;
  agent: AgentConfig;
  baseUrl: string;
  endpoints: { mcp: string; ucp: string; agentsMd: string; llmsTxt: string };
  tools: string[];
  instructions: string;
  mcpServersJson: string;
  checkoutSnippet: string;
}

export interface RecommendationItem {
  productId: string;
  variantId: string;
  title: string;
  kind: "upsell" | "cross-sell";
  reason: string;
  price: { amount: number; currency: string };
  inStock: boolean;
}

export type LlmProviderKind = "simulate" | "openai" | "openrouter" | "groq" | "custom";

export interface PublicLlmSettings {
  kind: LlmProviderKind;
  model?: string;
  baseUrl?: string;
  hasKey: boolean;
  keyHint?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  ok: boolean;
  reply: string;
  provider: string;
  model: string;
  error?: string;
}

export interface AgentPreset {
  slug: string;
  name: string;
  merchantId: string;
  config: AgentConfig;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantSummary {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  currency: string;
  updatedAt: string;
  state?: "draft" | "ready";
  tags?: string[];
}

export interface GatewayStatus {
  running: boolean;
  kind?: string;
  port?: number;
  pid?: number;
  baseUrl?: string;
  lastError?: string;
  merchantId?: string;
}

export interface StartReq {
  kind: "mock" | "rest";
  merchantId?: string;
  port?: number;
  baseUrl?: string;
  razorpay?: { keyId?: string; keySecret?: string; webhookSecret?: string };
}

export interface Readiness {
  running: boolean;
  capabilities?: Array<{ id: string; label: string; on: boolean }>;
  payment?: boolean;
  error?: string;
}

export interface DemoRestStatus {
  id?: string;
  installed: boolean;
  store: { running: boolean; port: number; lastError?: string };
  gateway?: GatewayStatus;
}

export interface DemoRestBootResult {
  ok: boolean;
  merchant?: { id: string; name: string; currency: string; baseUrl: string };
  store?: { running: boolean; port: number };
  gateway?: GatewayStatus;
  error?: string;
}

export interface LandscapeCapability {
  key: string;
  label: string;
  what: string;
}

export interface MerchantLandscape {
  id: string;
  name: string;
  description?: string;
  url?: string;
  country?: string;
  defaultCurrency: string;
  baseUrl: string;
  live: boolean;
  running: boolean;
  endpoints: {
    ucp: string;
    mcp: string;
    agentsMd: string;
    llmsTxt: string;
    skillUrl: string;
  };
  capabilities: LandscapeCapability[];
  notes: string[];
  agents: string;
  llms: string;
  ucpProfile: Record<string, unknown>;
}

export interface AuditRow {
  event: string;
  reasonCode?: string;
  timestamp: string;
  amount?: number;
  currency?: string;
  checkout_id?: string;
  cart_id?: string;
  order_id?: string;
  payment_id?: string;
  agent?: string;
  approval?: { required: boolean; granted?: boolean; received?: boolean };
  explanation?: string;
  details?: Record<string, unknown>;
}

export interface TestResult {
  ok: boolean;
  error?: { code: string; message: string };
  capabilities?: Record<string, boolean>;
  search?: { total: number; items: Array<{ id: string; title: string; priceFrom?: { amount: number; currency: string } }> };
  product?: { id: string; title: string; variants: number };
  offer?: { price?: { amount: number; currency: string }; availability?: { status: string } };
}

export interface SampleResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  leaves?: Array<{ path: string; sample: string }>;
  error?: string;
}
