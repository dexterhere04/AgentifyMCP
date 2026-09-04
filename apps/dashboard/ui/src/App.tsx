import { useEffect, useState } from "react";
import { apiJson, type GatewayStatus } from "./api";
import { IconHome, IconMark } from "./icons";
import { Overview } from "./Overview";
import { StatusPill } from "./ui";
import { Workspace } from "./Workspace";

type View = { page: "home" } | { page: "edit"; id: string };

function SideStatus() {
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
  return (
    <div className="side-status">
      <div className="muted" style={{ textTransform: "uppercase", letterSpacing: 1, fontSize: 10 }}>Gateway</div>
      <div className="row2">
        <StatusPill running={s?.running ?? false} port={s?.port} lastError={s?.lastError} />
        {s?.running && s.baseUrl && <a href={s.baseUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 11 }}>open</a>}
      </div>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>({ page: "home" });

  const newMerchant = async () => {
    try {
      const t = (await apiJson.blankTemplate()) as { id: string };
      const id = `${t.id}-${Date.now().toString().slice(-5)}`;
      await apiJson.save(id, t);
      setView({ page: "edit", id });
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark"><IconMark size={17} /></span>
          <div>
            <b>Agentify</b>
            <small>instrument panel</small>
          </div>
        </div>
        <button className={`navitem ${view.page === "home" ? "active" : ""}`} onClick={() => setView({ page: "home" })}>
          <IconHome size={16} /> Overview
        </button>
        <div className="spacer" />
        <SideStatus />
      </aside>
      <main className="main">
        <div className="topbar">
          <button className="btn small ghost" onClick={() => setView({ page: "home" })}>← Overview</button>
          {view.page === "edit" && <span className="kicker mono">{view.id}</span>}
          <span className="grow" />
          <span className="muted" style={{ fontSize: 12 }}>local · config, test, run, audit</span>
        </div>
        {view.page === "home" ? (
          <Overview
            onOpen={(id) => setView({ page: "edit", id })}
            onNew={() => void newMerchant()}
          />
        ) : (
          <Workspace id={view.id} onBack={() => setView({ page: "home" })} onDeleted={() => setView({ page: "home" })} />
        )}
      </main>
    </div>
  );
}
