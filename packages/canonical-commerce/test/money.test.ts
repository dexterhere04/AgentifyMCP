import { describe, expect, it } from "vitest";
import {
  fromMajor,
  fromMinor,
  money,
  moneyEquals,
  parseMinorUnitsString,
  subtractMoney,
  toMinorUnits,
} from "../src/index.js";

describe("money normalization", () => {
  it("stores amounts in minor units", () => {
    const inr = fromMajor(3999, "INR");
    expect(inr.amount).toBe(399900);
    expect(inr.currency).toBe("INR");
  });

  it("supports zero-decimal currencies", () => {
    expect(toMinorUnits(100, "JPY")).toBe(100);
    expect(fromMinor(1234, "USD").amount).toBe(1234);
  });

  it("keeps currency explicit and uppercases on construction", () => {
    expect(money(500, "inr")).toEqual({ amount: 500, currency: "INR" });
    expect(moneyEquals(money(500, "INR"), { amount: 500, currency: "INR" })).toBe(true);
  });

  it("rejects negative or fractional minor amounts", () => {
    expect(() => money(-1, "INR")).toThrow();
    expect(() => money(3999.5, "INR")).toThrow();
    expect(() => money(100, "IN")).toThrow();
  });

  it("parses unambiguous minor-unit numeric strings", () => {
    expect(parseMinorUnitsString("399900")).toBe(399900);
    expect(parseMinorUnitsString(" 5000 ")).toBe(5000);
    expect(parseMinorUnitsString("₹3,999")).toBeNull();
    expect(parseMinorUnitsString("3999.00")).toBeNull();
  });

  it("adds and subtracts in the same currency", () => {
    const a = fromMajor(100, "INR");
    const b = fromMajor(250, "INR");
    expect(subtractMoney(b, a).amount).toBe(25000 - 10000);
  });

  it("rejects cross-currency arithmetic", () => {
    expect(() => subtractMoney(fromMajor(100, "INR"), fromMajor(100, "USD"))).toThrow(
      /currency mismatch/,
    );
  });
});
