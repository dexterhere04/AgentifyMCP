import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RestCommerceProvider } from "@agentify/adapter-rest";
import { detectCapabilities, enabledCapabilities } from "@agentify/canonical-commerce";
import type { AgentConfig } from "./store.js";
import type { RestAdapterConfig } from "@agentify/adapter-rest";

export type LlmProviderKind = "simulate" | "openai" | "openrouter" | "groq" | "custom";

export interface LlmSettings {
  kind: LlmProviderKind;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

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

export interface AgentPreset {
  slug: string;
  name: string;
  merchantId: string;
  config: AgentConfig;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_BASE: Record<Exclude<LlmProviderKind, "custom" | "simulate">, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
};

const DEFAULT_MODEL: Record<LlmProviderKind, string> = {
  simulate: "built-in",
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  custom: "gpt-4o-mini",
};

function jsonDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export class LlmSettingsStore {
  constructor(private readonly dir: string) {}

  private file(): string {
    return join(this.dir, "llm-provider.json");
  }

  get(): LlmSettings {
    const s = readJson<Partial<LlmSettings>>(this.file());
    const kind = (s?.kind ?? "simulate") as LlmProviderKind;
    return {
      kind,
      model: s?.model ?? DEFAULT_MODEL[kind],
      baseUrl: s?.baseUrl ?? DEFAULT_BASE[kind as keyof typeof DEFAULT_BASE],
      apiKey: s?.apiKey,
    };
  }

  save(settings: LlmSettings): LlmSettings {
    jsonDir(this.dir);
    const kind = settings.kind ?? "simulate";
    const merged: LlmSettings = {
      kind,
      model: settings.model ?? DEFAULT_MODEL[kind],
      baseUrl: settings.baseUrl ?? DEFAULT_BASE[kind as keyof typeof DEFAULT_BASE],
      ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
    };
    writeFileSync(this.file(), `${JSON.stringify(merged, null, 2)}\n`);
    return merged;
  }

  publicView(): PublicLlmSettings {
    const s = this.get();
    return {
      kind: s.kind,
      model: s.model,
      baseUrl: s.kind === "custom" ? s.baseUrl : DEFAULT_BASE[s.kind as keyof typeof DEFAULT_BASE],
      hasKey: Boolean(s.apiKey),
      keyHint: s.apiKey ? `…${s.apiKey.slice(-4)}` : undefined,
    };
  }
}

export class AgentPresetStore {
  constructor(private readonly dir: string) {}

  private file(slug: string): string {
    return join(this.dir, `${slug}.json`);
  }

  list(): AgentPreset[] {
    jsonDir(this.dir);
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.dir, f), "utf8")) as AgentPreset)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(slug: string): AgentPreset {
    const file = this.file(slug);
    if (!existsSync(file)) throw new Error("agent preset not found");
    return JSON.parse(readFileSync(file, "utf8")) as AgentPreset;
  }

  save(preset: AgentPreset): AgentPreset {
    jsonDir(this.dir);
    writeFileSync(this.file(preset.slug), `${JSON.stringify(preset, null, 2)}\n`);
    return preset;
  }

  remove(slug: string): void {
    const file = this.file(slug);
    if (!existsSync(file)) throw new Error("agent preset not found");
    rmSync(file);
  }
}

export function slugify(name: string): string {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || `agent-${Date.now().toString().slice(-5)}`;
}

