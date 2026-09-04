import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiJson, type AuditRow, type GatewayStatus, type Readiness, type SampleResult, type TestResult } from "./api";
import {
  IconBook, IconCheck, IconChev, IconCopy, IconLayers, IconPlay, IconRefresh,
  IconRun, IconServer, IconSliders, IconStop, IconTarget, IconTrash, IconWarn,
} from "./icons";
import { CopyChip, Empty, Err, Field, Ok, PanelBody, Skeleton, StatusPill, getAt, setAt, useClipboard } from "./ui";

const money = (a: number | undefined) => (a === undefined ? "-" : `₹${(a / 100).toFixed(2)}`);

const STEP = [
  { id: "identity", label: "Identity", icon: <IconServer size={14} /> },
  { id: "connection", label: "Connection", icon: <IconServer size={14} /> },
  { id: "endpoints", label: "Endpoints", icon: <IconServer size={14} /> },
  { id: "mappings", label: "Mappings", icon: <IconTarget size={14} /> },
  { id: "review", label: "Review", icon: <IconCheck size={14} /> },
  { id: "test", label: "Test", icon: <IconPlay size={14} /> },
  { id: "run", label: "Run", icon: <IconRun size={14} /> },
  { id: "audit", label: "Audit", icon: <IconBook size={14} /> },
];

