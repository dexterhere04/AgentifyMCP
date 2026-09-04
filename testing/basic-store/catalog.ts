export interface StoreVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  color?: string;
  size?: string;
  scent?: string;
  price: number;
  sale_price: number | null;
  stock: number;
}

export interface StoreProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  brand: string;
  images: string[];
  variants: StoreVariant[];
}

export const BRAND = "Common Goods Co.";
export const DEFAULT_CURRENCY = "INR";

export const PRODUCTS: StoreProduct[] = [
  {
    id: "harbor-backpack",
    title: "Harbor Canvas Backpack",
    description: "Waxed-canvas everyday backpack with a padded 15\" laptop sleeve and brass hardware.",
    category: "Bags",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/harbor-backpack.jpg"],
    variants: [
      { id: "v-harbor-backpack-navy", product_id: "harbor-backpack", sku: "CG-BKP-NVY-01", name: "Navy", color: "Navy", price: 2499, sale_price: 2099, stock: 18 },
      { id: "v-harbor-backpack-olive", product_id: "harbor-backpack", sku: "CG-BKP-OLV-01", name: "Olive", color: "Olive", price: 2499, sale_price: 2099, stock: 7 },
    ],
  },
  {
    id: "everyday-tote",
    title: "Everyday Cotton Tote",
    description: "Heavy 12 oz cotton tote with an interior zip pocket and flat base.",
    category: "Bags",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/everyday-tote.jpg"],
    variants: [
      { id: "v-tote-natural", product_id: "everyday-tote", sku: "CG-TOT-NAT-01", name: "Natural", color: "Natural", price: 499, sale_price: null, stock: 42 },
      { id: "v-tote-ink", product_id: "everyday-tote", sku: "CG-TOT-INK-01", name: "Ink", color: "Ink", price: 499, sale_price: null, stock: 0 },
    ],
  },
  {
    id: "onyx-desk-lamp",
    title: "Onyx Adjustable Desk Lamp",
    description: "Matte-black task lamp with three colour temperatures and a dimmer dial.",
    category: "Home",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/onyx-desk-lamp.jpg"],
    variants: [
      { id: "v-onyx-lamp", product_id: "onyx-desk-lamp", sku: "CG-LMP-ONX-01", name: "Standard", price: 1899, sale_price: null, stock: 12 },
    ],
  },
  {
    id: "soy-candle",
    title: "Stoneware Soy Candle",
    description: "Hand-poured soy candle in a reusable stoneware vessel. 45 hour burn.",
    category: "Home",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/soy-candle.jpg"],
    variants: [
      { id: "v-candle-cedar", product_id: "soy-candle", sku: "CG-CND-CDR-01", name: "Cedar & Sage", scent: "Cedar & Sage", price: 749, sale_price: null, stock: 26 },
      { id: "v-candle-grapefruit", product_id: "soy-candle", sku: "CG-CND-GPF-01", name: "Grapefruit", scent: "Grapefruit", price: 749, sale_price: 649, stock: 4 },
    ],
  },
  {
    id: "kraft-notebook",
    title: "Kraft Lined Notebook",
    description: "A5 dot-grid notebook, 192 pages of 100 gsm paper, lay-flat binding.",
    category: "Office",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/kraft-notebook.jpg"],
    variants: [
      { id: "v-notebook-grid", product_id: "kraft-notebook", sku: "CG-NBK-DOT-01", name: "Dot grid", size: "A5", price: 299, sale_price: null, stock: 60 },
      { id: "v-notebook-ruled", product_id: "kraft-notebook", sku: "CG-NBK-RLD-01", name: "Ruled", size: "A5", price: 299, sale_price: null, stock: 31 },
    ],
  },
  {
    id: "inkwell-pen-set",
    title: "Inkwell Rollerball Set",
    description: "Three matte rollerball pens with refillable ink cartridges in a tin.",
    category: "Office",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/inkwell-pen-set.jpg"],
    variants: [
      { id: "v-pens-set", product_id: "inkwell-pen-set", sku: "CG-PEN-SET-01", name: "Set of 3", price: 599, sale_price: 499, stock: 21 },
    ],
  },
  {
    id: "steel-tumbler",
    title: "Steel Insulated Tumbler",
    description: "Double-wall vacuum tumbler that keeps drinks cold for 24 hours. 473 ml.",
    category: "Kitchen",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/steel-tumbler.jpg"],
    variants: [
      { id: "v-tumbler-steel", product_id: "steel-tumbler", sku: "CG-TMB-STL-01", name: "Steel", color: "Steel", size: "473 ml", price: 899, sale_price: null, stock: 34 },
      { id: "v-tumbler-moss", product_id: "steel-tumbler", sku: "CG-TMB-MSS-01", name: "Moss", color: "Moss", size: "473 ml", price: 899, sale_price: null, stock: 0 },
    ],
  },
  {
    id: "signal-umbrella",
    title: "Signal Reversal Umbrella",
    description: "Windproof reverse-fold umbrella that dries inward and stands on its own.",
    category: "Outdoor",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/signal-umbrella.jpg"],
    variants: [
      { id: "v-umbrella-black", product_id: "signal-umbrella", sku: "CG-UMB-BLK-01", name: "Black", color: "Black", price: 1199, sale_price: null, stock: 15 },
    ],
  },
  {
    id: "leather-pouch",
    title: "Slim Leather Pouch",
    description: "Vegetable-tanned leather zip pouch for pens, cables and everyday carry.",
    category: "Accessories",
    brand: BRAND,
    images: ["https://cdn.common-goods.example/leather-pouch.jpg"],
    variants: [
      { id: "v-pouch-tan", product_id: "leather-pouch", sku: "CG-PCH-TAN-01", name: "Tan", color: "Tan", price: 649, sale_price: null, stock: 9 },
    ],
  },
];

export interface VariantRow extends StoreVariant {
  product_title: string;
}

export function productById(id: string): StoreProduct | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function variantRow(variant: StoreVariant, product: StoreProduct): VariantRow {
  return { ...variant, product_title: product.title };
}

export function variantById(id: string): VariantRow | undefined {
  for (const product of PRODUCTS) {
    const variant = product.variants.find((v) => v.id === id);
    if (variant) return variantRow(variant, product);
  }
  return undefined;
}
