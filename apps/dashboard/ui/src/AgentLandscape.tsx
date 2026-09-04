import { useEffect, useState } from "react";
import { apiJson, type MerchantLandscape } from "./api";
import { IconExternal } from "./icons";
import { Skeleton, useClipboard } from "./ui";

function Art({
  num, title, desc, url, copyText, children,
}: {
  num: string;
  title: string;
  desc: string;
  url?: string;
  copyText?: string;
  children?: React.ReactNode;
}) {
  const [copy, copied] = useClipboard();
  return (
    <div className="art panel">
      <div className="art-head">
        <span className="art-num">{num}</span>
        <div className="grow">
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
        {url && (
          <div className="row" style={{ gap: 6 }}>
            {copyText && (
              <button className="btn small ghost" onClick={() => copy(copyText)}>
                {copied ? "✓ copied" : "Copy"}
              </button>
            )}
            <a className="btn small" href={url} target="_blank" rel="noreferrer">Open <IconExternal size={12} /></a>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function CodeFold({ label, children }: { label: string; children: string }) {
  return (
    <details className="fold">
      <summary>{label}</summary>
      <pre>{children}</pre>
    </details>
  );
}

export function AgentLandscape({ id, onBack, onName }: { id: string; onBack: () => void; onName?: (name: string) => void }) {
  const [landscape, setLandscape] = useState<MerchantLandscape | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let active = true;
    apiJson.merchantLandscape(id)
      .then((l) => {
        if (!active) return;
        setLandscape(l);
        onName?.(l.name);
      })
      .catch((e) => {
        if (active) setErr(String(e));
      });
    return () => {
      active = false;
    };
  }, [id, onName]);

  if (err) {
    return (
      <div className="content">
        <div className="errbox" style={{ marginTop: 20 }}>{err}</div>
        <button className="btn" style={{ marginTop: 12 }} onClick={onBack}>Back to merchants</button>
      </div>
    );
  }

  if (!landscape) {
    return (
      <div className="content">
        <div className="panel pad" style={{ marginTop: 20 }}><Skeleton lines={6} /></div>
      </div>
    );
  }

  const e = landscape.endpoints;

  return (
    <div className="content">
      <div className="reveal">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div className="pagehead-block">
            <div className="eyebrow">Merchant · Agent landscape</div>
            <h1 className="page" style={{ marginTop: 6 }}>{landscape.name}</h1>
            <div className="mrow-top" style={{ marginTop: 10, gap: 12 }}>
              <span className="midchip" style={{ cursor: "default", userSelect: "all" }}>{landscape.id}</span>
              <span className={`mstate ${landscape.live ? "live" : "cfg"}`}>
                <span className={`dot${landscape.live ? " pulse" : ""}`} />
                {landscape.live ? "Serving live" : "Configured"}
              </span>
            </div>
          </div>
          <button className="btn" onClick={onBack}>← All merchants</button>
        </div>
      </div>

      {landscape.live ? (
        <div className="okbox reveal-1" style={{ marginTop: 20 }}>
          Your store is <b>live for agents</b> at <span className="mono">{landscape.baseUrl}</span> — the files below are being served right now.
        </div>
      ) : (
        <div className="errbox reveal-1" style={{ marginTop: 20, background: "var(--warn-soft)", borderColor: "#e7d3ab", color: "#8a5a12" }}>
          Preview of what agents will see <b>once the gateway is serving this store</b> on {landscape.baseUrl}. Start it from
          the Overview → Gateway control (pick this merchant or the REST demo), then the files below become live endpoints.
        </div>
      )}

      <div className="panel pad reveal-1" style={{ marginTop: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Your store, in plain words</div>
        <div className="stack" style={{ maxWidth: 760 }}>
          {landscape.notes.map((n, i) => (
            <p key={i} style={{ color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.65, margin: 0 }}>
              {landscape.description ? <em style={{ color: "var(--muted)" }}>{landscape.description} </em> : null}
              {n}
            </p>
          ))}
        </div>
      </div>

      <div className="capgrid reveal-2" style={{ marginTop: 20 }}>
        {landscape.capabilities.map((cap) => (
          <div className="capcard" key={cap.key}>
            <span className="cap-on" />
            <b>{cap.label}</b>
            <p>{cap.what}</p>
          </div>
        ))}
      </div>

      <div className="sec reveal-2" style={{ margin: "28px 0 6px" }}>
        <span className="secnum">A·</span>What agents actually read
        <span className="muted" style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: 0.4 }}>— four agent-facing files</span>
      </div>

      <div className="stack reveal-2" style={{ marginTop: 14 }}>
        <Art
          num="01"
          title="UCP discovery profile"
          desc="A machine-readable business card your store publishes at /.well-known/ucp. Agents read it first: it says the store exists, lists its capabilities and points to the MCP endpoint agents transact on."
          url={e.ucp}
          copyText={e.ucp}
        >
          <CodeFold label={`Preview — capability + transport discovery (${e.ucp})`}>
            {JSON.stringify(landscape.ucpProfile, null, 2)}
          </CodeFold>
        </Art>

        <Art
          num="02"
          title="llms.txt"
          desc="A plain-text 'about + navigation' page for AI assistants: what the store sells, in which currency, and the agent interfaces to follow. Like a robots.txt, but written for language models that want to browse the store carefully."
          url={e.llmsTxt}
          copyText={landscape.llms}
        >
          <CodeFold label="Preview — what an AI reads before deciding to shop here">
            {landscape.llms}
          </CodeFold>
        </Art>

        <Art
          num="03"
          title="agents.md"
          desc="The rules of engagement for an AI agent once it starts shopping: store identity, allowed actions, money & pricing rules, approval requirements for checkout and what to do when something fails. Agents should follow it exactly."
          url={e.agentsMd}
          copyText={landscape.agents}
        >
          <CodeFold label="Preview — behavioural instructions the agent is told to follow">
            {landscape.agents}
          </CodeFold>
        </Art>

        <Art
          num="04"
          title="Shopping skill (SKILL.md)"
          desc="A reusable playbook agents can install: it teaches one safe way to shop any Agentify store — discover, verify the live offer, get human approval, then check out. Your customers' agents read it to behave well against your store."
          url={e.skillUrl}
          copyText={e.skillUrl}
        />
      </div>

      <div className="panel pad reveal-2" style={{ marginTop: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Served from one gateway</div>
        <div className="chiprow">
          <a className="chip" href={e.mcp} target="_blank" rel="noreferrer">MCP endpoint <IconExternal size={12} /></a>
          <a className="chip" href={e.ucp} target="_blank" rel="noreferrer">UCP discovery <IconExternal size={12} /></a>
          <a className="chip" href={e.agentsMd} target="_blank" rel="noreferrer">agents.md <IconExternal size={12} /></a>
          <a className="chip" href={e.llmsTxt} target="_blank" rel="noreferrer">llms.txt <IconExternal size={12} /></a>
          <a className="chip" href={e.skillUrl} target="_blank" rel="noreferrer">Shopping skill <IconExternal size={12} /></a>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 10 }}>
          <span className="kicker mono">base {landscape.baseUrl}</span>
          <span className="kicker">{landscape.country ? `${landscape.country} · ` : ""}{landscape.defaultCurrency}</span>
          {landscape.url && <span className="kicker">{landscape.url}</span>}
        </div>
      </div>
    </div>
  );
}
