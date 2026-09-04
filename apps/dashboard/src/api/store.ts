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
}

function safeId(id: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
}

export class MerchantStore {
  constructor(private readonly dataDir: string) {
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
