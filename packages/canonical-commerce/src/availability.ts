import { z } from "zod";

/**
 * Canonical availability model.
 *
 * Inventory must distinguish four states (architecture doc section 3.2):
 * - in_stock
 * - out_of_stock
 * - limited
 * - unknown
 *
 * `quantity` is optional and, when present, is a non-negative integer count.
 */

export const AvailabilityStatusSchema = z.enum([
  "in_stock",
  "out_of_stock",
  "limited",
  "unknown",
]);

export type AvailabilityStatus = z.infer<typeof AvailabilityStatusSchema>;

export const AvailabilitySchema = z
  .object({
    status: AvailabilityStatusSchema,
    quantity: z.number().int().nonnegative().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type Availability = z.infer<typeof AvailabilitySchema>;

/** The four stock states, in order from best to worst (used for sorting). */
export const STATUS_ORDER: Record<AvailabilityStatus, number> = {
  in_stock: 0,
  limited: 1,
  unknown: 2,
  out_of_stock: 3,
};

/**
 * Map a merchant inventory value into a canonical Availability.
 *
 * `quantity`:
 *   number 12   -> in_stock(12)
 *   number 0    -> out_of_stock(0)
 *   null        -> unknown
 *
 * `statusOverride` wins when the merchant already expresses a state.
 */
export function normalizeAvailability(
  quantity: number | null | undefined,
  statusOverride?: AvailabilityStatus,
  updatedAt?: string,
): Availability {
  if (statusOverride) {
    return {
      status: statusOverride,
      ...(typeof quantity === "number" && Number.isFinite(quantity)
        ? { quantity: Math.max(0, Math.round(quantity)) }
        : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    return { status: "unknown", ...(updatedAt ? { updatedAt } : {}) };
  }

  const q = Math.max(0, Math.round(quantity));
  if (q === 0) {
    return { status: "out_of_stock", quantity: q, ...(updatedAt ? { updatedAt } : {}) };
  }
  return { status: "in_stock", quantity: q, ...(updatedAt ? { updatedAt } : {}) };
}

export function isInStock(availability: Availability): boolean {
  return availability.status === "in_stock" || availability.status === "limited";
}

/** Interpret booleans/strings/objects from merchant APIs into an Availability. */
export function availabilityFromSource(
  value: unknown,
  updatedAt?: string,
): Availability {
  if (typeof value === "boolean") {
    return value
      ? { status: "in_stock", ...(updatedAt ? { updatedAt } : {}) }
      : { status: "out_of_stock", quantity: 0, ...(updatedAt ? { updatedAt } : {}) };
  }
  if (typeof value === "number") {
    return normalizeAvailability(value, undefined, updatedAt);
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (["in_stock", "instock", "available", "true"].includes(lowered)) {
      return { status: "in_stock", ...(updatedAt ? { updatedAt } : {}) };
    }
    if (["out_of_stock", "outofstock", "soldout", "false"].includes(lowered)) {
      return { status: "out_of_stock", quantity: 0, ...(updatedAt ? { updatedAt } : {}) };
    }
    if (["limited", "low_stock", "few_left"].includes(lowered)) {
      return { status: "limited", ...(updatedAt ? { updatedAt } : {}) };
    }
    if (["unknown", "call_for_availability"].includes(lowered)) {
      return { status: "unknown", ...(updatedAt ? { updatedAt } : {}) };
    }
    return { status: "unknown", ...(updatedAt ? { updatedAt } : {}) };
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const q = typeof record.quantity === "number" ? record.quantity : undefined;
    if (typeof record.available === "boolean") {
      if (record.available) {
        return q !== undefined && q === 0
          ? { status: "out_of_stock", quantity: 0, ...(updatedAt ? { updatedAt } : {}) }
          : {
              status: "in_stock",
              ...(q !== undefined ? { quantity: Math.max(0, Math.round(q)) } : {}),
              ...(updatedAt ? { updatedAt } : {}),
            };
      }
      return { status: "out_of_stock", quantity: 0, ...(updatedAt ? { updatedAt } : {}) };
    }
    return normalizeAvailability(q, undefined, updatedAt);
  }
  return { status: "unknown", ...(updatedAt ? { updatedAt } : {}) };
}
