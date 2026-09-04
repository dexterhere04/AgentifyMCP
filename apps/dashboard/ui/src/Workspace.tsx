import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson, type AuditRow, type GatewayStatus, type Readiness, type SampleResult, type TestResult } from "./api";
import {
  IconArrowLeft, IconArrowRight, IconBook, IconCheck, IconExternal, IconPlay, IconRefresh,
  IconRun, IconServer, IconStop, IconTarget, IconTrash,
} from "./icons";
import { Empty, Err, Field, Ok, Skeleton, Spinner, StatusPill, getAt, setAt, useClipboard } from "./ui";

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

const CONFIG_STEPS = ["identity", "connection", "endpoints", "mappings"];

export function Workspace({ id, onBack, onDeleted, onName }: { id: string; onBack: () => void; onDeleted: () => void; onName?: (n: string) => void }) {
  const [cfg, setCfg] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState({ name: id });
  const [toast, setToast] = useState<{ t: "ok" | "err"; m: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [activeStep, setActiveStep] = useState("identity");
  const [confirmDel, setConfirmDel] = useState(false);
  const [savedJson, setSavedJson] = useState("");

  const dirty = JSON.stringify(cfg) !== savedJson;

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
      setSavedJson(JSON.stringify(c));
      setJsonText(JSON.stringify(c, null, 2));
      const name = (c.merchant as { name?: string })?.name ?? id;
      setMeta({ name });
      onName?.(name);
    } catch (e) {
      notify("err", String(e));
    } finally {
      setLoaded(true);
    }
  }, [id, notify, onName]);

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
      onName?.(r.merchant.name);
      setSavedJson(JSON.stringify(cfg));
      notify("ok", `Saved ${r.merchant.name}`);
    } catch (e) {
      notify("err", String(e));
    }
  }, [cfg, id, notify, onName]);

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

  /* scroll-spy: track the section currently in view */
  useEffect(() => {
    const el = document.querySelector(".main");
    if (!el) return;
    const onScroll = () => {
      let current = STEP[0].id;
      for (const s of STEP) {
        const node = document.getElementById(`sec-${s.id}`);
        if (node && node.getBoundingClientRect().top < 150) current = s.id;
      }
      setActiveStep(current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setCfg(parsed);
      notify("ok", "Config applied from JSON");
    } catch {
      notify("err", "Invalid JSON — not applied");
    }
  };

  /* completion for the four config steps */
  const isDone = (s: string): boolean => {
    switch (s) {
      case "identity": return Boolean((getAt(cfg, "merchant.name") as string)?.trim());
      case "connection": return Boolean((getAt(cfg, "http.baseUrl") as string)?.trim());
      case "endpoints": return Boolean((getAt(cfg, "catalog.search.path") as string)?.trim());
      case "mappings": return Boolean((getAt(cfg, "mappings.product.id") as string)?.trim());
      default: return false;
    }
  };
  const doneCount = CONFIG_STEPS.filter(isDone).length;

  const idx = STEP.findIndex((s) => s.id === activeStep);
  const prevStep = idx > 0 ? STEP[idx - 1] : null;
  const nextStep = idx < STEP.length - 1 ? STEP[idx + 1] : null;

  const doDelete = async () => {
    await apiJson.remove(id);
    onDeleted();
  };

  if (!loaded) return <div className="content"><div className="panel pad"><Skeleton lines={6} /></div></div>;

  return (
    <div className="content">
      {/* header */}
      <div className="reveal" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="eyebrow">Merchant</div>
          <h1 className="page" style={{ marginTop: 6 }}>{meta.name}</h1>
          <div className="row" style={{ marginTop: 8, gap: 12 }}>
            <span className="kicker mono">{id}</span>
            {dirty ? (
              <span className="badge warn"><span className="dot" style={{ background: "var(--warn)" }} /> Unsaved changes</span>
            ) : (
              <span className="kicker">All changes saved</span>
            )}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setDrawer(true)}>JSON</button>
          <button className="btn primary" onClick={save} disabled={!dirty}>
            {dirty ? <><IconCheck size={15} /> Save</> : <><IconCheck size={15} /> Saved</>}
            <span className="kbd">⌘S</span>
          </button>
          {confirmDel ? (
            <>
              <button className="btn danger" onClick={() => void doDelete()}>Confirm delete</button>
              <button className="btn ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn danger" onClick={() => setConfirmDel(true)}><IconTrash size={14} /> Delete</button>
          )}
        </div>
      </div>

      {/* progress + stepper rail */}
      <div className="row reveal-1" style={{ marginTop: 20, gap: 14 }}>
        <div className="progressline grow">
          <span className="timenote">Setup</span>
          <div className="progressbar"><div style={{ width: `${(doneCount / CONFIG_STEPS.length) * 100}%` }} /></div>
          <span className="timenote">{doneCount} / {CONFIG_STEPS.length} configured</span>
        </div>
      </div>

      <div className="rail reveal-1" style={{ marginTop: 12, position: "sticky", top: 60, zIndex: 15 }}>
        {STEP.map((s, i) => (
          <button
            key={s.id}
            className={`step ${activeStep === s.id ? "active" : ""} ${isDone(s.id) ? "done" : ""}`}
            onClick={() => goto(s.id)}
          >
            <span className="stepnum">{isDone(s.id) ? <IconCheck size={12} /> : `0${i + 1}`}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <Section id="identity" num="01" title="Store identity" hint="Who the store is — shown to agents and in UCP metadata.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "0 18px" }}>
          <Field label="Merchant id"><input className="mono" value={bind("id").value} onChange={(e) => bind("id").set(e.target.value)} /></Field>
          <Field label="Name"><input value={bind("merchant.name").value} onChange={(e) => bind("merchant.name").set(e.target.value)} /></Field>
          <Field label="Default currency"><input className="mono" maxLength={3} value={bind("merchant.defaultCurrency").value} onChange={(e) => bind("merchant.defaultCurrency").set(e.target.value.toUpperCase())} /></Field>
          <Field label="Store URL"><input value={bind("merchant.url").value} onChange={(e) => bind("merchant.url").set(e.target.value)} /></Field>
          <Field label="Description"><input value={(getAt(cfg, "merchant.description") as string) ?? ""} onChange={(e) => setCfg((c) => setAt(c, "merchant.description", e.target.value))} /></Field>
        </div>
      </Section>

      <Section id="connection" num="02" title="Connection" hint="How the gateway reaches your store's API.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "0 18px" }}>
          <Field label="API base URL"><input className="mono" placeholder="https://api.your-store.example" value={bind("http.baseUrl").value} onChange={(e) => bind("http.baseUrl").set(e.target.value)} /></Field>
          <Field label="Timeout (ms)"><input className="mono" type="number" value={(getAt(cfg, "http.timeoutMs") as number | undefined) ?? 3000} onChange={(e) => setCfg((c) => setAt(c, "http.timeoutMs", Number(e.target.value)))} /></Field>
        </div>
        <div className="divider" />
        <div className="eyebrow" style={{ marginBottom: 8 }}>Authentication</div>
        <div className="seg">
          {(["none", "bearer", "apiKey"] as const).map((t) => (
            <button key={t} className={(getAt(cfg, "http.auth.type") ?? "none") === t ? "active" : ""} onClick={() => setCfg((c) => setAt(c, "http.auth", t === "none" ? { type: "none" } : { ...((c.http as { auth?: object })?.auth as object | undefined), type: t }))}>
              {t === "apiKey" ? "API key" : t}
            </button>
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

      <Section id="endpoints" num="03" title="Endpoints" hint="Where the catalog lives. Use {productId}/{variantId} placeholders.">
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

      <MappingSection cfg={cfg} setCfg={setCfg} bindMoney={bindMoney} />

      <Section id="review" num="05" title="Review & validate" hint="The config is validated against the merchant-config schema before saving.">
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

      {/* prev / next */}
      <div className="row" style={{ marginTop: 20, justifyContent: "space-between" }}>
        {prevStep ? (
          <button className="btn" onClick={() => goto(prevStep.id)}><IconArrowLeft size={15} /> {prevStep.label}</button>
        ) : <span />}
        {nextStep ? (
          <button className="btn primary" onClick={() => goto(nextStep.id)}>{nextStep.label} <IconArrowRight size={15} /></button>
        ) : (
          <button className="btn soft" onClick={onBack}>Done</button>
        )}
      </div>

      {toast && <div className={`toast ${toast.t}`}>{toast.m}</div>}
    </div>
  );
}

function Section({ id, num, title, hint, children }: { id: string; num: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div id={`sec-${id}`} className="panel pad reveal" style={{ marginTop: 14 }}>
      <h2 className="sec"><span className="secnum">{num}</span>{title}</h2>
      {hint && <p className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>{hint}</p>}
      <div className="divider" />
      {children}
    </div>
  );
}

/* ---------------- mappings + click-to-map ---------------- */
type MoneyBinder = (path: string) => { p: string; unit: string; setPath: (v: string) => void; setUnit: (v: string) => void };

const RadioRing = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
    <circle cx="12" cy="12" r="5.5" />
  </svg>
);

function JsonLeaf({ path, value, q, onPick }: { path: string; value: string; q: string; onPick: (path: string) => void }) {
  const needle = q.trim().toLowerCase();
  const dim = needle !== "" && !path.toLowerCase().includes(needle);
  return (
    <button className={`leafrow${dim ? " dim" : ""}`} onClick={() => onPick(path)} title={`${path} → ${value}`}>
      <span className="leafval">
        {value}
        <span className="glyph"><IconExternal size={10} /></span>
      </span>
    </button>
  );
}

/* Render a parsed payload as a tactile JSON document. Arrays are represented by
   their first element (mirroring the server's leaf flattener), and every scalar
   is a clickable chip that can insert its JSON path into the armed mapping row. */
function jsonTreeLines(
  body: unknown,
  q: string,
  onPick: (path: string) => void,
  out: Array<{ i: number; node: React.ReactNode }>,
): void {
  const needle = q.trim().toLowerCase();
  const push = (i: number, node: React.ReactNode) => out.push({ i, node });
  const keyOf = (keys: string[]) => keys[keys.length - 1] ?? "";
  const fmt = (v: unknown) => (typeof v === "string" ? `"${v}"` : String(v));
  const inNeedle = (keys: string[]) => (keys.length ? `.${keys.join(".")}` : "$").toLowerCase().includes(needle);

  const hasAny = (v: unknown, keys: string[]): boolean => {
    if (needle === "") return true;
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length ? hasAny(v[0], keys) : false;
    if (typeof v === "object") return Object.entries(v as Record<string, unknown>).some(([k, val]) => hasAny(val, [...keys, k]));
    return inNeedle(keys);
  };

  const walk = (v: unknown, keys: string[], depth: number, keyed: boolean): boolean => {
    if (needle !== "" && !hasAny(v, keys)) return false;

    if (Array.isArray(v)) {
      if (v.length === 0) {
        push(depth, keyed ? <span><span className="jkey">"{keyOf(keys)}":</span> []</span> : <span>[]</span>);
        return true;
      }
      push(depth, <span>{keyed ? <span className="jkey">"{keyOf(keys)}":</span> : null}[</span>);
      const first = v[0];
      if (first !== null && typeof first === "object" && !Array.isArray(first)) {
        push(depth + 1, <span className="jopen">{`{`}</span>);
        for (const [k, val] of Object.entries(first as Record<string, unknown>)) walk(val, [...keys, k], depth + 2, true);
        push(depth + 1, <span className="jopen">{`}`}</span>);
      } else if (first !== undefined) {
        walk(first, keys, depth + 1, false);
      }
      push(depth, <span className="jopen">]</span>);
      return true;
    }

    if (v !== null && typeof v === "object") {
      push(depth, <span>{keyed ? <span className="jkey">"{keyOf(keys)}":</span> : null}{`{`}</span>);
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) walk(val, [...keys, k], depth + 1, true);
      push(depth, <span className="jopen">{`}`}</span>);
      return true;
    }

    const p = keys.length ? `.${keys.join(".")}` : "$";
    if (keyed) {
      push(depth, (
        <span>
          <span className="jkey">"{keyOf(keys)}":</span>{" "}
          <JsonLeaf path={p} value={fmt(v)} q={q} onPick={onPick} />
        </span>
      ));
    } else {
      push(depth, <JsonLeaf path={p} value={fmt(v)} q={q} onPick={onPick} />);
    }
    return true;
  };

  walk(body, [], 0, false);
}

function MappingSection({
  cfg, setCfg, bindMoney,
}: { cfg: Record<string, unknown>; setCfg: (fn: (c: Record<string, unknown>) => Record<string, unknown>) => void; bindMoney: MoneyBinder }) {
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [url, setUrl] = useState("");
  const [bearer, setBearer] = useState("");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hintText, setHintText] = useState("");
  const [copiedText, setCopiedText] = useState("");

  const setter = (path: string) => (v: string) => setCfg((c) => setAt(c, path, v));

  const groups: Array<{ title: string; rows: Array<{ label: string; path: string }> }> = [
    {
      title: "Product entity",
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
        { label: "Variants array", path: "mappings.product.variants.path" },
        { label: "Variant id", path: "mappings.product.variants.each.id" },
        { label: "SKU", path: "mappings.product.variants.each.sku" },
        { label: "Availability", path: "mappings.product.variants.each.availability.path" },
      ],
    },
    {
      title: "Offer",
      rows: [
        { label: "Variant id", path: "mappings.offer.id" },
        { label: "Product id", path: "mappings.offer.productId" },
        { label: "SKU", path: "mappings.offer.sku" },
        { label: "Product title", path: "mappings.offer.productTitle" },
        { label: "Availability", path: "mappings.offer.availability.path" },
      ],
    },
  ];
  const moneyGroups: Array<{ label: string; path: string }> = [
    { label: "List price", path: "mappings.product.variants.each.listPrice" },
    { label: "Sale price", path: "mappings.product.variants.each.salePrice" },
    { label: "Offer list price", path: "mappings.offer.listPrice" },
    { label: "Offer sale price", path: "mappings.offer.salePrice" },
  ];

  const arm = (path: string) => setActive((a) => (a === path ? null : path));

  const pickLeaf = (path: string) => {
    if (active) {
      setter(active)(path);
      setHintText(path);
      window.setTimeout(() => setHintText(""), 2200);
    } else {
      navigator.clipboard?.writeText(path).catch(() => undefined);
      setCopiedText(path);
      window.setTimeout(() => setCopiedText(""), 1600);
    }
  };

  const fetchedBody = sample?.ok === true && sample.body !== null && typeof sample.body === "object" ? (sample.body as object) : undefined;
  const treeRows: Array<{ i: number; node: React.ReactNode }> = [];
  if (fetchedBody) jsonTreeLines(fetchedBody, q, pickLeaf, treeRows);

  const moneyRow = (m: { label: string; path: string }) => {
    const armed = active === `${m.path}.path`;
    const mb = bindMoney(m.path);
    return (
      <div className={`mrow${armed ? " armed" : ""}`} key={m.path}>
        <button className="mradio" title={armed ? "Clear insert target" : "Set insert target"} onClick={() => arm(`${m.path}.path`)}>
          {armed ? <IconTarget size={14} /> : <RadioRing />}
        </button>
        <span className="mkey">{m.label}</span>
        <span className="marrow">→</span>
        <span className="mval">
          <input className="mchip" value={mb.p} placeholder="$.price.path" onChange={(e) => mb.setPath(e.target.value)} onFocus={() => setActive(`${m.path}.path`)} />
        </span>
        <div className="munit">
          <select value={mb.unit} onChange={(e) => mb.setUnit(e.target.value)}>
            <option value="major">major</option>
            <option value="minor">minor</option>
          </select>
        </div>
      </div>
    );
  };

  return (
    <Section id="mappings" num="04" title="Field mappings" hint="Map your API's product JSON onto canonical fields. Arm a row, then click a value in the fetched payload to insert its JSON path.">
      <div className="mapstage">
        <div className="map-col left">
          {groups.map((g) => {
            const groupActive = active !== null && g.rows.some((r) => r.path === active);
            return (
              <div className="mapgrp" key={g.title}>
                <div className="maplabel"><span className="mdot" />{g.title}</div>
                {g.rows.map((r) => {
                  const armed = active === r.path;
                  return (
                    <div className={`mrow${armed ? " armed" : ""}`} key={r.path}>
                      <button className="mradio" title={armed ? "Clear insert target" : "Set insert target"} onClick={() => arm(r.path)}>
                        {armed ? <IconTarget size={14} /> : <RadioRing />}
                      </button>
                      <span className="mkey">{r.label}</span>
                      <span className="marrow">→</span>
                      <span className="mval">
                        <input
                          className="mchip"
                          value={(getAt(cfg, r.path) as string | undefined) ?? ""}
                          placeholder="$.field"
                          onChange={(e) => setter(r.path)(e.target.value)}
                          onFocus={() => setActive(r.path)}
                        />
                      </span>
                    </div>
                  );
                })}
                {groupActive && (
                  <div className="armedhint">
                    INSERT TARGET: {active}
                    {hintText && <> · inserted {hintText}</>}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mapgrp">
            <div className="maplabel"><span className="mdot" />Money</div>
            {moneyGroups.map(moneyRow)}
            {active && moneyGroups.some((m) => `${m.path}.path` === active) && (
              <div className="armedhint">
                INSERT TARGET: {active}
                {hintText && <> · inserted {hintText}</>}
              </div>
            )}
          </div>

          <div className="mapfoot">
            {active ? (
              <>Insert target: <b className="mono">{active}</b> — click a value chip on the right to write its JSON path into the field.</>
            ) : (
              <>Select a row&apos;s <b>◌</b> to make it the insert target, then tap a value chip on the right — or click any chip to copy its JSON path.</>
            )}
          </div>
        </div>

        <div className="map-col right">
          <div className="samplehead">
            <span className="t">Fetch sample payload</span>
            {sample?.ok ? (
              <span className="badge on">HTTP {sample.status}</span>
            ) : sample?.ok === false ? (
              <span className="badge err">failed</span>
            ) : null}
          </div>
          <div className="fetchrow">
            <input className="mono" placeholder="GET a sample product URL" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input className="mono bearer" placeholder="bearer (opt)" value={bearer} onChange={(e) => setBearer(e.target.value)} />
            <button
              className="btn primary small"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setSample(null);
                setCopiedText("");
                try {
                  setSample(await apiJson.sample(url, bearer));
                } catch (e) {
                  setSample({ ok: false, error: String(e) });
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Spinner size={13} /> : "Fetch"}
            </button>
          </div>

          {sample?.ok === false && (
            <div style={{ marginBottom: 10 }}>
              <Err>{sample.error ?? "fetch failed"}</Err>
            </div>
          )}

          {sample?.ok && sample.body !== null && typeof sample.body !== "object" && (
            <div className="maptree">
              <div className="treerow dim">{String(sample.body)}</div>
            </div>
          )}

          {sample?.ok && fetchedBody && (
            <>
              <div className="treefilter">
                <input className="mono" placeholder="filter json paths…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="maptree">
                {q.trim() && treeRows.length === 0 ? (
                  <div className="treerow dim">no matching fields</div>
                ) : (
                  treeRows.map((r, i) => (
                    <div key={i} className="treerow" style={{ paddingLeft: r.i * 16 }}>
                      {r.node}
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {!sample && (
            <div className="maptree">
              <div className="treerow dim">{"{  }  —  fetch a product payload to map its fields"}</div>
            </div>
          )}

          {copiedText && <div className="mapfoot" style={{ color: "var(--ok)" }}>copied {copiedText}</div>}
        </div>
      </div>
    </Section>
  );
}

/* ---------------- review / test / run / audit ---------------- */
function Review({ cfg, save }: { cfg: Record<string, unknown>; save: () => void }) {
  const [errors, setErrors] = useState<string[] | null>(null);
  const [valid, setValid] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const validate = async () => {
    setBusy(true);
    try {
      const r = await apiJson.validate(cfg);
      setErrors(r.errors);
      setValid(r.ok);
    } catch {
      setValid(false);
      setErrors(["validation endpoint unavailable"]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <pre className="json" style={{ maxHeight: 260 }}>{JSON.stringify(cfg, null, 2)}</pre>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={validate} disabled={busy}>{busy ? <Spinner size={13} /> : "Validate"}</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
      {valid === true && <div style={{ marginTop: 10 }}><Ok>✓ Config is valid</Ok></div>}
      {valid === false && errors && <div style={{ marginTop: 10 }}><Err>{errors.join("\n")}</Err></div>}
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
    <Section id="test" num="06" title="Test the integration" hint="Smoke-test search → product → live offer, offline (Luna & Co fixture) or against this store.">
      <div className="row">
        <select style={{ width: 260 }} value={mode} onChange={(e) => setMode(e.target.value as "fixture" | "live")}>
          <option value="fixture">Luna & Co fixture (offline)</option>
          <option value="live">This merchant (live)</option>
        </select>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? <Spinner size={13} /> : <IconPlay size={14} />} Run test</button>
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
                <tbody>{result.search.items.map((i) => <tr key={i.id}><td className="mono">{i.id}</td><td>{i.title}</td><td className="num">{money(i.priceFrom?.amount)}</td></tr>)}</tbody>
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
  const [starting, setStarting] = useState(false);
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
    setStarting(true);
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
    } finally {
      setStarting(false);
    }
  };

  return (
    <Section id="run" num="07" title="Run locally" hint="Start the gateway for this merchant as a child process. Add Razorpay test keys to enable payments.">
      <div className="row">
        <select style={{ width: 250 }} value={kind} onChange={(e) => setKind(e.target.value as "rest" | "mock")}>
          <option value="rest">This merchant (saved config)</option>
          <option value="mock">Demo mock merchant</option>
        </select>
        <input className="mono" style={{ width: 130 }} placeholder="port" value={port} onChange={(e) => setPort(e.target.value)} />
        <input className="mono grow" placeholder="base URL e.g. http://localhost:8787" value={base} onChange={(e) => setBase(e.target.value)} />
        <button className="btn primary" onClick={start} disabled={starting}>{starting ? <Spinner size={13} /> : <IconPlay size={14} />} Start</button>
        <button className="btn danger" onClick={async () => { await apiJson.gatewayStop(); await refresh(); }}><IconStop size={14} /> Stop</button>
      </div>
      {err && <div className="errbox" style={{ marginTop: 8 }}>{err}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <StatusPill running={status?.running ?? false} port={status?.port} baseUrl={status?.baseUrl} lastError={status?.lastError} />
        {status?.baseUrl && (
          <>
            <button className="chip" onClick={() => copy(status.baseUrl!)} title="Copy base URL">{copied ? "✓ copied" : status.baseUrl}</button>
            <a className="chip" href={`${status.baseUrl}/.well-known/ucp`} target="_blank" rel="noreferrer">ucp <IconExternal size={12} /></a>
            <a className="chip" href={`${status.baseUrl}/agents.md`} target="_blank" rel="noreferrer">agents.md <IconExternal size={12} /></a>
            <a className="chip" href={`${status.baseUrl}/llms.txt`} target="_blank" rel="noreferrer">llms.txt <IconExternal size={12} /></a>
          </>
        )}
      </div>
      <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setKeys(!keys)}>{keys ? "Hide payment keys" : "Payment keys (Razorpay test)"}</button>
      {keys && (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="mono grow" placeholder="RAZORPAY_KEY_ID" value={kp.k} onChange={(e) => setKp({ ...kp, k: e.target.value })} />
          <input className="mono grow" type="password" placeholder="RAZORPAY_KEY_SECRET" value={kp.s} onChange={(e) => setKp({ ...kp, s: e.target.value })} />
        </div>
      )}
      {readiness?.running && readiness.capabilities && (
        <>
          <h3 className="sec" style={{ marginTop: 16 }}>Agent readiness</h3>
          <div className="chiprow">
            {readiness.capabilities.map((c) => <span key={c.id} className={`badge ${c.on ? "on" : "off"}`}>{c.label}</span>)}
            <span className={`badge ${readiness.payment ? "on" : "off"}`}>Payment</span>
          </div>
        </>
      )}
      <h3 className="sec" style={{ marginTop: 16 }}>Logs</h3>
      <div className="logbox">
        {logs.length === 0 && <span className="dim">— gateway not started —</span>}
        {logs.map((l, i) => {
          const cls = l.includes("error") || l.toLowerCase().includes("failed") ? "err" : l.startsWith("[gateway]") || l.startsWith("[dashboard]") ? "hl" : "dim";
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
  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (checkout) p.set("checkoutId", checkout);
    if (type) p.set("type", type);
    p.set("limit", "300");
    setRows(await apiJson.audit(p.toString()));
  }, [checkout, type]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Section id="audit" num="08" title="Audit trail" hint="Explainable · bounded · gated — every money action with amounts, approval state and rationale.">
      <div className="row">
        <input className="mono grow" placeholder="checkoutId filter" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
        <input className="mono" style={{ width: 180 }} placeholder="event type" value={type} onChange={(e) => setType(e.target.value)} />
        <button className="btn" onClick={() => void load()}><IconRefresh size={14} /> Refresh</button>
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
                      <td className="mono muted num">{r.timestamp.slice(11, 19)}</td>
                      <td><span className={`badge ${tone}`}>{r.event}{r.reasonCode ? ` · ${r.reasonCode}` : ""}</span></td>
                      <td className="num">{r.amount !== undefined ? money(r.amount) : "-"}</td>
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
