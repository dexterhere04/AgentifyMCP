import { beforeEach, describe, expect, it } from "vitest";
import { createMockCommerceProvider, type MockCommerceProvider } from "@agentify/adapter-mock";
import { isProviderError } from "@agentify/canonical-commerce";
import { createAuditedCommerce, InMemoryAuditStore, type AuditStore } from "../src/index.js";

const AGENT = "https://agent.example/.well-known/ucp";

describe("AuditedCommerce — explainable money actions", () => {
  let raw: MockCommerceProvider;
  let audit: AuditStore;
  let commerce: ReturnType<typeof createAuditedCommerce>;

  beforeEach(() => {
    raw = createMockCommerceProvider({ storeUrl: "https://demo.example" });
    audit = new InMemoryAuditStore();
    commerce = createAuditedCommerce(raw, audit);
  });

  async function makeCheckout(): Promise<{ cartId: string; checkoutId: string }> {
    const cart = await commerce.cart!.create({ agentProfile: AGENT });
    await commerce.cart!.addItem({ cartId: cart.id, variantId: "neck-anniversary-18", quantity: 2, agentProfile: AGENT });
    const checkout = await commerce.checkout!.create({ cartId: cart.id, agentProfile: AGENT });
    return { cartId: cart.id, checkoutId: checkout.id };
  }

  it("records cart and checkout events with explanations", async () => {
    const { cartId, checkoutId } = await makeCheckout();
    // cart steps are keyed by cart_id (they precede checkout creation)
    const cartEvents = audit.byCart(cartId).map((e) => e.event);
    expect(cartEvents).toEqual(["cart.created", "cart.add_item", "checkout.created"]);
    const add = audit.byCart(cartId)[1]!;
    expect(add.explanation).toContain("2 × Classic Gold Necklace");
    expect(add.agent).toBe(AGENT);
    expect(add.amountAfter).toBe(2 * 399900);
    expect(add.amount).toBe(2 * 399900);

    const checkoutEvents = audit.byCheckout(checkoutId).map((e) => e.event);
    expect(checkoutEvents).toEqual(["checkout.created"]);
  });

  it("records a completion and the approval grant", async () => {
    const { checkoutId } = await makeCheckout();
    const order = await commerce.checkout!.complete(checkoutId, {
      approval: { buyerApproved: true },
      agentProfile: AGENT,
    });
    const events = audit.byCheckout(checkoutId);
    const completed = events.find((e) => e.event === "checkout.completed")!;
    expect(completed.order_id).toBe(order.id);
    expect(completed.approval).toEqual({ required: true, granted: true });
    expect(completed.amount).toBe(2 * 399900);
  });

  it("records a PRICE_CHANGED refusal explainably, then succeeds after re-approval", async () => {
    const { checkoutId } = await makeCheckout();
    // merchant raises the price between selection and completion
    raw.simulatePriceChange("neck-anniversary-18", 4299);

    try {
      await commerce.checkout!.complete(checkoutId, { approval: { buyerApproved: true } });
      expect.unreachable("should refuse");
    } catch (err) {
      expect(isProviderError(err)).toBe(true);
      expect((err as { code: string }).code).toBe("PRICE_CHANGED");
    }

    const refused = audit.byCheckout(checkoutId).find((e) => e.event === "checkout.complete.refused")!;
    expect(refused.reasonCode).toBe("PRICE_CHANGED");
    expect(refused.explanation).toContain("New total is 859800");
    expect(refused.approval).toEqual({ required: true, granted: false });

    // totals were refreshed to the live price; buyer re-approves and it completes
    const order = await commerce.checkout!.complete(checkoutId, { approval: { buyerApproved: true } });
    expect(order.total!.amount).toBe(859800);
    const completed = audit.byCheckout(checkoutId).find((e) => e.event === "checkout.completed")!;
    expect(completed.amount).toBe(859800);
    expect(completed.approval?.granted).toBe(true);
  });
});
