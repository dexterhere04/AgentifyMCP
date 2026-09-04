import { z } from "zod";
import { ProviderError } from "./errors.js";

/**
 * Canonical money representation.
 *
 * Rules (from the architecture document, section 3.2):
 * - Money uses minor currency units wherever possible (e.g. paise for INR).
 * - Currency is always explicit, as an ISO 4217 uppercase code.
 */

export const MONEY_MINOR_RE = /^[0-9]+$/;

export const CurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code like INR or USD");

export const MoneySchema = z
  .object({
    amount: z
      .number()
      .int()
      .nonnegative()
      .describe("Monetary amount in minor units (e.g. paise for INR)"),
    currency: CurrencySchema.describe("ISO 4217 currency code"),
  })
  .strict();

export type Money = z.infer<typeof MoneySchema>;

export interface MoneyInput {
  amount: number;
  currency: string;
}

/** Build a validated Money value. Throws ProviderError on invalid input. */
export function money(amount: number, currency: string): Money {
  const normalized = currency.trim().toUpperCase();
  const parsed = MoneySchema.safeParse({ amount, currency: normalized });
  if (!parsed.success) {
    throw new ProviderError(
      "INVALID_ARGUMENT",
      `invalid money value {amount: ${amount}, currency: ${currency}}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Number of minor units in one major unit for a currency. Defaults to 2 decimals. */
export function currencyExponent(currency: string): number {
  switch (currency.toUpperCase()) {
    case "JPY":
    case "KRW":
      return 0;
    default:
      return 2;
  }
}

/** Convert a major-unit value (e.g. 3999 rupees) into minor units (399900 paise). */
export function toMinorUnits(amountMajor: number, currency: string): number {
  const exponent = currencyExponent(currency);
  return Math.round(amountMajor * 10 ** exponent);
}

/** Create a Money value from a major-unit number. */
export function fromMajor(amountMajor: number, currency: string): Money {
  return money(toMinorUnits(amountMajor, currency), currency.toUpperCase());
}

/** Create a Money value from already-minor units. */
export function fromMinor(amountMinor: number, currency: string): Money {
  return money(Math.round(amountMinor), currency.toUpperCase());
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new ProviderError(
      "INVALID_ARGUMENT",
      `currency mismatch: cannot combine ${a.currency} and ${b.currency}`,
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

export function isMoneyZero(m: Money): boolean {
  return m.amount === 0;
}

export function moneyGreaterThan(a: Money, b: Money): boolean {
  assertSameCurrency(a, b);
  return a.amount > b.amount;
}

/** Two Money values are equal if amount and currency are equal. */
export function moneyEquals(a: Money, b: Money): boolean {
  return a.amount === b.amount && a.currency === b.currency;
}

/**
 * Parse an unambiguous numeric string of minor units, e.g. "399900".
 * Returns null when the input cannot be interpreted as minor units.
 */
export function parseMinorUnitsString(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!MONEY_MINOR_RE.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

/** Smallest amount representable above zero for a currency (used to detect no-op discounts). */
export function oneMinorUnit(currency: string): number {
  return 1;
}
