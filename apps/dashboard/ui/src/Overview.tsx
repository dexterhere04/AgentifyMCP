import { useCallback, useEffect, useState } from "react";
import { apiJson, type GatewayStatus, type MerchantSummary } from "./api";
import { IconChev, IconLayers, IconPlus, IconPlay, IconServer, IconTrash } from "./icons";
import { Empty, Ok, PanelBody, Skeleton, StatusPill } from "./ui";

export function Overview({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [merchants, setMerchants] = useState<MerchantSummary[] | null>(null);
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    setErr("");
    apiJson.merchants().then(setMerchants).catch((e) => setErr(String(e)));
    apiJson.gatewayStatus().then(setStatus).catch(() => undefined);
  }, []);

  useEffect(refresh, [refresh]);

  const runMock = async () => {
    setErr("");
    try {
      setStatus(await apiJson.gatewayStart({ kind: "mock" }));
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="content">
      <div className="row reveal" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div className="eyebrow">Local control plane</div>
          <h1 className="page" style={{ marginTop: 4 }}>Merchants</h1>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={refresh}>Refresh</button>
          <button className="btn primary" onClick={onNew}><IconPlus /> New merchant</button>
        </div>
      </div>

      {err && <div className="errbox reveal">{err}</div>}

      {merchants === null && (
        <div className="panel pad"><Skeleton lines={4} /></div>
      )}

      {merchants && merchants.length === 0 && (
        <div className="panel reveal" style={{ marginTop: 12 }}>
          <Empty
            icon={<IconLayers size={34} />}
            title="No merchants yet"
            body="Connect a REST store — Agentify will expose it to agents via UCP + MCP. Start with a guided config, or run the built-in demo to explore."
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn primary" onClick={onNew}><IconPlus /> New REST merchant</button>
                <button className="btn" onClick={runMock}><IconPlay /> Run demo (mock)</button>
              </div>
            }
          />
        </div>
      )}

      {merchants && merchants.length > 0 && (
        <div className="stack" style={{ marginTop: 12 }}>
          {merchants.map((m, i) => (
            <PanelBody
              key={m.id}
              aside={
                <div className="row">
                  <button className="btn small" onClick={() => onOpen(m.id)}>Open <IconChev size={13} /></button>
                  <button className="btn small danger" onClick={async () => { await apiJson.remove(m.id); refresh(); }}><IconTrash size={13} /></button>
                </div>
              }
            >
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "var(--display)", fontSize: 17 }}>{m.name}</div>
                  <div className="kicker mono" style={{ marginTop: 3 }}>{m.id}</div>
                </div>
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <span className="badge">{m.currency}</span>
                  <span className="badge mono" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>{m.baseUrl}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{m.updatedAt.slice(0, 19).replace("T", " ")}</span>
                </div>
              </div>
            </PanelBody>
          ))}
        </div>
      )}
    </div>
  );
}
