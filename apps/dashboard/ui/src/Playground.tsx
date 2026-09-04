import { useCallback, useEffect, useState } from "react";
import {
  apiJson,
  type AgentConfig,
  type AgentKit,
  type AgentPreset,
  type ChatMessage,
  type ChatResult,
  type LlmProviderKind,
  type MerchantSummary,
  type PublicLlmSettings,
  type RecommendationItem,
} from "./api";
import { IconCheck, IconPlay, IconTrash } from "./icons";
import { CopyChip, Field, Skeleton } from "./ui";

const DEFAULTS: AgentConfig = {
  agentName: "Store Assistant",
  persona: "A helpful, honest shopping assistant for this store.",
  instructions: "Help the buyer find items, verify the live offer, and only complete checkout with their explicit approval.",
  greeting: "Hi — how can I help you shop today?",
  checkout: { mode: "in_app" },
  recommendations: { enabled: true, maxSuggestions: 3, budgetGuard: true, overrides: [] },
  capabilities: {},
  tone: "friendly",
  temperature: 0.7,
  maxTokens: 700,
  memory: true,
};

const TOOL_LABEL: Record<string, string> = {
  search_catalog: "Search catalog",
  get_product: "Product details",
  get_variant: "Variant details",
  check_availability: "Live availability",
  get_offer: "Live offer & price",
  create_cart: "Create cart",
  get_cart: "Read cart",
  add_to_cart: "Add to cart",
  update_cart_item: "Update cart",
  remove_from_cart: "Remove from cart",
  create_checkout: "Start checkout",
  get_checkout: "Read checkout",
  complete_checkout: "Complete checkout",
  cancel_checkout: "Cancel checkout",
  get_order: "Order status",
  get_recommendations: "Recommendations",
  get_audit_trail: "Audit trail",
};

const toolLabel = (t: string) => TOOL_LABEL[t] ?? t.replace(/_/g, " ");

const KIND_META: Record<LlmProviderKind, { label: string; baseUrl: string; model: string; hint: string }> = {
  simulate: { label: "Simulated (no key)", baseUrl: "", model: "built-in", hint: "Deterministic, offline replies so you can test wiring without an API key." },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", hint: "OpenAI chat completions." },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", hint: "One key across many models (OpenAI-compatible)." },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", hint: "Fast, free-tier friendly (OpenAI-compatible)." },
  custom: { label: "Custom (OpenAI-compatible)", baseUrl: "", model: "gpt-4o-mini", hint: "Any /v1/chat/completions endpoint — set the base URL." },
};

const slugify = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";

const SUGGESTIONS = [
  "Show me backpacks under ₹2,500",
  "What's the live offer and stock on the Harbor backpack?",
  "Suggest a gift pairing for a soy candle",
];

