import {
  backendError,
  backendTimeout,
  rateLimited,
  ProviderError,
} from "@gateway/canonical-commerce";
import type { AuthConfig } from "./config.js";

export interface HttpRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
}

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly auth: AuthConfig | undefined,
    private readonly headers: Record<string, string>,
    private readonly defaultTimeoutMs: number,
  ) {}

  private applyAuth(headers: Headers): void {
    const auth = this.auth;
    if (!auth || auth.type === "none") return;
    if (auth.type === "bearer") {
      headers.set("authorization", `Bearer ${auth.token}`);
    } else if (auth.type === "apiKey") {
      headers.set(auth.header, auth.key);
    }
  }

  /** GET a JSON resource; throws typed ProviderError on transport/HTTP failure. */
  async getJson(pathAndQuery: string, opts: HttpRequestOptions = {}): Promise<unknown> {
    const url = joinUrl(this.baseUrl, pathAndQuery);
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: this.requestHeaders(),
        signal: controller.signal,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw backendTimeout(`merchant request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw backendError(`merchant request failed: ${err instanceof Error ? err.message : String(err)}`, {
        url,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 404) {
      throw new ProviderError("NOT_FOUND", `merchant returned 404 for ${url}`, { url });
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(
        "BACKEND_UNAUTHORIZED",
        `merchant rejected credentials (HTTP ${res.status}) for ${url}`,
        { url, status: res.status },
      );
    }
    if (res.status === 429) {
      throw rateLimited(`merchant rate-limited (HTTP 429) for ${url}`);
    }
    if (res.status >= 500) {
      throw backendError(`merchant backend returned HTTP ${res.status} for ${url}`, {
        url,
        status: res.status,
      });
    }
    if (!res.ok) {
      throw backendError(`merchant returned HTTP ${res.status} for ${url}`, {
        url,
        status: res.status,
      });
    }

    const text = await res.text();
    try {
      return text ? (JSON.parse(text) as unknown) : null;
    } catch {
      throw backendError(`merchant returned invalid JSON for ${url}`);
    }
  }

  private requestHeaders(): Headers {
    const headers = new Headers();
    headers.set("accept", "application/json");
    for (const [key, value] of Object.entries(this.headers)) {
      headers.set(key, value);
    }
    this.applyAuth(headers);
    return headers;
  }
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(trimmedBase + trimmedPath);
  return url.toString();
}
