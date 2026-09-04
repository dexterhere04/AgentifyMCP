import {
  isProviderError,
  type AddCartItemInput,
  type Cart,
  type Checkout,
  type CommerceProvider,
  type Order,
  type TransactionMeta,
} from "@agentify/canonical-commerce";
import type { AuditStore } from "./audit.js";

/**
 * AuditedCommerce wraps a provider so every cart/checkout money action emits an
 * explainable, bounded, approval-gated audit event. The wrapped provider stays
 * audit-free; this decorator is applied at the gateway composition root.
 *
 * When a payment provider is wired, `recordCompletion` should be false so the
 * PaymentOrchestrator owns completion events (avoids duplicates).
 */
export interface AuditedCommerceOptions {
  recordCompletion?: boolean;
}

function eventOf(input: {
  event: string;
  audit: AuditStore;
  reasonCode?: string;
  explanation?: string;
  agent?: string;
  amount?: number;
  currency?: string;
  amountAfter?: number;
  approval?: { required: boolean; granted?: boolean };
  details?: Record<string, unknown>;
  checkoutId?: string;
  cartId?: string;
  orderId?: string;
}): void {
  input.audit.record({
    event: input.event,
    reasonCode: input.reasonCode,
    explanation: input.explanation,
    agent: input.agent,
    amount: input.amount,
    currency: input.currency,
    amountAfter: input.amountAfter,
    approval: input.approval,
    details: input.details,
    checkout_id: input.checkoutId,
    cart_id: input.cartId,
    order_id: input.orderId,
  });
}

function agentOf(meta?: TransactionMeta | undefined): string | undefined {
  return meta?.agentProfile;
}

export function createAuditedCommerce(
  provider: CommerceProvider,
  audit: AuditStore,
  opts: AuditedCommerceOptions = {},
): CommerceProvider {
  const recordCompletion = opts.recordCompletion ?? true;

  function wrapCart(cart: NonNullable<CommerceProvider["cart"]>) {
    return {
      create: async (input?: { currency?: string } & TransactionMeta): Promise<Cart> => {
        const result = await cart.create(input);
        eventOf({
          event: "cart.created",
          audit,
          agent: agentOf(input),
          amount: result.subtotal.amount,
          currency: result.subtotal.currency,
          cartId: result.id,
          details: { cartId: result.id },
          explanation: "Cart created (no charge).",
        });
        return result;
      },
      get: cart.get,
      addItem: async (input: AddCartItemInput & TransactionMeta): Promise<Cart> => {
        const result = await cart.addItem(input);
        const line = result.items.find((i) => i.variantId === input.variantId);
        eventOf({
          event: "cart.add_item",
          audit,
          agent: agentOf(input),
          amount: line ? line.unitPrice.amount * line.quantity : undefined,
          currency: result.currency,
          amountAfter: result.subtotal.amount,
          cartId: result.id,
          details: { cartId: result.id, variantId: input.variantId, quantity: input.quantity },
          explanation: `Added ${input.quantity} × ${line?.title ?? input.variantId} at a live offer price; no charge yet.`,
        });
        return result;
      },
      updateItem: async (
        input: { cartId?: string; itemId: string; quantity: number } & TransactionMeta,
      ): Promise<Cart> => {
        const result = await cart.updateItem(input);
        eventOf({
          event: "cart.update_item",
          audit,
          agent: agentOf(input),
          amountAfter: result.subtotal.amount,
          currency: result.currency,
          cartId: result.id,
          details: { cartId: input.cartId, itemId: input.itemId, quantity: input.quantity },
          explanation: "Cart line quantity updated; no charge yet.",
        });
        return result;
      },
      removeItem: async (
        input: { cartId?: string; itemId: string } & TransactionMeta,
      ): Promise<Cart> => {
        const result = await cart.removeItem(input);
        eventOf({
          event: "cart.remove_item",
          audit,
          agent: agentOf(input),
          amountAfter: result.subtotal.amount,
          currency: result.currency,
          cartId: result.id,
          details: { cartId: input.cartId, itemId: input.itemId },
          explanation: "Cart line removed; no charge yet.",
        });
        return result;
      },
    };
  }

  function wrapCheckout(checkout: NonNullable<CommerceProvider["checkout"]>) {
    return {
      create: async (input: { cartId: string } & TransactionMeta): Promise<Checkout> => {
        const result = await checkout.create(input);
        const total = result.totals?.total;
        eventOf({
          event: "checkout.created",
          audit,
          agent: agentOf(input),
          amount: total?.amount,
          currency: total?.currency,
          amountAfter: total?.amount,
          checkoutId: result.id,
          cartId: input.cartId,
          details: { checkoutId: result.id, cartId: input.cartId },
          explanation: `Checkout quoted at ${total?.amount} ${total?.currency}; payment requires buyer approval.`,
        });
        return result;
      },
      get: checkout.get,
      complete: async (
        id: string,
        options?: { approval?: { buyerApproved: boolean } } & TransactionMeta,
      ): Promise<Order> => {
        try {
          const order = await checkout.complete(id, options);
          if (recordCompletion) {
            const total = order.total;
            eventOf({
              event: "checkout.completed",
              audit,
              agent: agentOf(options),
              amount: total?.amount,
              currency: total?.currency,
              checkoutId: id,
              orderId: order.id,
              approval: {
                required: true,
                granted: options?.approval?.buyerApproved ?? false,
              },
              explanation: `Checkout completed for ${order.total?.amount} ${order.total?.currency}; order ${order.id}.`,
            });
          }
          return order;
        } catch (err) {
          if (isProviderError(err)) {
            const d = (err.details ?? {}) as { newTotal?: number; currency?: string };
            eventOf({
              event: "checkout.complete.refused",
              audit,
              agent: agentOf(options),
              reasonCode: err.code,
              checkoutId: id,
              amount: typeof d.newTotal === "number" ? d.newTotal : undefined,
              currency: d.currency,
              approval: { required: true, granted: false },
              details: { ...(err.details ?? {}), checkoutId: id },
              explanation: err.message,
            });
          }
          throw err;
        }
      },
      cancel: async (id: string, options?: TransactionMeta): Promise<Checkout> => {
        const result = await checkout.cancel(id, options);
        eventOf({
          event: "checkout.cancelled",
          audit,
          agent: agentOf(options),
          currency: result.currency,
          checkoutId: id,
          explanation: "Checkout cancelled; no charge occurred.",
        });
        return result;
      },
    };
  }

  const audited: CommerceProvider = {
    id: provider.id,
    merchant: () => provider.merchant(),
    catalog: provider.catalog,
    inventory: provider.inventory,
    pricing: provider.pricing,
    orders: provider.orders,
    recommendations: provider.recommendations,
    cart: provider.cart ? wrapCart(provider.cart) : undefined,
    checkout: provider.checkout ? wrapCheckout(provider.checkout) : undefined,
  };
  return audited;
}
