import type { AuditEventInput, AuditQuery, AuditStore, MoneyActionEvent } from "./audit.js";

function matches(event: MoneyActionEvent, query: AuditQuery): boolean {
  if (query.checkoutId && event.checkout_id !== query.checkoutId) return false;
  if (query.orderId && event.order_id !== query.orderId) return false;
  if (query.cartId && event.cart_id !== query.cartId) return false;
  if (query.type && event.event !== query.type) return false;
  if (query.before && event.timestamp >= query.before) return false;
  return true;
}

export function filterEvents(
  events: readonly MoneyActionEvent[],
  query: AuditQuery,
): MoneyActionEvent[] {
  const filtered = events.filter((e) => matches(e, query));
  const limit = query.limit ?? filtered.length;
  return filtered.slice(0, limit);
}

export function orderedByCheckout(events: readonly MoneyActionEvent[], checkoutId: string): MoneyActionEvent[] {
  return events
    .filter((e) => e.checkout_id === checkoutId)
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

export function orderedByOrder(events: readonly MoneyActionEvent[], orderId: string): MoneyActionEvent[] {
  return events
    .filter((e) => e.order_id === orderId)
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

export function orderedByCart(events: readonly MoneyActionEvent[], cartId: string): MoneyActionEvent[] {
  return events
    .filter((e) => e.cart_id === cartId)
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

/** Append a timestamp and store in memory (unit-test friendly, process-lifetime). */
export class InMemoryAuditStore implements AuditStore {
  private readonly events: MoneyActionEvent[] = [];
  private readonly emitJson: boolean;

  constructor(opts: { emitJson?: boolean } = {}) {
    this.emitJson = opts.emitJson ?? false;
  }

  record(event: AuditEventInput): void {
    const full: MoneyActionEvent = { ...event, timestamp: new Date().toISOString() };
    this.events.push(full);
    if (this.emitJson) process.stdout.write(`${JSON.stringify(full)}\n`);
  }

  list(query: AuditQuery = {}): readonly MoneyActionEvent[] {
    return filterEvents(this.events, query);
  }

  byCheckout(checkoutId: string): readonly MoneyActionEvent[] {
    return orderedByCheckout(this.events, checkoutId);
  }

  byOrder(orderId: string): readonly MoneyActionEvent[] {
    return orderedByOrder(this.events, orderId);
  }

  byCart(cartId: string): readonly MoneyActionEvent[] {
    return orderedByCart(this.events, cartId);
  }
}
