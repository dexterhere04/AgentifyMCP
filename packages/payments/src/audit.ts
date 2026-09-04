/**
 * Audit trail for money-changing actions (architecture doc section 16).
 *
 * Every payment/checkout step records an event with merchant/checkout/order
 * context, agent identity when supplied, amount, currency and approval state.
 */

export interface AuditEvent {
  event: string;
  merchant_id?: string;
  checkout_id?: string;
  order_id?: string;
  payment_id?: string;
  agent?: string;
  amount?: number;
  currency?: string;
  approval?: { required: boolean; received: boolean };
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface AuditStore {
  record(event: Omit<AuditEvent, "timestamp">): void;
  list(): readonly AuditEvent[];
}

export class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];
  private readonly emitJson: boolean;

  constructor(opts: { emitJson?: boolean } = {}) {
    this.emitJson = opts.emitJson ?? false;
  }

  record(event: Omit<AuditEvent, "timestamp">): void {
    const full: AuditEvent = { ...event, timestamp: new Date().toISOString() };
    this.events.push(full);
    if (this.emitJson) {
      // structured log line for production ingestion
      process.stdout.write(`${JSON.stringify(full)}\n`);
    }
  }

  list(): readonly AuditEvent[] {
    return this.events;
  }
}

export function auditEventNames(list: readonly AuditEvent[]): string[] {
  return list.map((e) => e.event);
}