export function systemPrompt(merchant: RestAdapterConfig["merchant"], agent: AgentConfig, tools: string[]): string {
  const lines: string[] = [];
  lines.push(`You are ${agent.agentName}, a ${agent.tone ?? "friendly"} shopping assistant for ${merchant.name}.`);
  if (merchant.description) lines.push(`The store: ${merchant.description}`);
  lines.push(`Money is handled in ${merchant.defaultCurrency}. Always quote effective offer prices and state amounts with their currency.`);
  lines.push("");
  lines.push(`Persona: ${agent.persona}`);
  if (agent.greeting) lines.push(`Open the conversation with something like: “${agent.greeting}”`);
  lines.push("");
  lines.push("## Rules of engagement");
  lines.push(agent.instructions);
  lines.push("- Verify live availability and the live discounted offer before recommending or quoting an item.");
  if (agent.checkout.mode === "in_app") {
    lines.push(`- Checkout mode: embedded (in-app). Completion always requires explicit, contemporaneous buyer approval — never complete a checkout without it, and never ask for card details.`);
  } else {
    lines.push(`- Checkout mode: payment link handoff. Completion always requires explicit buyer approval; hand the buyer the payment link.`);
  }
  lines.push(
    agent.recommendations.enabled
      ? `- You may suggest upsells/cross-sells (max ${agent.recommendations.maxSuggestions}) that are in stock and within budget${agent.recommendations.budgetGuard ? " (budget guard on)" : ""}. Never re-suggest items already in the cart.`
      : "- Do not upsell or cross-sell.",
  );
  lines.push(`- You have these tools (MCP): ${tools.join(", ")}.`);
  if (agent.memory !== false) lines.push("- Keep the buyer's stated preferences and previous turns in mind for this conversation.");
  lines.push("- Be honest when something fails or is unavailable — tell the buyer instead of guessing.");
  return lines.join("\n");
}

const CAP_TOOLS: Record<string, string[]> = {
  catalog: ["search_catalog", "get_product", "get_variant"],
  inventory: ["check_availability"],
  pricing: ["get_offer"],
  cart: ["create_cart", "get_cart", "add_to_cart", "update_cart_item", "remove_from_cart"],
  checkout: ["create_checkout", "get_checkout", "complete_checkout", "cancel_checkout"],
  orders: ["get_order"],
};

export function toolNamesFor(config: RestAdapterConfig): string[] {
  const caps = detectCapabilities(new RestCommerceProvider(config));
  return enabledCapabilities(caps).flatMap((k) => CAP_TOOLS[k] ?? []).concat("get_audit_trail");
}

export interface ChatResult {
  ok: boolean;
  reply: string;
  provider: LlmProviderKind;
  model: string;
  error?: string;
}

function simulateReply(agent: AgentConfig, lastUser: string, tools: string[]): string {
  const clean = lastUser.trim().replace(/\s+/g, " ");
  const intro = `${agent.agentName} (${agent.tone ?? "friendly"})`;
  return [
    `Simulated reply from ${intro} — no API key configured yet.`,
    "",
    `A live agent would treat “${clean.slice(0, 140)}”${clean.length > 140 ? "…" : ""} as a request to search the catalog, verify the live offer, and reply in character.`,
    `Persona: ${agent.persona}`,
    `Tools available: ${tools.join(", ")}.`,
    "",
    "Set an LLM provider + API key in the provider panel above, then send another message to see real model output.",
  ].join("\n");
}

export async function runAgentChat(args: {
  merchant: RestAdapterConfig;
  agent: AgentConfig;
  settings: LlmSettings;
  messages: ChatMessage[];
}): Promise<ChatResult> {
  const { merchant, agent, settings, messages } = args;
  const kind = settings.kind ?? "simulate";
  const tools = toolNamesFor(merchant);

  if (kind === "simulate" || !settings.apiKey) {
    const last = [...messages].reverse().find((m) => m.role === "user");
    return {
      ok: true,
      reply: simulateReply(agent, last?.content ?? "", tools),
      provider: "simulate",
      model: "built-in",
    };
  }

  const baseUrl = (settings.baseUrl ?? DEFAULT_BASE[kind as keyof typeof DEFAULT_BASE] ?? "").replace(/\/+$/, "");
  const model = settings.model ?? DEFAULT_MODEL[kind];
  const system = systemPrompt(merchant.merchant, agent, tools);
  const apiMessages = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.maxTokens ?? 700,
      }),
    });
  } catch (err) {
    return { ok: false, reply: "", provider: kind, model, error: `request failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reply: "", provider: kind, model, error: `LLM provider returned HTTP ${res.status}: ${text.slice(0, 300)}` };
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) return { ok: false, reply: "", provider: kind, model, error: "LLM provider returned no completion text" };
  return { ok: true, reply, provider: kind, model };
}
