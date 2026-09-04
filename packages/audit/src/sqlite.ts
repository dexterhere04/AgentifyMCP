import { DatabaseSync } from "node:sqlite";
import type { AuditEventInput, AuditQuery, AuditStore, MoneyActionEvent } from "./audit.js";
import { filterEvents, orderedByCart, orderedByCheckout, orderedByOrder } from "./memory.js";

/**
 * SQLite-backed audit store (node:sqlite, no native deps). Pass a file path to
 * persist across restarts (AGENTIFY_AUDIT_PATH); ":memory:" keeps it transient.
 */
export class SqliteAuditStore implements AuditStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           TEXT NOT NULL,
        data         TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_events(ts);
    `);
  }

  close(): void {
    this.db.close();
  }

  record(event: AuditEventInput): void {
    const ts = new Date().toISOString();
    const full: MoneyActionEvent = { ...event, timestamp: ts };
    this.db.prepare("INSERT INTO audit_events (ts, data) VALUES (?, ?)").run(ts, JSON.stringify(full));
  }

  private loadAll(): MoneyActionEvent[] {
    const rows = this.db.prepare("SELECT data FROM audit_events ORDER BY id").all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as MoneyActionEvent);
  }

  list(query: AuditQuery = {}): readonly MoneyActionEvent[] {
    return filterEvents(this.loadAll(), query);
  }

  byCheckout(checkoutId: string): readonly MoneyActionEvent[] {
    return orderedByCheckout(this.loadAll(), checkoutId);
  }

  byOrder(orderId: string): readonly MoneyActionEvent[] {
    return orderedByOrder(this.loadAll(), orderId);
  }

  byCart(cartId: string): readonly MoneyActionEvent[] {
    return orderedByCart(this.loadAll(), cartId);
  }
}