export function Workspace({ id, onBack, onDeleted }: { id: string; onBack: () => void; onDeleted: () => void }) {
  const [cfg, setCfg] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState({ name: id });
  const [toast, setToast] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [activeStep, setActiveStep] = useState("identity");

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const notify = useCallback((t: "ok" | "err", m: string) => {
    setToast({ t, m });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const c = (await apiJson.merchant(id)) as Record<string, unknown>;
      setCfg(c);
      setJsonText(JSON.stringify(c, null, 2));
      setMeta({ name: (c.merchant as { name?: string })?.name ?? id });
    } catch (e) {
      notify("err", String(e));
    } finally {
      setLoaded(true);
    }
  }, [id, notify]);

  useEffect(() => { void load(); }, [load]);

  const bind = useCallback(
    (path: string) => ({
      value: (getAt(cfg, path) as string | undefined) ?? "",
      set: (v: string) => setCfg((c) => setAt(c, path, v)),
    }),
    [cfg],
  );
  const bindMoney = (path: string) => ({
    p: (getAt(cfg, `${path}.path`) as string | undefined) ?? "",
    unit: (getAt(cfg, `${path}.unit`) as string | undefined) ?? "major",
    setPath: (v: string) => setCfg((c) => setAt(c, `${path}.path`, v)),
    setUnit: (v: string) => setCfg((c) => setAt(c, `${path}.unit`, v)),
  });

  const save = useCallback(async () => {
    try {
      const r = await apiJson.save(id, cfg);
      setMeta({ name: r.merchant.name });
      notify("ok", `Saved ${r.merchant.name}`);
    } catch (e) {
      notify("err", String(e));
    }
  }, [cfg, id, notify]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    },
    [save],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const goto = (s: string) => {
    setActiveStep(s);
    document.getElementById(`sec-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyJson = () => {
    try {
      setCfg(JSON.parse(jsonText));
      notify("ok", "Config applied from JSON");
    } catch {
      notify("err", "Invalid JSON — not applied");
    }
  };

  if (!loaded) return <div className="content"><div className="panel pad"><Skeleton lines={6} /></div></div>;

  return (
    <div className="content">
      <div className="panel pad reveal" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">Merchant</div>
          <h1 className="page" style={{ marginTop: 3 }}>{meta.name}</h1>
        </div>
        <span className="grow" />
        <button className="btn" onClick={() => setDrawer(true)}>JSON</button>
        <button className="btn" onClick={save}><IconCheck /> Save <span className="kbd">⌘S</span></button>
        <button className="btn danger" onClick={async () => { await apiJson.remove(id); onDeleted(); }}><IconTrash size={14} /> Delete</button>
      </div>

      {/* section rail */}
      <div className="rail reveal" style={{ marginTop: 14, position: "sticky", top: 62, zIndex: 3 }}>
        {STEP.map((s, i) => (
          <button key={s.id} className={`step ${activeStep === s.id ? "active" : ""}`} onClick={() => goto(s.id)}>
            <span className="stepnum">0{i + 1}</span> {s.label}
          </button>
        ))}
      </div>

      <Section id="identity" title="Store identity" hint="Who the store is — shown to agents and in UCP metadata.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "0 18px" }}>
          <Field label="Merchant id"><input className="mono" value={bind("id").value} onChange={(e) => bind("id").set(e.target.value)} /></Field>
          <Field label="Name"><input value={bind("merchant.name").value} onChange={(e) => bind("merchant.name").set(e.target.value)} /></Field>
          <Field label="Default currency"><input className="mono" maxLength={3} value={bind("merchant.defaultCurrency").value} onChange={(e) => bind("merchant.defaultCurrency").set(e.target.value.toUpperCase())} /></Field>
          <Field label="Store URL"><input value={bind("merchant.url").value} onChange={(e) => bind("merchant.url").set(e.target.value)} /></Field>
          <Field label="Description"><input value={(getAt(cfg, "merchant.description") as string) ?? ""} onChange={(e) => setCfg((c) => setAt(c, "merchant.description", e.target.value))} /></Field>
        </div>
      </Section>

      <Section id="connection" title="Connection" hint="How the gateway reaches your store's API.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0 18px" }}>
          <Field label="API base URL"><input className="mono" placeholder="https://api.your-store.example" value={bind("http.baseUrl").value} onChange={(e) => bind("http.baseUrl").set(e.target.value)} /></Field>
          <Field label="Timeout (ms)"><input className="mono" type="number" value={(getAt(cfg, "http.timeoutMs") as number | undefined) ?? 3000} onChange={(e) => setCfg((c) => setAt(c, "http.timeoutMs", Number(e.target.value)))} /></Field>
        </div>
        <div className="divider" />
        <div className="row" style={{ gap: 18 }}>
          {(["none", "bearer", "apiKey"] as const).map((t) => (
            <label key={t} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="radio" checked={(getAt(cfg, "http.auth.type") ?? "none") === t} onChange={() => setCfg((c) => setAt(c, "http.auth", t === "none" ? { type: "none" } : { ...((c.http as { auth?: object })?.auth as object | undefined), type: t }))} style={{ width: "auto" }} />
              <span className="muted">{t === "apiKey" ? "API key" : t}</span>
            </label>
          ))}
        </div>
        {(getAt(cfg, "http.auth.type") as string) === "bearer" && (
          <Field label="Bearer token"><input className="mono" type="password" value={(getAt(cfg, "http.auth.token") as string) ?? ""} onChange={(e) => setCfg((c) => setAt(c, "http.auth.token", e.target.value))} /></Field>
        )}
        {(getAt(cfg, "http.auth.type") as string) === "apiKey" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 18px" }}>
            <Field label="Header name"><input className="mono" value={(getAt(cfg, "http.auth.header") as string) ?? "x-api-key"} onChange={(e) => setCfg((c) => setAt(c, "http.auth.header", e.target.value))} /></Field>
            <Field label="Key"><input className="mono" type="password" value={(getAt(cfg, "http.auth.key") as string) ?? ""} onChange={(e) => setCfg((c) => setAt(c, "http.auth.key", e.target.value))} /></Field>
          </div>
        )}
      </Section>

      <Section id="endpoints" title="Endpoints" hint="Where the catalog lives. Use {productId}/{variantId} placeholders.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: "0 18px" }}>
          <Field label="Search path"><input className="mono" value={bind("catalog.search.path").value} onChange={(e) => bind("catalog.search.path").set(e.target.value)} /></Field>
          <Field label="Items path in response"><input className="mono" value={bind("catalog.search.itemsPath").value} onChange={(e) => bind("catalog.search.itemsPath").set(e.target.value)} /></Field>
          <Field label="Total path (optional)"><input className="mono" value={bind("catalog.search.totalPath").value} onChange={(e) => bind("catalog.search.totalPath").set(e.target.value)} /></Field>
          <Field label="Page size"><input className="mono" type="number" value={(getAt(cfg, "catalog.search.pageSize") as number) ?? 20} onChange={(e) => setCfg((c) => setAt(c, "catalog.search.pageSize", Number(e.target.value)))} /></Field>
          <Field label="Product URL"><input className="mono" value={bind("catalog.productUrl").value} onChange={(e) => bind("catalog.productUrl").set(e.target.value)} /></Field>
          <Field label="Variant URL"><input className="mono" value={bind("catalog.variantUrl").value} onChange={(e) => bind("catalog.variantUrl").set(e.target.value)} /></Field>
          <Field label="Offer URL (optional)"><input className="mono" value={bind("catalog.offerUrl").value} onChange={(e) => bind("catalog.offerUrl").set(e.target.value)} /></Field>
          <Field label="Stock URL (optional)"><input className="mono" value={bind("catalog.stockUrl").value} onChange={(e) => bind("catalog.stockUrl").set(e.target.value)} /></Field>
        </div>
      </Section>

      <MappingSection cfg={cfg} setCfg={setCfg} bindMoney={bindMoney} bind={bind} />

      <Section id="review" title="Review & validate" hint="The config is validated against the merchant-config schema before saving.">
        <Review cfg={cfg} save={save} />
      </Section>

      <TestSection id={id} />

      <RunSection id={id} auditPathHint="dashboard" />

      <AuditSection />

      {drawer && (
        <div className="panel pad" style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="sec">Raw config</h2>
            <div className="row">
              <button className="btn small" onClick={applyJson}>Apply</button>
              <button className="btn small ghost" onClick={() => setDrawer(false)}>Close</button>
            </div>
          </div>
          <textarea className="code" rows={26} value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
        </div>
      )}

      {toast && <div className={`toast ${toast.t}`}>{toast.m}</div>}
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div id={`sec-${id}`} className="panel pad reveal" style={{ marginTop: 14 }}>
      <h2 className="sec">{title}</h2>
      {hint && <p className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>{hint}</p>}
      <div className="divider" />
      {children}
    </div>
  );
}

/* ---------------- mappings + click-to-map ---------------- */
type MoneyBinder = (path: string) => { p: string; unit: string; setPath: (v: string) => void; setUnit: (v: string) => void };
type Bind = ReturnType<typeof useBindDummy>;

function useBindDummy() {
  return { value: "", set: (_: string) => undefined };
}

function MappingSection({
  cfg, setCfg, bindMoney, bind,
}: { cfg: Record<string, unknown>; setCfg: (fn: (c: Record<string, unknown>) => Record<string, unknown>) => void; bindMoney: MoneyBinder; bind: Bind }) {
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [url, setUrl] = useState("");
  const [bearer, setBearer] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hintText, setHintText] = useState("");

  const setter = (path: string) => (v: string) => setCfg((c) => setAt(c, path, v));

  const groups: Array<{ title: string; rows: Array<{ label: string; path: string }> }> = [
    {
      title: "Product",
      rows: [
        { label: "Product id", path: "mappings.product.id" },
        { label: "Title", path: "mappings.product.title" },
        { label: "Category", path: "mappings.product.category" },
        { label: "Brand", path: "mappings.product.brand" },
      ],
    },
    {
      title: "Variants",
      rows: [
        { label: "Variants array path", path: "mappings.product.variants.path" },
        { label: "Variant id", path: "mappings.product.variants.each.id" },
        { label: "SKU", path: "mappings.product.variants.each.sku" },
        { label: "Availability path", path: "mappings.product.variants.each.availability.path" },
      ],
    },
    {
      title: "Offer",
      rows: [
        { label: "Variant id", path: "mappings.offer.id" },
        { label: "Product id", path: "mappings.offer.productId" },
        { label: "SKU", path: "mappings.offer.sku" },
        { label: "Product title", path: "mappings.offer.productTitle" },
        { label: "Availability path", path: "mappings.offer.availability.path" },
      ],
    },
  ];
  const moneyGroups: Array<{ label: string; path: string }> = [
    { label: "List price", path: "mappings.product.variants.each.listPrice" },
    { label: "Sale price", path: "mappings.product.variants.each.salePrice" },
    { label: "Offer list price", path: "mappings.offer.listPrice" },
    { label: "Offer sale price", path: "mappings.offer.salePrice" },
  ];

  const leaves = useMemo(() => (sample?.leaves ?? []).filter((l) => !q || l.path.includes(q.toLowerCase())), [sample, q]);

  const pickLeaf = (path: string) => {
    if (active) {
      setter(active)(path);
      setHintText(`inserted ${path}`);
      window.setTimeout(() => setHintText(""), 1800);
    } else {
      navigator.clipboard?.writeText(path).catch(() => undefined);
    }
  };

  return (
    <Section id="mappings" title="Field mappings" hint="Map your API's product JSON onto canonical fields. Fetch a sample, then click a value on the right to insert its JSON path into the selected field.">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 22 }} className="mapgrid">
        <div>
          {groups.map((g) => (
            <div key={g.title} style={{ marginBottom: 6 }}>
              <div className="eyebrow" style={{ margin: "12px 0 6px" }}>{g.title}</div>
              {g.rows.map((r) => (
                <MapRow key={r.path} label={r.label} value={(getAt(cfg, r.path) as string) ?? ""} onValue={(v) => setter(r.path)(v)} onFocus={() => setActive(r.path)} isActive={active === r.path} />
              ))}
            </div>
          ))}
          <div className="eyebrow" style={{ margin: "12px 0 6px" }}>Money</div>
          {moneyGroups.map((m) => {
            const mb = bindMoney(m.path);
            return (
              <div key={m.path} className="row" style={{ marginBottom: 8 }}>
                <button className={`btn small ghost ${active === `${m.path}.path` ? "danger" : ""}`} onClick={() => setActive(active === `${m.path}.path` ? null : `${m.path}.path`)}><IconTarget size={12} /> {m.label}</button>
                <input className="mono grow" value={mb.p} placeholder="$.price.path" onChange={(e) => mb.setPath(e.target.value)} onFocus={() => setActive(`${m.path}.path`)} />
                <select style={{ width: 90 }} value={mb.unit} onChange={(e) => mb.setUnit(e.target.value)}>
                  <option value="major">major</option>
                  <option value="minor">minor</option>
                </select>
              </div>
            );
          })}
          <div className="hint muted" style={{ marginTop: 8 }}>
            {active ? <>Insert target: <span className="mono">{active}</span></> : "Click the ◉ on a row to make it the insert target."}
            {hintText && <> · <span style={{ color: "var(--ok)" }}>{hintText}</span></>}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="panel" style={{ padding: 14 }}>
            <div className="row">
              <input className="grow mono" placeholder="GET a sample product URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <input className="mono" style={{ width: 150 }} placeholder="bearer (opt)" value={bearer} onChange={(e) => setBearer(e.target.value)} />
              <button className="btn primary small" disabled={saving} onClick={async () => { setSaving(true); setSample(null); try { setSample(await apiJson.sample(url, bearer)); } catch (e) { setSample({ ok: false, error: String(e) }); } finally { setSaving(false); } }}>
                {saving ? "…" : "Fetch"}
              </button>
            </div>
            {sample?.ok === false && <Err>{sample.error ?? "fetch failed"}</Err>}
            {sample?.ok && (
              <>
                <div className="row" style={{ marginTop: 10 }}>
                  <span className="badge on">HTTP {sample.status}</span>
                  <input className="grow" placeholder="filter paths…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="chiprow" style={{ marginTop: 10, maxHeight: 260, overflow: "auto" }}>
                  {leaves.map((l) => (
                    <button key={l.path} className="chip leaf" onClick={() => pickLeaf(l.path)} title={l.path}><span style={{ color: "var(--accent)" }}>{l.path.slice(0, 28)}{l.path.length > 28 ? "…" : ""}</span> → {l.sample}</button>
                  ))}
                </div>
              </>
            )}
            {sample?.ok && leaves.length === 0 && <div className="hint muted">No leaf values to map — check the sample URL returned JSON.</div>}
          </div>
        </div>
      </div>
    </Section>
  );
}

function MapRow({ label, value, onValue, onFocus, isActive }: { label: string; value: string; onValue: (v: string) => void; onFocus: () => void; isActive: boolean }) {
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <button className={`btn small ghost ${isActive ? "danger" : ""}`} style={{ minWidth: 150, justifyContent: "flex-start" }} onClick={onFocus}><IconTarget size={12} /> {label}</button>
      <input className="mono grow" value={value} placeholder="$.field" onChange={(e) => onValue(e.target.value)} onFocus={onFocus} />
    </div>
  );
}

/* ---------------- review / test / run / audit ---------------- */
function Review({ cfg, save }: { cfg: Record<string, unknown>; save: () => void }) {
  const [errors, setErrors] = useState<string[] | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const validate = async () => {
    try {
      const r = await apiJson.validate(cfg);
      setErrors(r.errors);
      setValid(r.ok);
    } catch {
      setValid(false);
      setErrors(["validation endpoint unavailable"]);
    }
  };
  return (
    <>
      <pre className="json" style={{ maxHeight: 260 }}>{JSON.stringify(cfg, null, 2)}</pre>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={validate}>Validate</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
      {valid === true && <Ok>✓ Config is valid</Ok>}
      {valid === false && errors && <Err>{errors.join("\n")}</Err>}
    </>
  );
}

function TestSection({ id: _id }: { id: string }) {
  const [mode, setMode] = useState<"fixture" | "live">("fixture");
  const [result, setResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true); setErr("");
    try {
      setResult(await apiJson.testMerchant({}, mode === "fixture"));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section id="test" title="Test the integration" hint="Smoke-test search → product → live offer, offline (Luna & Co fixture) or against this store.">
      <div className="row">
        <select style={{ width: 260 }} value={mode} onChange={(e) => setMode(e.target.value as "fixture" | "live")}>
          <option value="fixture">Luna & Co fixture (offline)</option>
          <option value="live">This merchant (live)</option>
        </select>
        <button className="btn primary" disabled={busy} onClick={run}><IconPlay /> Run test</button>
      </div>
      {err && <div className="errbox" style={{ marginTop: 10 }}>{err}</div>}
      {result && !result.ok && <div className="errbox" style={{ marginTop: 10 }}>[{result.error?.code}] {result.error?.message}</div>}
      {result?.ok && (
        <>
          <div className="row" style={{ margin: "12px 0" }}>
            <span className="badge on">search {result.search?.total}</span>
            {result.product && <span className="badge on">{result.product.title}</span>}
            {result.offer?.price && <span className="badge on">{money(result.offer.price.amount)} · {result.offer.availability?.status}</span>}
          </div>
          {result.capabilities && (
            <table className="tbl">
              <thead><tr><th>Capability</th><th /></tr></thead>
              <tbody>{Object.entries(result.capabilities).map(([k, on]) => <tr key={k}><td className="mono">{k}</td><td><span className={`badge ${on ? "on" : "off"}`}>{on ? "on" : "off"}</span></td></tr>)}</tbody>
            </table>
          )}
          {result.search && result.search.items.length > 0 && (
            <>
              <h3 className="sec" style={{ marginTop: 14 }}>Sample rows</h3>
              <table className="tbl">
                <thead><tr><th>id</th><th>title</th><th>price from</th></tr></thead>
                <tbody>{result.search.items.map((i) => <tr key={i.id}><td className="mono">{i.id}</td><td>{i.title}</td><td>{money(i.priceFrom?.amount)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </>
      )}
    </Section>
  );
}

function RunSection({ id, auditPathHint }: { id: string; auditPathHint: string }) {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [kind, setKind] = useState<"rest" | "mock">("rest");
  const [port, setPort] = useState("");
  const [base, setBase] = useState("");
  const [keys, setKeys] = useState(false);
  const [kp, setKp] = useState({ k: "", s: "" });
  const [err, setErr] = useState("");
  const [copy, copied] = useClipboard();

  const refresh = useCallback(async () => {
    try {
      const s = await apiJson.gatewayStatus();
      setStatus(s);
      setLogs(await apiJson.gatewayLogs());
      if (s.running) setReadiness(await apiJson.readiness());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void refresh();
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
        ...(base ? { baseUrl: base } : {}),
        ...(kp.k && kp.s ? { razorpay: { keyId: kp.k, keySecret: kp.s } } : {}),
      });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <Section id="run" title="Run locally" hint="Start the gateway for this merchant as a child process. Add Razorpay test keys to enable payments.">
      <div className="row">
        <select style={{ width: 250 }} value={kind} onChange={(e) => setKind(e.target.value as "rest" | "mock")}>
          <option value="rest">This merchant (saved config)</option>
          <option value="mock">Demo mock merchant</option>
        </select>
        <input className="mono" style={{ width: 130 }} placeholder="port" value={port} onChange={(e) => setPort(e.target.value)} />
        <input className="mono grow" placeholder="base URL e.g. http://localhost:8787" value={base} onChange={(e) => setBase(e.target.value)} />
        <button className="btn primary" onClick={start}><IconPlay /> Start</button>
        <button className="btn danger" onClick={async () => { await apiJson.gatewayStop(); await refresh(); }}><IconStop /> Stop</button>
      </div>
      {err && <div className="errbox" style={{ marginTop: 8 }}>{err}</div>}
      <div className="row" style={{ marginTop: 12 }}>
        <StatusPill running={status?.running ?? false} port={status?.port} baseUrl={status?.baseUrl} lastError={status?.lastError} />
        {status?.baseUrl && (
          <>
            <CopyChip text={status.baseUrl} label={status.baseUrl} />
            <a href={`${status.baseUrl}/.well-known/ucp`} target="_blank" rel="noreferrer">ucp</a>
            <a href={`${status.baseUrl}/agents.md`} target="_blank" rel="noreferrer">agents.md</a>
            <a href={`${status.baseUrl}/llms.txt`} target="_blank" rel="noreferrer">llms.txt</a>
          </>
        )}
      </div>
      <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setKeys(!keys)}>{keys ? "Hide" : "Payment keys"} (Razorpay test)</button>
      {keys && (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="mono grow" placeholder="RAZORPAY_KEY_ID" value={kp.k} onChange={(e) => setKp({ ...kp, k: e.target.value })} />
          <input className="mono grow" type="password" placeholder="RAZORPAY_KEY_SECRET" value={kp.s} onChange={(e) => setKp({ ...kp, s: e.target.value })} />
        </div>
      )}
      {readiness?.running && readiness.capabilities && (
        <>
          <h3 className="sec" style={{ marginTop: 14 }}>Agent readiness</h3>
          <div className="chiprow">
            {readiness.capabilities.map((c) => <span key={c.id} className={`badge ${c.on ? "on" : "off"}`}>{c.label}</span>)}
            <span className={`badge ${readiness.payment ? "on" : "off"}`}>Payment</span>
          </div>
        </>
      )}
      <h3 className="sec" style={{ marginTop: 14 }}>Logs</h3>
      <div className="logbox">
        {logs.map((l, i) => {
          const cls = l.includes("error") || l.toLowerCase().includes("failed") ? "err" : l.startsWith("[gateway]") || l.startsWith("[dashboard]") ? "" : "dim";
          return <div key={i} className={cls}>{l}</div>;
        })}
      </div>
    </Section>
  );
}

function AuditSection() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [checkout, setCheckout] = useState("");
  const [type, setType] = useState("");
  const [copy, copied] = useClipboard();
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (checkout) p.set("checkoutId", checkout);
    if (type) p.set("type", type);
    p.set("limit", "300");
    setRows(await apiJson.audit(p.toString()));
  }, [checkout, type]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Section id="audit" title="Audit trail" hint="Explainable · bounded · gated — every money action with amounts, approval state and rationale.">
      <div className="row">
        <input className="mono grow" placeholder="checkoutId filter" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
        <input className="mono" placeholder="event type" value={type} onChange={(e) => setType(e.target.value)} />
        <button className="btn" onClick={() => void load()}><IconRefresh /></button>
      </div>
      {rows === null ? <div style={{ marginTop: 12 }}><Skeleton lines={4} /></div> : (
        <div style={{ marginTop: 8 }}>
          {rows.length === 0 && <Empty title="No audit events yet" body="Run a checkout flow (Cart → Checkout → complete) then refresh." />}
          {rows.length > 0 && (
            <table className="tbl">
              <thead><tr><th>time</th><th>event</th><th>amount</th><th>approval</th><th>explanation</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const granted = r.approval?.granted ?? r.approval?.received;
                  const tone = r.reasonCode ? (r.reasonCode === "PRICE_CHANGED" ? "warn" : "err") : r.event.includes("completed") ? "on" : "off";
                  return (
                    <tr key={i}>
                      <td className="mono muted">{r.timestamp.slice(11, 19)}</td>
                      <td><span className={`badge ${tone}`}>{r.event}{r.reasonCode ? ` · ${r.reasonCode}` : ""}</span></td>
                      <td>{r.amount !== undefined ? money(r.amount) : "-"}</td>
                      <td>{r.approval ? (granted ? "✓ granted" : r.approval.required ? "required" : "n/a") : "-"}</td>
                      <td className="muted" style={{ maxWidth: 360 }}>{r.explanation ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Section>
  );
}
