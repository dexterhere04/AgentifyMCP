import { useCallback, useEffect, useState } from "react";
import { apiJson, type GatewayStatus, type MerchantSummary, type Readiness } from "./api";
import { IconChev, IconExternal, IconLayers, IconPlay, IconPlus, IconRefresh, IconSliders, IconStop, IconStore, IconTrash } from "./icons";
import { Empty, Skeleton, Spinner, StatusPill, timeAgo, useClipboard } from "./ui";

function MerchantState({ live, state }: { live: boolean; state?: "draft" | "ready" }) {
  if (live) {
    return (
      <span className="mstate live">
        <span className="dot pulse" /> LIVE
      </span>
    );
  }
  if (state === "draft") {
    return (
      <span className="mstate cfg">
        <span className="dot" /> CONFIG
      </span>
    );
  }
  return (
    <span className="mstate ok">
      <span className="dot" /> READY
    </span>
  );
}

export function Overview({ onOpen, onNew, onLandscape }: { onOpen: (id: string) => void; onNew: () => void; onLandscape: (id: string) => void }) {
  const [merchants, setMerchants] = useState<MerchantSummary[] | null>(null);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setErr("");
    apiJson.merchants().then(setMerchants).catch((e) => setErr(String(e)));
    apiJson.gatewayStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    const t = setInterval(() => {
      apiJson.gatewayStatus().then(setStatus).catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const runMock = async () => {
    setErr("");
    try {
      setStatus(await apiJson.gatewayStart({ kind: "mock" }));
    } catch (e) {
      setErr(String(e));
    }
  };

  const bootDemoRest = useCallback(async () => {
    setErr("");
    try {
      const r = await apiJson.demoRestBoot();
      if (r.gateway) setStatus(r.gateway);
      apiJson.merchants().then(setMerchants).catch(() => undefined);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  const remove = async (id: string) => {
    await apiJson.remove(id);
    setConfirmId(null);
    refresh();
  };

  const liveId = status?.running && status.kind === "rest" ? status.merchantId : undefined;

  const lastUpdated = merchants && merchants.length
    ? merchants.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b)).updatedAt
    : undefined;

  return (
    <div className="content">
      <div className="reveal" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div className="pagehead-block">
          <div className="eyebrow">Local control plane</div>
          <h1 className="page" style={{ marginTop: 6 }}>
            Merchants
          </h1>
          <p className="page-sub">
            Connect a store, map its fields, and expose it to agents over UCP &amp; MCP — all from one ledger.
          </p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={refresh}><IconRefresh /> Refresh</button>
          <button className="btn primary" onClick={onNew}><IconPlus /> New merchant</button>
        </div>
      </div>

      {err && <div className="errbox reveal-1" style={{ marginTop: 18 }}>{err}</div>}

      <div className="statstrip reveal-1" style={{ marginTop: 26 }}>
        <div className="stat">
          <div className="k">Merchants</div>
          <div className="v">{merchants?.length ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="k" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span>Gateway</span>
            <StatusPill running={status?.running ?? false} port={status?.port} lastError={status?.lastError} />
          </div>
          <div
            className="v"
            style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 500, marginTop: 14, color: status?.running ? "var(--ink-2)" : "var(--faint)" }}
          >
            {status?.running && status.baseUrl ? status.baseUrl.replace(/^https?:\/\//, "") : "not running"}
          </div>
        </div>
        <div className="stat">
          <div className="k">Last updated</div>
          <div className="v" style={{ fontSize: 18, marginTop: 10 }}>{timeAgo(lastUpdated)}</div>
        </div>
      </div>

      {((merchants?.length ?? 0) > 0 || (status?.running ?? false)) && (
        <GatewayControl
          status={status}
          setStatus={setStatus}
          merchants={merchants ?? []}
          onChanged={() => { apiJson.merchants().then(setMerchants).catch(() => undefined); }}
        />
      )}

      {merchants === null && (
        <div className="panel pad reveal-2" style={{ marginTop: 18 }}><Skeleton lines={4} /></div>
      )}

      {merchants && merchants.length === 0 && (
        <div className="panel reveal-2" style={{ marginTop: 18 }}>
          <Empty
            icon={<IconLayers size={26} />}
            title="No merchants yet"
            body="Connect a REST store and Agentify will normalize it for agents via UCP + MCP. Begin with a guided config, or run the built-in demo to explore."
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn primary" onClick={onNew}><IconPlus /> New REST merchant</button>
                <button className="btn" onClick={runMock}><IconPlay /> Run demo (mock)</button>
                <button className="btn" onClick={() => void bootDemoRest()}><IconStore /> Boot demo REST store</button>
              </div>
            }
          />
        </div>
      )}

      {merchants && merchants.length > 0 && (
        <div className="mregistry reveal-2">
          {merchants.map((m) => (
            <MerchantCard
              key={m.id}
              m={m}
              live={liveId === m.id}
              confirming={confirmId === m.id}
              onChoose={() => setPick(m.id)}
              onOpen={() => onOpen(m.id)}
              onAskDelete={() => setConfirmId(m.id)}
              onCancelDelete={() => setConfirmId(null)}
              onDelete={() => void remove(m.id)}
            />
          ))}
        </div>
      )}

      {(() => {
        const m = pick ? merchants?.find((x) => x.id === pick) : undefined;
        if (!m) return null;
        return (
          <div className="backdrop" onClick={() => setPick(null)}>
            <div className="chooser" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="eyebrow">Open merchant</div>
              <div className="mrow-top" style={{ marginTop: 8 }}>
                <span className="mname">{m.name}</span>
                <span className="midchip" title={m.id}>{m.id}</span>
                <MerchantState live={liveId === m.id} state={m.state} />
              </div>
              <p className="page-sub" style={{ marginTop: 8 }}>How do you want to work with this store?</p>
              <div className="choice" role="button" tabIndex={0} onClick={() => { setPick(null); onOpen(m.id); }} onKeyDown={(e) => { if (e.key === "Enter") { setPick(null); onOpen(m.id); } }}>
                <span className="choice-ic"><IconSliders size={19} /></span>
                <span className="choice-tx">
                  <b>Configuration</b>
                  <small>Edit identity, connection, endpoints and field mappings; then validate, test, run and audit the gateway.</small>
                </span>
                <IconChev size={16} className="choice-go" />
              </div>
              <div className="choice" role="button" tabIndex={0} onClick={() => { setPick(null); onLandscape(m.id); }} onKeyDown={(e) => { if (e.key === "Enter") { setPick(null); onLandscape(m.id); } }}>
                <span className="choice-ic"><IconLayers size={19} /></span>
                <span className="choice-tx">
                  <b>Agent landscape</b>
                  <small>See the storefront AI agents meet — UCP discovery, llms.txt, agents.md and the shopping skill, in plain language.</small>
                </span>
                <IconChev size={16} className="choice-go" />
              </div>
              <div className="row" style={{ marginTop: 14, gap: 8 }}>
                <span className="badge">{m.currency}</span>
                {m.baseUrl && <span className="midchip" title={m.baseUrl} style={{ cursor: "default", userSelect: "all" }}>{m.baseUrl}</span>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function MerchantCard({
  m, live, confirming, onChoose, onOpen, onAskDelete, onCancelDelete, onDelete,
}: {
  m: MerchantSummary;
  live: boolean;
  confirming: boolean;
  onChoose: () => void;
  onOpen: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [copy, copied] = useClipboard();
  const state = m.state ?? "draft";
  const tags = m.tags ?? [];
  const dim = !live && state === "ready";
  return (
    <div
      className={`mcard${dim ? " off" : ""}`}
      onClick={onChoose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onChoose(); }}
    >
      <div className="grow" style={{ minWidth: 240 }}>
        <div className="mrow-top">
          <span className="mname">{m.name}</span>
          <button
            className="midchip"
            title={m.id}
            onClick={(e) => { e.stopPropagation(); copy(m.id); }}
          >
            {m.id}
          </button>
          {copied && <span className="copyflash">copied</span>}
          <MerchantState live={live} state={state} />
        </div>
        <div className="mcaps">
          <span className="ccur">{m.currency}</span>
          {m.baseUrl && (
            <>
              <span className="sep">|</span>
              <span className="curl" title={m.baseUrl}>{m.baseUrl}</span>
            </>
          )}
          {tags.length > 0 && (
            <>
              <span className="sep">|</span>
              <span className="feat">{tags.join(" · ")}</span>
            </>
          )}
        </div>
      </div>

      <div className={`acts${confirming ? " on" : ""}`} style={{ flex: "none" }}>
        {confirming ? (
          <>
            <button className="btn small danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Confirm</button>
            <button className="btn small ghost" onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}>Cancel</button>
          </>
        ) : (
          <>
            <span className="act-time">{timeAgo(m.updatedAt)}</span>
            <button className="btn open" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              Open <IconChev size={13} />
            </button>
            <button className="iconbtn" title="Delete merchant" onClick={(e) => { e.stopPropagation(); onAskDelete(); }}>
              <IconTrash size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const DEMO_REST_SOURCE = "__demo_rest__";

function GatewayControl({
  status, setStatus, merchants, onChanged,
}: {
  status: GatewayStatus | null;
  setStatus: (s: GatewayStatus) => void;
  merchants: MerchantSummary[];
  onChanged?: () => void;
}) {
  const [source, setSource] = useState("");
  const [port, setPort] = useState("");
  const [base, setBase] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState<Readiness | null>(null);
  const [copy, copied] = useClipboard();

  const running = status?.running ?? false;

  useEffect(() => {
    if (!running) {
      setCaps(null);
      return;
    }
    let active = true;
    const load = () => apiJson.readiness().then((r) => { if (active) setCaps(r); }).catch(() => undefined);
    void load();
    const t = setInterval(load, 6000);
    return () => { active = false; clearInterval(t); };
  }, [running, status?.baseUrl]);

  const start = async () => {
    setErr("");
    setBusy(true);
    try {
      if (source === DEMO_REST_SOURCE) {
        const r = await apiJson.demoRestBoot();
        if (r.ok && r.gateway) setStatus(r.gateway);
        onChanged?.();
      } else {
        setStatus(await apiJson.gatewayStart({
          kind: source ? "rest" : "mock",
          ...(source ? { merchantId: source } : {}),
          ...(port.trim() ? { port: Number(port) } : {}),
          ...(base.trim() ? { baseUrl: base } : {}),
        }));
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setErr("");
    setBusy(true);
    try {
      setStatus(await apiJson.gatewayStop());
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
    apiJson.demoRestStop().catch(() => undefined);
  };

  return (
    <div className="panel pad reveal-1" style={{ marginTop: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="eyebrow">Gateway control</span>
          <StatusPill running={running} port={status?.port} lastError={status?.lastError} />
          {running && status?.kind && (
            <span className="badge">{status.kind === "mock" ? "demo merchant" : "saved merchant"}</span>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary small" disabled={busy || running} onClick={() => void start()}>
            {busy ? <Spinner size={13} /> : <IconPlay size={13} />} Start
          </button>
          <button className="btn danger small" disabled={busy || !running} onClick={() => void stop()}>
            <IconStop size={13} /> Stop
          </button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
        <select
          className="mono"
          style={{ width: 280 }}
          value={source}
          disabled={running}
          onChange={(e) => setSource(e.target.value)}
          title="What to serve over the gateway"
        >
          <option value="">Demo mock merchant (offline)</option>
          <option value={DEMO_REST_SOURCE}>Demo REST store (testing backend)</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} — {m.id}
            </option>
          ))}
        </select>
        <input className="mono" style={{ width: 110 }} placeholder="port" value={port} disabled={running} onChange={(e) => setPort(e.target.value)} />
        <input className="mono grow" style={{ minWidth: 200 }} placeholder="base URL e.g. http://localhost:8787" value={base} disabled={running} onChange={(e) => setBase(e.target.value)} />
      </div>

      {err && <div className="errbox" style={{ marginTop: 10 }}>{err}</div>}

      {running && status?.baseUrl && (
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <button className="chip" onClick={() => copy(status.baseUrl!)} title="Copy base URL">
            {copied ? "✓ copied" : status.baseUrl}
          </button>
          <a className="chip" href={`${status.baseUrl}/.well-known/ucp`} target="_blank" rel="noreferrer">
            ucp <IconExternal size={12} />
          </a>
          <a className="chip" href={`${status.baseUrl}/agents.md`} target="_blank" rel="noreferrer">
            agents.md <IconExternal size={12} />
          </a>
          <a className="chip" href={`${status.baseUrl}/llms.txt`} target="_blank" rel="noreferrer">
            llms.txt <IconExternal size={12} />
          </a>
        </div>
      )}

      {caps?.running && caps.capabilities && (
        <div className="chiprow" style={{ marginTop: 12 }}>
          {caps.capabilities.map((c) => (
            <span key={c.id} className={`badge ${c.on ? "on" : "off"}`}>{c.label}</span>
          ))}
          <span className={`badge ${caps.payment ? "on" : "off"}`}>Payment</span>
        </div>
      )}
    </div>
  );
}
