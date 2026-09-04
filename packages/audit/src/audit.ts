import type { Money } from "@agentify/canonical-commerce";

/**
 * Audit model for money actions (architecture doc §16).
 *
 * Every money-changing / state-changing action records an event that is
 * EXPLAINABLE (reason + human text), BOUNDED (amount + optional pre/after and
 * bounds) and GATED (approval state + idempotency key), with full context ids.
 */

export interface ApprovalState {
  required: boolean;
  granted?: boolean;
  /** Legacy alias for granted (used by payment events). */
  received?: boolean;
}

export interface MoneyActionEvent {
  /** Machine-readable action name, e.g. "cart.add_item", "checkout.completed". */
  event: string;
  /** Stable refusal/reason code when applicable, e.g. "PRICE_CHANGED". */
  reasonCode?: string;
  /** Human/agent-readable explanation of the action or refusal. */
  explanation?: string;
  merchant_id?: string;
  agent?: string;
  cart_id?: string;
  checkout_id?: string;
  order_id?: string;
  payment_id?: string;
  /** Minor-unit amount central to the action. */
  amount?: number;
  currency?: string;
  /** Bounding context: before/after totals or explicit min/max. */
  bound?: { min?: number; max?: number };
  amountBefore?: number;
  amountAfter?: number;
  /** Money as a canonical object when useful (amount + currency). */
  money?: Money;
  approval?: ApprovalState;
  /** Prevents duplicate recording of retried actions. */
  idempotencyKey?: string;
  /** Snapshot/details of the affected state. */
  details?: Record<string, unknown>;
  timestamp: string;
}

/** Input accepted by stores; timestamp is added by the store. */
export type AuditEventInput = Omit<MoneyActionEvent, "timestamp">;

export interface AuditQuery {
  checkoutId?: string;
  orderId?: string;
  cartId?: string;
  type?: string;
  limit?: number;
  /** Return only events before this timestamp (exclusive). */
  before?: string;
}

export interface AuditStore {
  record(event: AuditEventInput): void;
  list(query?: AuditQuery): readonly MoneyActionEvent[];
  /** Ordered (oldest first) events for a checkout. */
  byCheckout(checkoutId: string): readonly MoneyActionEvent[];
  /** Ordered events for an order. */
  byOrder(orderId: string): readonly MoneyActionEvent[];
  /** Ordered events for a cart (pre-checkout money actions). */
  byCart(cartId: string): readonly MoneyActionEvent[];
}

export function auditEventNames(list: readonly MoneyActionEvent[]): string[] {
  return list.map((e) => e.event);
}
