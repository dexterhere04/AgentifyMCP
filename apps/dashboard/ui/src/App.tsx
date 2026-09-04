import { useCallback, useEffect, useState } from "react";
import {
  apiJson,
  type AuditRow,
  type GatewayStatus,
  type MerchantSummary,
  type Readiness,
  type SampleResult,
  type TestResult,
} from "./api";

type View = { page: "home" } | { page: "edit"; id: string };

const inr = (a: number | undefined): string => (a === undefined ? "-" : `₹${(a / 100).toFixed(2)}`);

function fmt(config: unknown): string {
  try {
    return JSON.stringify(config, null, 2);
  } catch {
    return String(config);
  }
}

export function App() {
  const [view, setView] = useState<View>({ page: "home" });
  return (
    <div>
      <div className="topbar">
        <span className="logo">◆ Agentify</span>
        <a href="#" onClick={() => setView({ page: "home" })}>Dashboard</a>
        <span className="muted" style={{ color: "#dbeafe" }}>local config &amp; ops</span>
      </div>
      {view.page === "home" ? <Home onOpen={(id) => setView({ page: "edit", id })} /> : <Editor id={view.id} onBack={() => setView({ page: "home" })} />}
    </div>
  );
}

function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    apiJson.merchants().then(setMerchants).catch((e) => setErr(String(e)));
    apiJson.gatewayStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  const newMerchant = async () => {
    setErr("");
    try {
      const template = (await apiJson.blankTemplate()) as { id: string };
      const id = `${template.id}-${Date.now().toString().slice(-5)}`;
      await apiJson.save(id, template);
      onOpen(id);
    } catch (e) {
      setErr(String(e));
    }
  };

  const runMock = async () => {
    setErr("");
    try {
      setStatus(await apiJson.gatewayStart({ kind: "mock" }));
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="page">
      {err && <div className="err">{err}</div>}
      <div className="card row">
        <div className="grow">
          <h2>Merchants</h2>
          <span className="muted">REST store integrations you configure, test and run locally.</span>
        </div>
        <button className="primary" onClick={newMerchant}>+ New merchant</button>
      </div>

      {merchants.length === 0 ? (
        <div className="card muted">No merchants yet. Create one to connect a REST store, or start the demo below.</div>
      ) : (
        <table className="card">
          <thead><tr><th>Name</th><th>Base URL</th><th>Currency</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {merchants.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong><div className="muted">{m.id}</div></td>
                <td className="mono">{m.baseUrl}</td>
                <td>{m.currency}</td>
                <td className="muted">{m.updatedAt.slice(0, 19).replace("T", " ")}</td>
                <td>
                  <button className="small" onClick={() => onOpen(m.id)}>Open</button>{" "}
                  <button className="small danger" onClick={async () => { await apiJson.remove(m.id); refresh(); }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="card">
        <h2>Local gateway</h2>
        <div className="row">
          <button onClick={runMock}>Run demo (mock) gateway</button>
          <button className="danger" onClick={async () => { await apiJson.gatewayStop(); setStatus(await apiJson.gatewayStatus()); }}>Stop</button>
          <button onClick={refresh}>Refresh</button>
          <span>
            {status?.running ? <span className="badge on">running :{status.port}</span> : <span className="badge off">stopped</span>}
            {status?.baseUrl && <> — <a href={status.baseUrl} target="_blank" rel="noreferrer">{status.baseUrl}</a></>}
            {status?.lastError && <span className="muted"> ({status.lastError})</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const [configText, setConfigText] = useState("{}");
  const [saveState, setSaveState] = useState("");
  const [tab, setTab] = useState("config");
  const [summary, setSummary] = useState<MerchantSummary | null>(null);

  useEffect(() => {
    apiJson.merchant(id).then((c) => setConfigText(fmt(c))).catch((e) => setSaveState(String(e)));
    apiJson.merchants().then((ms) => setSummary(ms.find((m) => m.id === id) ?? null)).catch(() => undefined);
  }, [id]);

  const parse = (): { ok: boolean; value: unknown; error?: string } => {
    try {
      return { ok: true, value: JSON.parse(configText) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };

  const validate = async () => {
    const p = parse();
    if (!p.ok) return setSaveState(p.error!);
    const r = await apiJson.validate(p.value);
    setSaveState(r.ok ? "✓ config is valid" : `Config errors:\n${r.errors.join("\n")}`);
  };

  const save = async () => {
    const p = parse();
    if (!p.ok) return setSaveState(p.error!);
    const r = await apiJson.save(id, p.value);
    setSaveState(`✓ saved ${r.merchant.name}`);
    setSummary(r.merchant);
  };

  return (
    <div className="page">
      <div className="card row">
        <button onClick={onBack}>← Home</button>
        <h2 style={{ margin: 0 }}>{summary?.name ?? id}</h2>
        <span className="muted">{summary?.baseUrl}</span>
        <span className="grow" />
        <button onClick={validate}>Validate</button>
        <button className="primary" onClick={save}>Save</button>
      </div>
      {saveState && <div className={saveState.startsWith("✓") ? "card ok" : "card err"}>{saveState}</div>}

      <div className="tabs">
        {["config", "test", "run", "audit"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "config" && <ConfigPanel id={id} text={configText} onChange={setConfigText} />}
      {tab === "test" && <TestPanel />}
      {tab === "run" && <RunPanel id={id} />}
      {tab === "audit" && <AuditPanel />}
    </div>
  );
}

function ConfigPanel({ text, onChange }: { id: string; text: string; onChange: (s: string) => void }) {
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [url, setUrl] = useState("");
  const [bearer, setBearer] = useState("");

  return (
    <div className="card">
      <h2>Merchant config (JSON)</h2>
      <p className="muted">
        Field mappings follow the REST adapter config. Tip: run “Test” first for the Luna &amp; Co fixture, then fetch a
        real sample here to copy JSON paths into the mappings.
      </p>
      <textarea rows={24} value={text} onChange={(e) => onChange(e.target.value)} spellCheck={false} />

      <div className="card" style={{ background: "#fafbfc" }}>
        <h2>Probe a sample payload</h2>
        <div className="row">
          <input className="grow" placeholder="https://api.store.example/products?limit=1" value={url} onChange={(e) => setUrl(e.target.value)} />
          <input placeholder="bearer token (optional)" value={bearer} onChange={(e) => setBearer(e.target.value)} />
          <button onClick={async () => setSample(await apiJson.sample(url, bearer))}>Fetch</button>
        </div>
        {sample?.ok === false && <div className="err">{sample.error}</div>}
        {sample?.ok && (
          <div>
            <div className="row">
              <button className="small" onClick={() => sample.leaves && navigator.clipboard?.writeText(sample.leaves.map((l) => l.path).join("\n"))}>Copy paths</button>
              <span className="muted">HTTP {sample.status} — click a path to copy it</span>
            </div>
            <pre className="json">{JSON.stringify(sample.body, null, 2).slice(0, 6000)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function TestPanel() {
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [result, setResult] = useState<TestResult | null>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setErr("");
    try {
      setResult(await apiJson.testMerchant({}, mode === "fixture"));
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="card">
      <h2>Test the integration</h2>
      <div className="row">
        <select value={mode} onChange={(e) => setMode(e.target.value as "fixture" | "live")}>
          <option value="fixture">Luna &amp; Co fixture (offline)</option>
          <option value="live">This merchant (live)</option>
        </select>
        <button className="primary" onClick={run}>Run test</button>
      </div>
      {err && <div className="err">{err}</div>}
      {result && !result.ok && <div className="err">Test failed: [{result.error?.code}] {result.error?.message}</div>}
      {result?.ok && (
        <>
          <div className="row" style={{ margin: "8px 0" }}>
            <span className="badge on">✓ search: {result.search?.total} item(s)</span>
            {result.product && <span className="badge on">✓ product: {result.product.title}</span>}
            {result.offer?.price && <span className="badge on">✓ offer {inr(result.offer.price.amount)} · {result.offer.availability?.status}</span>}
          </div>
          {result.capabilities && (
            <table>
              <thead><tr><th>Capability</th><th /></tr></thead>
              <tbody>
                {Object.entries(result.capabilities).map(([k, on]) => (
                  <tr key={k}><td className="mono">{k}</td><td><span className={`badge ${on ? "on" : "off"}`}>{on ? "on" : "off"}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ marginTop: 12 }}>Sample search rows</h2>
          <table>
            <thead><tr><th>id</th><th>title</th><th>price from</th></tr></thead>
            <tbody>
              {result.search?.items.map((i) => (
                <tr key={i.id}><td className="mono">{i.id}</td><td>{i.title}</td><td>{i.priceFrom ? inr(i.priceFrom.amount) : "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function RunPanel({ id }: { id: string }) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [kind, setKind] = useState<"rest" | "mock">("rest");
  const [port, setPort] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [rpKey, setRpKey] = useState("");
  const [rpSecret, setRpSecret] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    try {
      const s = await apiJson.gatewayStatus();
      setStatus(s);
      setLogs(await apiJson.gatewayLogs());
      if (s.running) setReadiness(await apiJson.readiness());
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const start = async () => {
    setErr("");
    try {
      await apiJson.gatewayStart({
        kind,
        merchantId: kind === "rest" ? id : undefined,
        ...(port ? { port: Number(port) } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(rpKey && rpSecret ? { razorpay: { keyId: rpKey, keySecret: rpSecret } } : {}),
      });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="card">
      <h2>Run the local gateway with this merchant</h2>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value as "rest" | "mock")}>
          <option value="rest">This merchant (saved config)</option>
          <option value="mock">Demo mock merchant</option>
        </select>
        <button className="primary" onClick={start}>Start</button>
        <button className="danger" onClick={async () => { await apiJson.gatewayStop(); await refresh(); }}>Stop</button>
        <button onClick={refresh}>Refresh</button>
        {status?.running ? <span className="badge on">running :{status.port}</span> : <span className="badge off">stopped</span>}
        {err && <span className="err">{err}</span>}
      </div>
      {status?.baseUrl && (
        <div className="row" style={{ marginTop: 8 }}>
          <a href={status.baseUrl} target="_blank" rel="noreferrer">{status.baseUrl}</a>
          <a href={`${status.baseUrl}/.well-known/ucp`} target="_blank" rel="noreferrer">UCP</a>
          <a href={`${status.baseUrl}/agents.md`} target="_blank" rel="noreferrer">agents.md</a>
          <a href={`${status.baseUrl}/llms.txt`} target="_blank" rel="noreferrer">llms.txt</a>
          <a href={`${status.baseUrl}/mcp`} target="_blank" rel="noreferrer">MCP</a>
        </div>
      )}

      <h2 style={{ marginTop: 10 }}>Razorpay (test) — optional</h2>
      <div className="row">
        <input className="grow" placeholder="RAZORPAY_KEY_ID" value={rpKey} onChange={(e) => setRpKey(e.target.value)} />
        <input className="grow" placeholder="RAZORPAY_KEY_SECRET" value={rpSecret} onChange={(e) => setRpSecret(e.target.value)} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="grow" placeholder={`port (default 8787)`} value={port} onChange={(e) => setPort(e.target.value)} />
        <input className="grow" placeholder={`base url e.g. http://localhost:8787`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </div>

      {readiness?.running && (
        <>
          <h2 style={{ marginTop: 10 }}>Agent readiness</h2>
          <div className="row">
            {readiness.capabilities?.map((c) => (
              <span key={c.id} className={`badge ${c.on ? "on" : "off"}`}>{c.label}</span>
            ))}
            <span className={`badge ${readiness.payment ? "on" : "off"}`}>Payment</span>
          </div>
        </>
      )}

      <h2 style={{ marginTop: 10 }}>Logs</h2>
      <div className="logbox">{logs.join("\n") || "(no logs yet)"}</div>
    </div>
  );
}

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [checkout, setCheckout] = useState("");
  const [type, setType] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (checkout) params.set("checkoutId", checkout);
    if (type) params.set("type", type);
    params.set("limit", "300");
    setRows(await apiJson.audit(params.toString()));
  }, [checkout, type]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="card">
      <h2>Audit trail (explainable · bounded · gated)</h2>
      <div className="row">
        <input className="grow" placeholder="checkoutId filter (optional)" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
        <input className="grow" placeholder="event type filter e.g. checkout.completed" value={type} onChange={(e) => setType(e.target.value)} />
        <button onClick={load}>Refresh</button>
      </div>
      <table>
        <thead><tr><th>time</th><th>event</th><th>amount</th><th>approval</th><th>explanation</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const granted = r.approval?.granted ?? r.approval?.received;
            return (
              <tr key={i}>
                <td className="mono muted">{r.timestamp.slice(11, 23)}</td>
                <td className="mono">{r.event}{r.reasonCode ? ` (${r.reasonCode})` : ""}</td>
                <td>{r.amount !== undefined ? inr(r.amount) : "-"}</td>
                <td>{r.approval ? `${r.approval.required ? "req/" : ""}${granted ? "granted" : "not"}` : "-"}</td>
                <td className="muted">{r.explanation ?? ""}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="muted">No events yet. Run a checkout flow, then refresh.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
