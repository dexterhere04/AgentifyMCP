import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RestAdapterConfig } from "@agentify/adapter-rest";

/**
 * Dashboard storage: merchant REST configs as JSON files (one per merchant),
 * git-ignored under DATA_DIR. The files are plain RestAdapterConfig documents,
 * so the gateway/CLI can consume the same files.
 */

export interface MerchantSummary {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  currency: string;
  updatedAt: string;
  /** "draft" until the essential identity/connection/endpoint/mapping fields are set. */
  state: "draft" | "ready";
  /** Capability labels statically derived from the config document. */
  tags: string[];
}

const TEMPLATE_NAME = "My Store";
const TEMPLATE_BASE = "https://api.your-store.example";

function deriveState(config: RestAdapterConfig): "draft" | "ready" {
  const name = config.merchant.name?.trim();
  const baseUrl = config.http?.baseUrl?.trim();
  if (!name || name === TEMPLATE_NAME) return "draft";
  if (!baseUrl || baseUrl === TEMPLATE_BASE) return "draft";
  if (!config.catalog?.search?.path?.trim()) return "draft";
  if (!config.mappings?.product?.id?.trim()) return "draft";
  return "ready";
}

function deriveTags(config: RestAdapterConfig): string[] {
  const tags: string[] = [];
  const catalog = config.catalog;
  if (catalog?.search?.path) tags.push("catalog");
  if (catalog?.offerUrl) tags.push("offers");
  if (catalog?.stockUrl) tags.push("stock");
  return tags;
}

function safeId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
}

export interface AgentConfig {
  agentName: string;
  persona: string;
  instructions: string;
  greeting?: string;
  checkout: { mode: "link" | "in_app" };
  recommendations: {
    enabled: boolean;
    maxSuggestions: number;
    budgetGuard: boolean;
    overrides: Array<{ productId: string; suggestProductId: string; note?: string }>;
  };
  capabilities: Record<string, boolean>;
}

export function defaultAgentConfig(): AgentConfig {
  return {
    agentName: "Store Assistant",
    persona: "A helpful, honest shopping assistant for this store.",
    instructions: "Help the buyer find items, verify the live offer, and only complete checkout with their explicit approval.",
    greeting: "Hi — how can I help you shop today?",
    checkout: { mode: "in_app" },
    recommendations: { enabled: true, maxSuggestions: 3, budgetGuard: true, overrides: [] },
    capabilities: {},
  };
}

export class AgentConfigStore {
  private readonly dir: string;

  constructor(agentsDir: string) {
    this.dir = agentsDir;
    mkdirSync(this.dir, { recursive: true });
  }

  get(merchantId: string): AgentConfig {
    const file = join(this.dir, `${merchantId}.json`);
    if (!existsSync(file)) throw new Error("agent config not found");
    return JSON.parse(readFileSync(file, "utf8")) as AgentConfig;
  }

  save(merchantId: string, config: AgentConfig): AgentConfig {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, `${merchantId}.json`), `${JSON.stringify(config, null, 2)}\n`);
    return config;
  }
}

export class MerchantStore {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    mkdirSync(this.dataDir, { recursive: true });
  }

  private fileFor(id: string): string {
    return join(this.dataDir, `${id}.json`);
  }

  filePath(id: string): string {
    return this.fileFor(id);
  }

  list(): MerchantSummary[] {
    if (!existsSync(this.dataDir)) return [];
    return readdirSync(this.dataDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const config = JSON.parse(readFileSync(join(this.dataDir, f), "utf8")) as RestAdapterConfig;
        return this.summary(config, f.replace(/\.json$/, ""));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private summary(config: RestAdapterConfig, id: string): MerchantSummary {
    const file = this.fileFor(id);
    const mtime = existsSync(file) ? statSync(file).mtimeMs : 0;
    return {
      id,
      name: config.merchant.name,
      description: config.merchant.description,
      baseUrl: config.http.baseUrl,
      currency: config.merchant.defaultCurrency,
      updatedAt: new Date(mtime).toISOString(),
      state: deriveState(config),
      tags: deriveTags(config),
    };
  }

  get(id: string): RestAdapterConfig {
    const file = this.fileFor(id);
    if (!safeId(id) || !existsSync(file)) throw new Error("merchant not found");
    return JSON.parse(readFileSync(file, "utf8")) as RestAdapterConfig;
  }

  save(id: string, config: RestAdapterConfig): MerchantSummary {
    if (!safeId(id)) throw new Error("invalid merchant id");
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(this.fileFor(id), `${JSON.stringify(config, null, 2)}\n`);
    return this.summary(config, id);
  }

  remove(id: string): void {
    const file = this.fileFor(id);
    if (!safeId(id) || !existsSync(file)) throw new Error("merchant not found");
    rmSync(file);
  }
}
