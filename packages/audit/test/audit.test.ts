import { describe, expect, it } from "vitest";
import { InMemoryAuditStore, SqliteAuditStore, type MoneyActionEvent } from "../src/index.js";

function sample(checkoutId: string, order = ""): MoneyActionEvent {
  return {
    event: "cart.add_item",
    checkout_id: checkoutId,
    ...(order ? { order_id: order } : {}),
    amount: 399900,
    currency: "INR",
    explanation: "test",
    timestamp: new Date().toISOString(),
  };
}

describe("InMemoryAuditStore", () => {
  it("records, orders by checkout, and filters", () => {
    const store = new InMemoryAuditStore();
    store.record(sample("chk_1"));
    store.record({ ...sample("chk_1"), event: "checkout.completed", order_id: "ord_1", amount: 500000 });
    store.record(sample("chk_2"));

    const trail = store.byCheckout("chk_1");
    expect(trail.map((e) => e.event)).toEqual(["cart.add_item", "checkout.completed"]);

    const orders = store.byOrder("ord_1");
    expect(orders).toHaveLength(1);
    expect(orders[0]!.event).toBe("checkout.completed");

    expect(store.list({ type: "cart.add_item" })).toHaveLength(2);
    expect(store.list({ checkoutId: "chk_2" })).toHaveLength(1);
  });
});

describe("SqliteAuditStore", () => {
  it("persists and queries across instances", () => {
    const a = new SqliteAuditStore(":memory:");
    a.record(sample("chk_1"));
    a.record({ ...sample("chk_1"), event: "checkout.completed", order_id: "ord_9" });
    expect(a.byCheckout("chk_1").map((e) => e.event)).toEqual(["cart.add_item", "checkout.completed"]);
    expect(a.byOrder("ord_9")).toHaveLength(1);
    a.close();
  });
});
