import { useCallback, useEffect, useState } from "react";
import { apiJson, type AgentConfig, type AgentKit, type MerchantSummary, type RecommendationItem } from "./api";
import { IconCheck, IconCopy, IconPlay, IconRun, IconTarget } from "./icons";
import { CopyChip, Err, Field, Ok, PanelBody, Skeleton, useClipboard } from "./ui";

const DEFAULTS: AgentConfig = {
  agentName: "Store Assistant",
  persona: "A helpful, honest shopping assistant for this store.",
  instructions: "Help the buyer find items, verify the live offer, and only complete checkout with their explicit approval.",
  greeting: "Hi — how can I help you shop today?",
  checkout: { mode: "in_app" },
  recommendations: { enabled: true, maxSuggestions: 3, budgetGuard: true, overrides: [] },
  capabilities: {},
};

export function Playground({
  id, onSelect, merchants,
}: { id?: string; onSelect: (id: string) => void; merchants: MerchantSummary[] }) {
  const [merchantId, setMerchantId] = useState<string | undefined>(id);
  const [cfg, setCfg] = useState<AgentConfig>(DEFAULTS);
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [tools, setTools] = useState<string[]>([]);
  const [kit, setKit] = useState<AgentKit | null>(null);
  const [preview, setPreview] = useState<RecommendationItem[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async (mid: string) => {
    setErr("");
    setCfgLoaded(false);
    try {
      try {
        setCfg(await apiJson.agentConfig(mid));
      } catch {
        setCfg(DEFAULTS);
      }
      const t = await apiJson.agentTools(mid);
      setTools(t.tools);
      setKit(await apiJson.agentKit(mid));
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
    if (merchantId) void load(merchantId);
  }, [merchantId, load]);

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

  return (
    <div className="content">
      <div className="panel pad reveal" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Configure your AI agent</div>
          <h1 className="page" style={{ marginTop: 3 }}>Agent playground</h1>
        </div>
        <div style={{ width: 220 }}>
          <select value={merchantId ?? ""} onChange={(e) => { const v = e.target.value; setMerchantId(v); onSelect(v); }}>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
          </select>
        </div>
        <span className="grow" />
        <button className="btn primary" onClick={save} disabled={!merchantId}><IconCheck /> Save</button>
        {saved && <span className="ok">✓ saved</span>}
      </div>
      {err && <div className="errbox" style={{ marginTop: 12 }}>{err}</div>}

      {!cfgLoaded ? (
        <div className="panel pad" style={{ marginTop: 14 }}><Skeleton lines={6} /></div>
      ) : (
        <>
          <PanelBody title="Agent identity" hint="Who the buyer talks to and how the agent behaves." aside={<span className="kicker">connection: /mcp</span>}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0 18px" }}>
              <Field label="Agent name"><input value={cfg.agentName} onChange={(e) => setCfg({ ...cfg, agentName: e.target.value })} /></Field>
              <Field label="Greeting"><input value={cfg.greeting ?? ""} onChange={(e) => setCfg({ ...cfg, greeting: e.target.value })} /></Field>
              <Field label="Persona"><input value={cfg.persona} onChange={(e) => setCfg({ ...cfg, persona: e.target.value })} /></Field>
            </div>
            <Field label="System instructions" hint="Rules the agent follows — approval, pricing, tone.">
              <textarea rows={5} value={cfg.instructions} onChange={(e) => setCfg({ ...cfg, instructions: e.target.value })} />
            </Field>
          </PanelBody>

          <PanelBody title="Checkout mode" hint="How payment happens in the conversation." aside={<span className={`badge ${cfg.checkout.mode === "in_app" ? "on" : "off"}`}>{cfg.checkout.mode === "in_app" ? "in-app (Razorpay Checkout)" : "payment link"}</span>}>
            <div className="row">
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" style={{ width: "auto" }} checked={cfg.checkout.mode === "in_app"} onChange={() => setCfg({ ...cfg, checkout: { ...cfg.checkout, mode: "in_app" } })} /> Embedded Checkout (Razorpay)</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="radio" style={{ width: "auto" }} checked={cfg.checkout.mode === "link"} onChange={() => setCfg({ ...cfg, checkout: { ...cfg.checkout, mode: "link" } })} /> Payment link (redirect)</label>
            </div>
            <p className="muted" style={{ margin: "8px 0" }}>Approval is always required before completion — the agent never touches card data.</p>
            {cfg.checkout.mode === "in_app" && kit && (
              <details className="fold" style={{ marginTop: 6 }}>
                <summary>Embed snippet (reference)</summary>
                <pre>{kit.checkoutSnippet}</pre>
              </details>
            )}
          </PanelBody>

          <PanelBody title="Upsell & cross-sell" hint="Let the agent suggest a premium option or a pairing for the cart." aside={<button className="btn small" onClick={runPreview}><IconPlay /> Preview</button>}>
            <div className="row">
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={cfg.recommendations.enabled} onChange={(e) => setCfg({ ...cfg, recommendations: { ...cfg.recommendations, enabled: e.target.checked } })} /> Enabled</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={cfg.recommendations.budgetGuard} onChange={(e) => setCfg({ ...cfg, recommendations: { ...cfg.recommendations, budgetGuard: e.target.checked } })} /> Budget guard (never exceed ₹5000 demo ceiling)</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Max suggestions
                <input type="number" min={1} max={6} style={{ width: 70 }} value={cfg.recommendations.maxSuggestions} onChange={(e) => setCfg({ ...cfg, recommendations: { ...cfg.recommendations, maxSuggestions: Number(e.target.value) } })} />
              </label>
            </div>
            <p className="muted">The agent exposes a <span className="mono">get_recommendations</span> tool against the live catalog — it never re-suggests items already in the cart.</p>
            {preview && (
              <>
                <h3 className="sec" style={{ marginTop: 12 }}>Demo preview</h3>
                <table className="tbl">
                  <thead><tr><th>kind</th><th>title</th><th>price</th><th>reason</th></tr></thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={`${r.kind}-${r.variantId}`}><td><span className={`badge ${r.kind === "upsell" ? "warn" : "on"}`}>{r.kind}</span></td><td>{r.title}</td><td>{r.price.amount / 100} {r.price.currency}</td><td className="muted">{r.reason}</td></tr>
                    ))}
                    {preview.length === 0 && <tr><td colSpan={4} className="muted">Nothing to suggest for this cart.</td></tr>}
                  </tbody>
                </table>
              </>
            )}
          </PanelBody>

          {kit && (
            <PanelBody title="Connection kit" hint="Hand these to your agent or platform so it can access this store.">
              <div className="row">
                <CopyChip text={kit.endpoints.mcp} label={`MCP ${kit.endpoints.mcp}`} />
                <CopyChip text={kit.endpoints.ucp} label="UCP" />
                <CopyChip text={kit.endpoints.agentsMd} label="agents.md" />
                <CopyChip text={kit.endpoints.llmsTxt} label="llms.txt" />
              </div>
              <h3 className="sec" style={{ marginTop: 12 }}>Tools the agent gets</h3>
              <div className="chiprow">{kit.tools.map((t) => <span key={t} className="chip" style={{ cursor: "default" }}>{t}</span>)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
                <div>
                  <h3 className="sec">Instructions</h3>
                  <textarea readOnly rows={12} className="code" value={kit.instructions} />
                </div>
                <div>
                  <h3 className="sec">mcpServers.json</h3>
                  <pre className="json">{kit.mcpServersJson}</pre>
                </div>
              </div>
            </PanelBody>
          )}
        </>
      )}
    </div>
  );
}