export function Playground({
  id, onSelect, merchants,
}: { id?: string; onSelect: (id: string) => void; merchants: MerchantSummary[] }) {
  const [merchantId, setMerchantId] = useState<string | undefined>(id);
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULTS);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [kit, setKit] = useState<AgentKit | null>(null);
  const [preview, setPreview] = useState<RecommendationItem[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const [prov, setProv] = useState<PublicLlmSettings | null>(null);
  const [provKey, setProvKey] = useState("");
  const [provSaved, setProvSaved] = useState(false);
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetSaved, setPresetSaved] = useState<{ slug: string; endpoint: string } | null>(null);
  const [chatMsgs, setChatMsgs] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busyChat, setBusyChat] = useState(false);
  const [lastRun, setLastRun] = useState<ChatResult | null>(null);

  const merchant = merchants.find((m) => m.id === merchantId);

  const load = useCallback(async (mid: string) => {
    setErr("");
    setCfgLoaded(false);
    setPreview(null);
    try {
      try {
        setCfg(await apiJson.agentConfig(mid));
      } catch {
        setCfg(DEFAULTS);
      }
      const t = await apiJson.agentTools(mid);
      setKit({ ...(await apiJson.agentKit(mid)), tools: t.tools });
      setCfgLoaded(true);
    } catch (e) {
      setErr(String(e));
      setCfgLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!merchantId && merchants.length > 0) {
      const first = merchants[0]!.id;
      setMerchantId(first);
      onSelect(first);
    }
  }, [merchantId, merchants, onSelect]);

  useEffect(() => {
    if (merchantId) {
      void load(merchantId);
      setChatMsgs([]);
      setLastRun(null);
    }
  }, [merchantId, load]);

  useEffect(() => {
    apiJson.llmProvider().then(setProv).catch(() => undefined);
    apiJson.agentPresets().then(setPresets).catch(() => undefined);
  }, []);

  const refreshPresets = useCallback(async () => {
    setPresets(await apiJson.agentPresets());
  }, []);

  const save = async () => {
    if (!merchantId) return;
    try {
      await apiJson.saveAgentConfig(merchantId, cfg);
      setKit(await apiJson.agentKit(merchantId));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setErr(String(e));
    }
  };

  const runPreview = async () => {
    const budget = cfg.recommendations.budgetGuard ? 500000 : undefined;
    setPreview((await apiJson.upsellPreview(budget)).items);
  };

  const saveProvider = async (clearKey = false) => {
    const s = await apiJson.saveLlmProvider({
      kind: (prov?.kind ?? "simulate") as LlmProviderKind,
      model: prov?.model,
      baseUrl: prov?.baseUrl,
      apiKey: clearKey ? "" : provKey || undefined,
    });
    setProv(s.provider);
    setProvKey("");
    setProvSaved(true);
    setTimeout(() => setProvSaved(false), 1600);
  };

  const sendWith = async (text: string) => {
    const content = text.trim();
    if (!content || !merchantId || busyChat) return;
    const next: ChatMessage[] = [...chatMsgs, { role: "user", content }];
    setChatMsgs(next);
    setDraft("");
    setBusyChat(true);
    setLastRun(null);
    try {
      const r = await apiJson.agentChatTest(merchantId, cfg, next);
      setChatMsgs([...next, { role: "assistant", content: r.ok ? r.reply : `⚠ ${r.error ?? "no reply"}` }]);
      setLastRun(r);
    } catch (e) {
      setChatMsgs([...next, { role: "assistant", content: `⚠ ${String(e)}` }]);
    } finally {
      setBusyChat(false);
    }
  };

  const savePreset = async () => {
    if (!presetName.trim() || !merchantId) return;
    const slug = slugify(presetName);
    const res = await apiJson.saveAgentPreset(slug, { name: presetName.trim(), merchantId, config: cfg });
    setPresetSaved({ slug: res.preset.slug, endpoint: res.endpoint });
    await refreshPresets();
  };

  const loadPreset = async (p: AgentPreset) => {
    setCfg(p.config);
    setMerchantId(p.merchantId);
    onSelect(p.merchantId);
    setPresetSaved({ slug: p.slug, endpoint: `${window.location.origin}/api/agents/${p.slug}/chat` });
    setChatMsgs([]);
  };

  const deletePreset = async (slug: string) => {
    await apiJson.deleteAgentPreset(slug);
    if (presetSaved?.slug === slug) setPresetSaved(null);
    await refreshPresets();
  };

  const kind = (prov?.kind ?? "simulate") as LlmProviderKind;
  const kindMeta = KIND_META[kind];

  return (
    <div className="content">
      <div className="reveal" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div className="pagehead-block">
          <div className="eyebrow">Sell to agents</div>
          <h1 className="page" style={{ marginTop: 6 }}>Agent playground</h1>
          <p className="pg-intro" style={{ maxWidth: 640 }}>
            Shape the assistant a buyer&apos;s AI agent meets on this store, tune its behaviour, test it against a live LLM in
            chat, then save it as a named agent with its own endpoint.
          </p>
        </div>
        <div className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Store</label>
            <select
              style={{ width: 250 }}
              value={merchantId ?? ""}
              onChange={(e) => { const v = e.target.value; setMerchantId(v); onSelect(v); }}
            >
              {merchants.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={() => void save()} disabled={!merchantId}>
            <IconCheck size={15} /> Save
          </button>
          {saved && <span className="badge on">saved</span>}
        </div>
      </div>

      {err && <div className="errbox" style={{ marginTop: 12 }}>{err}</div>}

      <div className="panel pad reveal-1" style={{ marginTop: 18 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="field" style={{ margin: 0, minWidth: 260, flex: "1 1 260px" }}>
            <label>Save this agent under a name</label>
            <input placeholder="e.g. Friendly store concierge" value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void savePreset(); }} />
          </div>
          <button className="btn" style={{ marginTop: 24 }} onClick={() => void savePreset()} disabled={!presetName.trim() || !merchantId}>
            Save as named agent
          </button>
        </div>
        {presets.length > 0 && (
          <div className="pg-tools" style={{ marginTop: 12 }}>
            <span className="kicker" style={{ marginRight: 2 }}>Saved:</span>
            {presets.map((p) => (
              <span key={p.slug} className="chip" title={`${p.merchantId} · updated ${new Date(p.updatedAt).toLocaleString()}`}>
                <a href="#" onClick={(e) => { e.preventDefault(); void loadPreset(p); }} style={{ color: "inherit" }}>{p.name}</a>
                <button className="copybtn" title="Delete" onClick={() => void deletePreset(p.slug)}><IconTrash size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {presetSaved && (
          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge on">endpoint</span>
            <CopyChip text={presetSaved.endpoint} label={presetSaved.endpoint} />
            <span className="kicker">POST JSON-RPC-style chat — agents/curl can call it once the store is running</span>
            <details className="fold" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8 }}>
              <summary>curl example</summary>
              <pre>{`curl -X POST ${presetSaved.endpoint} \\
  -H 'content-type: application/json' \\
  -d '{"messages":[{"role":"user","content":"Hi! Show me a gift under Rs. 1000"}]}'`}</pre>
            </details>
          </div>
        )}
      </div>

      {!cfgLoaded ? (
        <div className="panel pad" style={{ marginTop: 18 }}><Skeleton lines={6} /></div>
      ) : (
        <>
          <div className="pg-grid">
            <div className="pg-col">
              <div className="panel pad">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="sec"><span className="secnum">01</span>Agent identity</h2>
                  {merchant && <span className="kicker mono">{merchant.name}</span>}
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Who the buyer talks to — the name, opening line and personality shown in the conversation.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 18px", marginTop: 12 }}>
                  <Field label="Agent name"><input value={cfg.agentName} onChange={(e) => setCfg({ ...cfg, agentName: e.target.value })} /></Field>
                  <Field label="Greeting"><input value={cfg.greeting ?? ""} onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })} /></Field>
                </div>
                <Field label="Persona"><textarea rows={2} value={cfg.persona} onChange={(e) => setCfg({ ...cfg, persona: e.target.value })} /></Field>
                <Field label="System instructions" hint="Rules the agent follows — approvals, live-price verification, tone.">
                  <textarea rows={4} value={cfg.instructions} onChange={(e) => setCfg({ ...cfg, instructions: e.target.value })} />
                </Field>
              </div>

              <div className="panel pad">
                <h2 className="sec"><span className="secnum">02</span>Voice &amp; tuning</h2>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>How the replies sound and how much the model can wander — applied when you test or serve this agent.</p>
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  {(["friendly", "professional", "concise"] as const).map((t) => (
                    <button key={t} className={`chip${cfg.tone === t ? " leaf" : ""}`}
                      style={cfg.tone === t ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-ink)" } : undefined}
                      onClick={() => setCfg({ ...cfg, tone: t })}>
                      {t}
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 18px", marginTop: 12 }}>
                  <Field label={`Creativity (temperature) — ${cfg.temperature?.toFixed(1) ?? "0.7"}`}>
                    <input type="range" min={0} max={2} step={0.1} value={cfg.temperature ?? 0.7}
                      onChange={(e) => setCfg({ ...cfg, temperature: Number(e.target.value) })} />
                  </Field>
                  <Field label="Max tokens per reply">
                    <input type="number" min={100} max={4096} step={50} value={cfg.maxTokens ?? 700}
                      onChange={(e) => setCfg({ ...cfg, maxTokens: Number(e.target.value) })} />
                  </Field>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={cfg.memory !== false}
                    onChange={(e) => setCfg({ ...cfg, memory: e.target.checked })} />
                  Keep buyer context across the conversation
                </label>
              </div>

              <div className="panel pad">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="sec"><span className="secnum">03</span>Checkout mode</h2>
                  <span className={`badge ${cfg.checkout.mode === "in_app" ? "on" : "off"}`}>
                    {cfg.checkout.mode === "in_app" ? "in-app checkout" : "payment link"}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 10, gap: 14 }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" style={{ width: "auto" }} checked={cfg.checkout.mode === "in_app"} onChange={() => setCfg({ ...cfg, checkout: { ...cfg.checkout, mode: "in_app" } })} /> Embedded checkout</label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" style={{ width: "auto" }} checked={cfg.checkout.mode === "link"} onChange={() => setCfg({ ...cfg, checkout: { ...cfg.checkout, mode: "link" } })} /> Payment link (redirect)</label>
                </div>
                <p className="muted" style={{ margin: "8px 0 4px", fontSize: 12.5 }}>
                  Either way the agent never touches card data — completion always stops for an explicit human approval.
                </p>
                {cfg.checkout.mode === "in_app" && kit && (
                  <details className="fold" style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 8 }}>
                    <summary>Embed snippet (reference)</summary>
                    <pre>{kit.checkoutSnippet}</pre>
                  </details>
                )}
              </div>

              <div className="panel pad">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="sec"><span className="secnum">04</span>Upsell &amp; cross-sell</h2>
                  <button className="btn small" onClick={() => void runPreview()}><IconPlay size={12} /> Preview</button>
                </div>
                <div className="row" style={{ marginTop: 10, gap: 14, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={cfg.recommendations.enabled} onChange={(e) => setCfg({ ...cfg, recommendations: { ...cfg.recommendations, enabled: e.target.checked } })} /> Let the agent suggest</label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={cfg.recommendations.budgetGuard} onChange={(e) => setCfg({ ...cfg, recommendations: { ...cfg.recommendations, budgetGuard: e.target.checked } })} /> Budget guard</label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Max suggestions
                    <input type="number" min={1} max={6} style={{ width: 70 }} value={cfg.recommendations.maxSuggestions} onChange={(e) => setCfg({ ...cfg, recommendations: { ...cfg.recommendations, maxSuggestions: Number(e.target.value) } })} />
                  </label>
                </div>
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 12.5 }}>
                  The agent only suggests in-stock, budget-safe options and never re-suggests something already in the cart.
                </p>
                {preview && (
                  <div className="sulist" style={{ marginTop: 12 }}>
                    {preview.length === 0 && <div className="hint muted">Nothing to suggest for this cart.</div>}
                    {preview.map((r) => (
                      <div className="su-item" key={`${r.kind}-${r.variantId}`}>
                        <span className={`badge ${r.kind === "upsell" ? "warn" : "on"}`}>{r.kind === "upsell" ? "upsell" : "cross-sell"}</span>
                        <span className="grow" style={{ minWidth: 180 }}>
                          <b style={{ fontSize: 13.5 }}>{r.title}</b>
                          <div className="su-reason">{r.reason}</div>
                        </span>
                        <span className="su-price">{(r.price.amount / 100).toFixed(2)} <small className="mono muted" style={{ fontSize: 11 }}>{r.price.currency}</small></span>
                        {!r.inStock && <span className="badge err">out of stock</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pg-col">
              <div className="panel pad">
                <div className="eyebrow">Live preview</div>
                <div className="pg-headrow" style={{ marginTop: 10 }}>
                  <span className="pg-avatar">{(cfg.agentName || "?").slice(0, 1).toUpperCase()}</span>
                  <div>
                    <b className="serif" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.2px" }}>{cfg.agentName}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{merchant ? `assistant for ${merchant.name}` : "assistant"}</div>
                  </div>
                </div>
                <div className="pg-bub">“{cfg.greeting || "Hi — how can I help you shop today?"}”</div>
                <div className="pg-facts">
                  <span className="badge">{kit?.tools.length ?? "…"} tools</span>
                  <span className={`badge ${cfg.checkout.mode === "in_app" ? "on" : "off"}`}>{cfg.checkout.mode === "in_app" ? "in-app checkout" : "payment link"}</span>
                  <span className={`badge ${cfg.recommendations.enabled ? "on" : "off"}`}>{cfg.recommendations.enabled ? `suggests up to ${cfg.recommendations.maxSuggestions}` : "no suggestions"}</span>
                  <span className="badge">{cfg.tone ?? "friendly"} · {cfg.temperature?.toFixed(1) ?? "0.7"}</span>
                </div>
                <p className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>{cfg.persona}</p>
              </div>

              {kit && (
                <div className="panel pad">
                  <h2 className="sec"><span className="secnum">05</span>Connection kit</h2>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Hand these to your agent or platform so it can reach and transact with this store.</p>
                  <div className="chiprow" style={{ marginTop: 10 }}>
                    <CopyChip text={kit.endpoints.mcp} label="MCP endpoint" />
                    <CopyChip text={kit.endpoints.ucp} label="UCP" />
                    <CopyChip text={kit.endpoints.agentsMd} label="agents.md" />
                    <CopyChip text={kit.endpoints.llmsTxt} label="llms.txt" />
                  </div>
                  <h3 className="sec" style={{ marginTop: 16 }}>Tools the agent gets</h3>
                  <div className="pg-tools" style={{ marginTop: 6 }}>
                    {kit.tools.map((t) => <span key={t} className="chip" style={{ cursor: "default" }}>{toolLabel(t)}</span>)}
                  </div>
                  <details className="fold" style={{ marginTop: 16, border: "1px solid var(--line)", borderRadius: 8 }}>
                    <summary>Instructions the agent is given (reference)</summary>
                    <pre>{kit.instructions}</pre>
                  </details>
                  <details className="fold" style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 8 }}>
                    <summary>mcpServers.json (reference)</summary>
                    <pre>{kit.mcpServersJson}</pre>
                  </details>
                </div>
              )}
            </div>
          </div>

          <div className="panel pad reveal-2" style={{ marginTop: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <h2 className="sec"><span className="secnum">06</span>Test in a live chat</h2>
              <div className="row" style={{ gap: 8 }}>
                <span className={`badge ${prov?.hasKey || kind === "simulate" ? "on" : "warn"}`}>{kind === "simulate" ? "simulated" : prov?.hasKey ? "key set" : "no key"}</span>
                {lastRun && <span className="kicker mono">{lastRun.provider} · {lastRun.model}</span>}
              </div>
            </div>

            <div className="test-grid">
              <div className="panel pad" style={{ background: "var(--surface-2)" }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>LLM provider</div>
                <Field label="Provider">
                  <select value={kind} onChange={(e) => { const k = e.target.value as LlmProviderKind; const meta = KIND_META[k]; setProv({ kind: k, model: meta.model, baseUrl: meta.baseUrl, hasKey: prov?.hasKey ?? false, keyHint: prov?.keyHint }); }}>
                    {(Object.keys(KIND_META) as LlmProviderKind[]).map((k) => <option key={k} value={k}>{KIND_META[k].label}</option>)}
                  </select>
                </Field>
                <Field label="Model">
                  <input value={prov?.model ?? ""} onChange={(e) => setProv({ ...prov!, model: e.target.value })} disabled={kind === "simulate"} />
                </Field>
                <Field label="Base URL" hint={kindMeta.hint}>
                  <input className="mono" value={prov?.baseUrl ?? ""} placeholder="https://api…/v1" disabled={kind === "simulate"} onChange={(e) => setProv({ ...prov!, baseUrl: e.target.value })} />
                </Field>
                <Field label="API key">
                  <div className="row" style={{ gap: 8 }}>
                    <input type="password" className="mono grow" placeholder={prov?.hasKey ? `••••${prov.keyHint}` : "sk-…"} value={provKey} disabled={kind === "simulate"} onChange={(e) => setProvKey(e.target.value)} />
                    <button className="btn small" disabled={kind === "simulate"} onClick={() => void saveProvider(false)}>Save</button>
                    {prov?.hasKey && kind !== "simulate" && (
                      <button className="btn small ghost" title="Remove stored key" onClick={() => void saveProvider(true)}>Clear</button>
                    )}
                  </div>
                </Field>
                {provSaved && <div className="badge on" style={{ marginTop: 6 }}>provider saved</div>}
                <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Key is stored locally for this control plane and sent only to the provider above. Without a key the chat runs in
                  simulated mode so the wiring can still be tested.
                </p>
              </div>

              <div className="chatcard">
                <div className="chatbox">
                  {chatMsgs.length === 0 && (
                    <div className="chat-empty">
                      <p>Say hello — the assistant below answers with your <b>{cfg.agentName}</b> persona, tone and instructions
                        against <b>{merchant?.name ?? "this store"}</b>.</p>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                        {SUGGESTIONS.map((s) => (
                          <button key={s} className="chip" disabled={busyChat || !merchantId} onClick={() => void sendWith(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMsgs.map((m, i) => (
                    <div key={i} className={`msg ${m.role}`}>{m.content}</div>
                  ))}
                  {busyChat && <div className="msg assistant typing">…</div>}
                </div>
                <div className="chatbar">
                  <textarea
                    rows={2}
                    placeholder="Type a buyer question…"
                    value={draft}
                    disabled={!merchantId}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendWith(draft); } }}
                  />
                  <button className="btn primary" disabled={busyChat || !draft.trim() || !merchantId} onClick={() => void sendWith(draft)}>
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
