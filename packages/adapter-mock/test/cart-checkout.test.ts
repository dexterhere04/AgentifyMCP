import { beforeEach, describe, expect, it } from "vitest";
import type { Cart, Money } from "@agentify/canonical-commerce";
import { createMockCommerceProvider, type MockCommerceProvider } from "../src/index.js";

const inr = (amountMajor: number): Money => ({ amount: Math.round(amountMajor * 100), currency: "INR" });
const AGENT = "https://agent.example/.well-known/ucp";

describe("MVP 6 — mock cart", () => {
  let provider: MockCommerceProvider;

  beforeEach(() => {
    provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  });

  async function newCart(): Promise<Cart> {
    return provider.cart!.create({ agentProfile: AGENT });
  }

  it("creates an empty active cart in INR", async () => {
    const cart = await newCart();
    expect(cart.id).toMatch(/^cart_/);
    expect(cart.status).toBe("active");
    expect(cart.currency).toBe("INR");
    expect(cart.items).toEqual([]);
    expect(cart.subtotal).toEqual(inr(0));
    expect(cart.expiresAt).toBeDefined();
  });

  it("rejects a non-INR cart currency", async () => {
    await expect(provider.cart!.create({ currency: "USD" })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("adds a variant at its live offer price and computes the subtotal", async () => {
    const cart = await newCart();
    // neck-anniversary-18: list 4999, sale 3999
    const updated = await provider.cart!.addItem({
      cartId: cart.id,
      variantId: "neck-anniversary-18",
      quantity: 2,
    });
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]!.unitPrice).toEqual(inr(3999));
    expect(updated.subtotal).toEqual(inr(3999 * 2));
  });

  it("merges re-adds of the same variant", async () => {
    const cart = await newCart();
    await provider.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
    const merged = await provider.cart!.addItem({
      cartId: cart.id,
      variantId: "neck-anniversary-18",
      quantity: 2,
    });
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.quantity).toBe(3);
    expect(merged.subtotal).toEqual(inr(3999 * 3));
  });

  it("updates and removes line items", async () => {
    const cart = await newCart();
    await provider.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
    await provider.cart!.addItem({ cartId: cart.id, variantId: "ear-pearl-drop-std", quantity: 1 });
    const full = await provider.cart!.get(cart.id);
    expect(full.items).toHaveLength(2);

    const pearl = full.items.find((i) => i.variantId === "ear-pearl-drop-std")!;
    const updated = await provider.cart!.updateItem({
      cartId: cart.id,
      itemId: pearl.id,
      quantity: 3,
    });
    expect(updated.items.find((i) => i.id === pearl.id)!.quantity).toBe(3);

    const removed = await provider.cart!.removeItem({ cartId: cart.id, itemId: pearl.id });
    expect(removed.items).toHaveLength(1);
    expect(removed.items[0]!.variantId).toBe("neck-anniversary-18");
  });

  it("refuses to add an out-of-stock variant", async () => {
    const cart = await newCart();
    await expect(
      provider.cart!.addItem({ cartId: cart.id, variantId: "neck-layered-trend-std", quantity: 1 }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("refuses to add more than the available stock", async () => {
    const cart = await newCart();
    await expect(
      provider.cart!.addItem({ cartId: cart.id, variantId: "ear-gold-studs-1g", quantity: 99 }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("returns NOT_FOUND for an unknown cart", async () => {
    await expect(provider.cart!.get("cart_nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("MVP 6 — mock checkout", () => {
  let provider: MockCommerceProvider;

  beforeEach(() => {
    provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });
  });

  async function checkoutWithOneItem(): Promise<{ cartId: string; checkoutId: string }> {
    const cart = await provider.cart!.create({ agentProfile: AGENT });
    await provider.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 1 });
    const checkout = await provider.checkout!.create({ cartId: cart.id, agentProfile: AGENT });
    return { cartId: cart.id, checkoutId: checkout.id };
  }

  it("creates a checkout from a non-empty cart with correct totals", async () => {
    const { checkoutId } = await checkoutWithOneItem();
    const checkout = await provider.checkout!.get(checkoutId);
    expect(checkout.status).toBe("created");
    expect(checkout.currency).toBe("INR");
    expect(checkout.totals?.subtotal).toEqual(inr(3999));
    expect(checkout.totals?.total).toEqual(inr(3999));
  });

  it("refuses to check out an empty cart", async () => {
    const cart = await provider.cart!.create({ agentProfile: AGENT });
    await expect(provider.checkout!.create({ cartId: cart.id })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("requires explicit buyer approval to complete", async () => {
    const { checkoutId } = await checkoutWithOneItem();
    await expect(provider.checkout!.complete(checkoutId)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    await expect(
      provider.checkout!.complete(checkoutId, { approval: { buyerApproved: false } }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("completes with approval, creating a confirmed order and converting the cart", async () => {
    const { cartId, checkoutId } = await checkoutWithOneItem();
    const order = await provider.checkout!.complete(checkoutId, {
      approval: { buyerApproved: true },
      agentProfile: AGENT,
    });
    expect(order.id).toMatch(/^ord_/);
    expect(order.checkoutId).toBe(checkoutId);
    expect(order.status).toBe("confirmed");
    expect(order.total).toEqual(inr(3999));

    const checkout = await provider.checkout!.get(checkoutId);
    expect(checkout.status).toBe("completed");
    expect(checkout.orderId).toBe(order.id);
    const cart = await provider.cart!.get(cartId);
    expect(cart.status).toBe("converted");
  });

  it("is idempotent when complete is called twice", async () => {
    const { checkoutId } = await checkoutWithOneItem();
    const first = await provider.checkout!.complete(checkoutId, { approval: { buyerApproved: true } });
    const second = await provider.checkout!.complete(checkoutId, { approval: { buyerApproved: true } });
    expect(second.id).toBe(first.id);
  });

  it("decrements stock when an order is created", async () => {
    const { checkoutId } = await checkoutWithOneItem();
    await provider.checkout!.complete(checkoutId, { approval: { buyerApproved: true } });
    const avail = await provider.inventory!.check({ variantId: "neck-anniversary-18" });
    expect(avail.quantity).toBe(11); // started at 12
  });

  it("cancels a checkout that is not yet completed", async () => {
    const { checkoutId } = await checkoutWithOneItem();
    const cancelled = await provider.checkout!.cancel(checkoutId);
    expect(cancelled.status).toBe("cancelled");
    await expect(provider.checkout!.complete(checkoutId, { approval: { buyerApproved: true } })).rejects.toMatchObject(
      { code: "INVALID_ARGUMENT" },
    );
  });
});

describe("graceful failure — stock disappears after selection", () => {
  it("fails completion when another purchase consumed the stock", async () => {
    const provider = createMockCommerceProvider({ storeUrl: "https://demo.example" });

    // ring-platinum-band-9 has exactly 1 unit in stock.
    // Agent B selects it and starts a checkout while it is still available.
    const cartB = await provider.cart!.create({ agentProfile: AGENT });
    await provider.cart!.addItem({ cartId: cartB.id, variantId: "ring-platinum-band-9", quantity: 1 });
    const chkB = await provider.checkout!.create({ cartId: cartB.id });

    // Agent A purchases the last unit before B completes.
    const cartA = await provider.cart!.create({ agentProfile: AGENT });
    await provider.cart!.addItem({ cartId: cartA.id, variantId: "ring-platinum-band-9", quantity: 1 });
    const chkA = await provider.checkout!.create({ cartId: cartA.id });
    await provider.checkout!.complete(chkA.id, { approval: { buyerApproved: true } });

    const avail = await provider.inventory!.check({ variantId: "ring-platinum-band-9" });
    expect(avail.status).toBe("out_of_stock");
    expect(avail.quantity).toBe(0);

    // B's checkout now fails gracefully at completion instead of over-selling.
    await expect(
      provider.checkout!.complete(chkB.id, { approval: { buyerApproved: true } }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
});
