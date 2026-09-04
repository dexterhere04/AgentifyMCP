import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------- small utils ------- */
export function getAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), obj);
}
export function setAt<T>(obj: T, path: string, val: unknown): T {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const keys = path.split(".");
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]!;
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]!] = val;
  return clone as T;
}

/* ------- primitives ------- */
export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`panel ${className}`}>{children}</div>;
}
export function PanelBody({ title, hint, aside, children }: { title?: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Panel>
      <div className="pad" style={{ paddingBottom: 4 }}>
        {title && (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="sec">{title}</h2>
            {aside}
          </div>
        )}
        {hint && <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>{hint}</p>}
        <div style={{ marginTop: title ? 10 : 0 }}>{children}</div>
      </div>
    </Panel>
  );
}

export function Field({ label, hint, invalid, children }: { label: string; hint?: string; invalid?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className={invalid ? "invalid" : ""}>{children}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function StatusPill({ running, port, baseUrl, lastError }: { running: boolean; port?: number; baseUrl?: string; lastError?: string }) {
  return (
    <span className={`badge ${running ? "on" : lastError ? "err" : "off"}`}>
      <span className={`dot ${running ? "pulse" : ""}`} style={{ background: running ? "var(--ok)" : lastError ? "var(--danger)" : "var(--muted)" }} />
      {running ? `live · :${port}` : lastError ? "errored" : "stopped"}
    </span>
  );
}

export function useClipboard(): [(text: string) => void, boolean] {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setCopied(false), 1200);
  };
  useEffect(() => () => t.current && clearTimeout(t.current), []);
  return [copy, copied];
}

export function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copy, copied] = useClipboard();
  return (
    <button className="chip" onClick={() => copy(text)} title="Copy">
      {copied ? "✓ copied" : (label ?? text.length > 44 ? `${text.slice(0, 40)}…` : text)}
    </button>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="sk" style={{ height: 12, margin: "8px 0" }} />
      ))}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div style={{ marginBottom: 10, color: "var(--accent)" }}>{icon}</div>}
      <div style={{ fontFamily: "var(--display)", fontSize: 17 }}>{title}</div>
      {body && <p style={{ margin: "8px auto", maxWidth: 460 }}>{body}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Err({ children }: { children: ReactNode }) {
  return <div className="errbox">{children}</div>;
}
export function Ok({ children }: { children: ReactNode }) {
  return <div className="okbox">{children}</div>;
}
