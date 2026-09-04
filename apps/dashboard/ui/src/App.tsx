import { useCallback, useEffect, useState } from "react";
import { apiJson, type GatewayStatus, type MerchantSummary } from "./api";
import { IconChev, IconHome, IconLayers, IconPlus } from "./icons";
import { AgentLandscape } from "./AgentLandscape";
import { Overview } from "./Overview";
import { Playground } from "./Playground";
import { StatusPill } from "./ui";
import { Workspace } from "./Workspace";

type View =
  | { page: "home" }
  | { page: "edit"; id: string }
  | { page: "landscape"; id: string }
  | { page: "playground"; id?: string };

function useGatewayStatus() {
  const [s, setS] = useState<GatewayStatus | null>(null);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const v = await apiJson.gatewayStatus();
        if (active) setS(v);
      } catch {
        /* offline */
      }
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  return s;
}

export function App() {
  const [view, setView] = useState<View>({ page: "home" });
  const [merchantName, setMerchantName] = useState("");
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const status = useGatewayStatus();

  const refreshMerchants = useCallback(() => {
    apiJson.merchants().then(setMerchants).catch(() => undefined);
  }, []);
  useEffect(refreshMerchants, [refreshMerchants]);

  const newMerchant = async () => {
    try {
      const t = (await apiJson.blankTemplate()) as { id: string };
      const id = `${t.id}-${Date.now().toString().slice(-5)}`;
      await apiJson.save(id, t);
      refreshMerchants();
      setView({ page: "edit", id });
    } catch (e) {
      alert(String(e));
    }
  };

  const openPlayground = async () => {
    if (view.page !== "home" && view.id) {
      setView({ page: "playground", id: view.id });
      return;
    }
    if (merchants.length > 0) {
      setView({ page: "playground", id: merchants[0]!.id });
      return;
    }
    await refreshMerchants();
    if (merchants.length > 0) setView({ page: "playground", id: merchants[0]!.id });
    else setView({ page: "playground" });
  };

  const crumbLabel = (v: View): string =>
    v.page === "home" ? "Control plane" : merchantName || (v.id ?? "…");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">A</span>
          <div>
            <b>Agentify</b>
            <small>commerce control plane</small>
          </div>
        </div>

        <div className="sidenav-label">Workspace</div>
        <button className={`navitem ${view.page === "home" ? "active" : ""}`} onClick={() => setView({ page: "home" })}>
          <IconHome size={16} /> Overview
        </button>
        <button className="navitem" onClick={() => void newMerchant()}>
          <IconPlus size={16} /> New merchant
        </button>

        <div className="sidenav-label" style={{ marginTop: 10 }}>Sell to agents</div>
        <button
          className={`navitem ${view.page === "playground" ? "active" : ""}`}
          onClick={() => void openPlayground()}
        >
          <IconLayers size={16} /> Agent playground
        </button>

        <div className="spacer" />

        <div className="side-status">
          <div className="lbl">Gateway</div>
          <div className="row2">
            <StatusPill running={status?.running ?? false} port={status?.port} lastError={status?.lastError} />
            {status?.running && status.baseUrl && (
              <a href={status.baseUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11 }}>
                open ↗
              </a>
            )}
          </div>
        </div>
        <div className="side-foot">Agentic commerce · local</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="crumb">
            {view.page === "home" ? (
              <b>Control plane</b>
            ) : (
              <>
                <a href="#" onClick={(e) => { e.preventDefault(); setView({ page: "home" }); }}>Merchants</a>
                <IconChev size={12} />
                <b>{crumbLabel(view)}</b>
                {view.page !== "edit" && (
                  <>
                    <IconChev size={12} />
                    <span style={{ color: "var(--accent)" }}>
                      {view.page === "landscape" ? "Agent landscape" : "Agent playground"}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          <span className="grow" />
          <StatusPill running={status?.running ?? false} port={status?.port} lastError={status?.lastError} />
        </div>

        {view.page === "home" ? (
          <Overview
            onOpen={(id) => setView({ page: "edit", id })}
            onLandscape={(id) => setView({ page: "landscape", id })}
            onNew={() => void newMerchant()}
          />
        ) : view.page === "landscape" ? (
          <AgentLandscape id={view.id} onBack={() => setView({ page: "home" })} onName={setMerchantName} />
        ) : view.page === "playground" ? (
          <Playground id={view.id} onSelect={(id) => setView({ page: "playground", id })} merchants={merchants} />
        ) : (
          <Workspace
            id={view.id}
            onBack={() => setView({ page: "home" })}
            onDeleted={() => { refreshMerchants(); setView({ page: "home" }); }}
            onName={setMerchantName}
          />
        )}
      </main>
    </div>
  );
}
