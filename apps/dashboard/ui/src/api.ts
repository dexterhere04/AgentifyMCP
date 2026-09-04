export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
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
};

export interface MerchantSummary {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  currency: string;
  updatedAt: string;
}

export interface GatewayStatus {
  running: boolean;
  kind?: string;
  port?: number;
  pid?: number;
  baseUrl?: string;
  lastError?: string;
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

export interface AuditRow {
  event: string;
  reasonCode?: string;
  timestamp: string;
  amount?: number;
  currency?: string;
  checkout_id?: string;
  cart_id?: string;
  order_id?: string;
  approval?: { required: boolean; granted?: boolean; received?: boolean };
  explanation?: string;
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
