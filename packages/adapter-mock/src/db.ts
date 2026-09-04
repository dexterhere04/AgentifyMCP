import { DatabaseSync } from "node:sqlite";
import { toMinorUnits } from "@gateway/canonical-commerce";
import type { SeedDiscount, SeedProduct } from "./seed.js";

/**
 * The mock merchant's own database. It deliberately looks like a small
 * backend an ecommerce store might run (a products table with a join table
 * for variants and a separate discount table) rather than a copy of the
 * gateway's canonical model. The adapter is responsible for normalization.
 */

export interface VariantRow {
  id: string;
  product_id: string;
  sku: string | null;
  title: string | null;
  attr_json: string;
  list_price_minor: number | null;
  list_currency: string | null;
  sale_price_minor: number | null;
  sale_currency: string | null;
  stock_qty: number | null;
  stock_status: string | null;
  images_json: string;
}

export interface ProductRow {
  id: string;
  ref: string;
  title: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;
  material: string | null;
  occasions_json: string;
  images_json: string;
  malformed: number;
}

export interface DiscountRow {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  type: string;
  scope: string;
  value: number | null;
  amount_minor: number | null;
  currency: string | null;
  code: string | null;
  title: string | null;
  description: string | null;
  valid_from: string | null;
  valid_until: string | null;
}

export function openMockMerchantDb(products: SeedProduct[], dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id            TEXT PRIMARY KEY,
      ref           TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT,
      category      TEXT,
      brand         TEXT,
      material      TEXT,
      occasions_json TEXT NOT NULL DEFAULT '[]',
      images_json   TEXT NOT NULL DEFAULT '[]',
      malformed     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS variants (
      id              TEXT PRIMARY KEY,
      product_id      TEXT NOT NULL REFERENCES products(id),
      sku             TEXT,
      title           TEXT,
      attr_json       TEXT NOT NULL DEFAULT '{}',
      list_price_minor INTEGER,
      list_currency   TEXT,
      sale_price_minor INTEGER,
      sale_currency   TEXT,
      stock_qty       INTEGER,
      stock_status    TEXT,
      images_json     TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);

    CREATE TABLE IF NOT EXISTS discounts (
      id            TEXT PRIMARY KEY,
      product_id    TEXT,
      variant_id    TEXT,
      type          TEXT NOT NULL,
      scope         TEXT NOT NULL,
      value         REAL,
      amount_minor  INTEGER,
      currency      TEXT,
      code          TEXT,
      title         TEXT,
      description   TEXT,
      valid_from    TEXT,
      valid_until   TEXT
    );
  `);

  const clear = db.prepare("DELETE FROM discounts; DELETE FROM variants; DELETE FROM products;");
  clear.run();

  const insertProduct = db.prepare(`
    INSERT INTO products (id, ref, title, description, category, brand, material,
                          occasions_json, images_json, malformed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO variants (id, product_id, sku, title, attr_json,
                          list_price_minor, list_currency, sale_price_minor, sale_currency,
                          stock_qty, stock_status, images_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDiscount = db.prepare(`
    INSERT INTO discounts (id, product_id, variant_id, type, scope, value,
                           amount_minor, currency, code, title, description, valid_from, valid_until)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");

  try {
    for (const p of products) {
      insertProduct.run(
        p.id,
        p.ref,
        p.title,
        p.description ?? null,
        p.category,
        p.brand,
        p.material ?? null,
        JSON.stringify(p.occasions ?? []),
        JSON.stringify([`https://img.demo.example/${p.id}.jpg`]),
        p.malformed ? 1 : 0,
      );

      for (const v of p.variants) {
        const malformed = p.malformed;
        insertVariant.run(
          v.id,
          p.id,
          malformed ? null : v.sku,
          malformed ? null : (v.title ?? null),
          JSON.stringify(v.attributes ?? {}),
          // A malformed record is simulated by a missing (NULL) list price.
          malformed ? null : toMinorUnits(v.listPriceMajor, "INR"),
          malformed ? null : "INR",
          !malformed && v.salePriceMajor !== undefined
            ? toMinorUnits(v.salePriceMajor, "INR")
            : null,
          !malformed && v.salePriceMajor !== undefined ? "INR" : null,
          v.stock.quantity === undefined ? null : v.stock.quantity,
          malformed ? null : (v.stock.status ?? null),
          "[]",
        );
      }

      for (const d of p.discounts ?? []) {
        insertDiscountRow(insertDiscount, p.id, d);
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return db;
}

function insertDiscountRow(
  insert: ReturnType<DatabaseSync["prepare"]>,
  productId: string,
  d: SeedDiscount,
): void {
  insert.run(
    d.id,
    d.scope === "variant" ? null : productId,
    d.scope === "variant" ? (d.variantId ?? null) : null,
    d.type,
    d.scope,
    d.value ?? null,
    d.amountMajor !== undefined ? toMinorUnits(d.amountMajor, "INR") : null,
    "INR",
    null,
    d.title ?? null,
    d.description ?? null,
    d.validFrom ?? null,
    d.validUntil ?? null,
  );
}


// Variant-scoped discounts in the seed carry the variant id directly in the
// discount id suffix. For the mock store we derive it deterministically.
function variantIdFromDiscount(d: SeedDiscount): string {
  const productId = d.id.replace(/^disc-/, "").split("-")[0] ?? "";
  return `${productId}-std`;
}
