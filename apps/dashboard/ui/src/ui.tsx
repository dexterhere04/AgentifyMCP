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

export function timeAgo(iso?: string): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
      <span className={`dot ${running ? "pulse" : ""}`} style={{ background: running ? "var(--ok)" : lastError ? "var(--danger)" : "var(--faint)" }} />
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
      {icon && <div className="glyph">{icon}</div>}
      <h3>{title}</h3>
      {body && <p style={{ margin: "6px auto 0", maxWidth: 440, fontSize: 13.5 }}>{body}</p>}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

export function Err({ children }: { children: ReactNode }) {
  return <div className="errbox">{children}</div>;
}
export function Ok({ children }: { children: ReactNode }) {
  return <div className="okbox">{children}</div>;
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
