import type { AvailabilityStatus } from "@agentify/canonical-commerce";

/**
 * Seed catalog for the mock merchant ("Aarna Jewels").
 *
 * Prices are authored in major INR units (rupees) for readability and are
 * converted to minor units (paise) at insert time. Every stock state that the
 * canonical model supports is represented so the acceptance suite has fixtures:
 * in_stock, out_of_stock, limited, unknown.
 */

export type Stock =
  | { quantity: number; status?: AvailabilityStatus }
  | { quantity?: null; status: AvailabilityStatus };

export interface SeedVariant {
  id: string;
  sku: string;
  title?: string;
  attributes?: Record<string, string>;
  listPriceMajor: number;
  salePriceMajor?: number;
  stock: Stock;
}

export interface SeedDiscount {
  id: string;
  scope: "product" | "variant";
  /** Required when scope is "variant". */
  variantId?: string;
  type: "automatic";
  value?: number;
  amountMajor?: number;
  title?: string;
  description?: string;
  validFrom?: string;
  validUntil?: string;
}

export interface SeedProduct {
  id: string;
  ref: string;
  title: string;
  category: string;
  brand: string;
  description: string;
  material?: string;
  occasions?: string[];
  /** Flagged rows simulate a merchant backend returning corrupt records. */
  malformed?: boolean;
  discounts?: SeedDiscount[];
  variants: SeedVariant[];
}

const inStock = (quantity: number): Stock => ({ quantity, status: "in_stock" });
const limited = (quantity: number): Stock => ({ quantity, status: "limited" });
const out = (): Stock => ({ quantity: 0, status: "out_of_stock" });
const unknown = (): Stock => ({ status: "unknown" });

export const STANDARD_SEED: SeedProduct[] = [
  // -------------------------------------------------------------------------
  // Necklaces
  // -------------------------------------------------------------------------
  {
    id: "neck-anniversary",
    ref: "N-101",
    title: "Classic Gold Necklace",
    category: "Necklaces",
    brand: "Aarna",
    description: "A timeless minimalist gold chain, perfect as an anniversary gift.",
    material: "22K Gold",
    occasions: ["anniversary", "wedding", "birthday"],
    discounts: [
      {
        id: "disc-neck-anniversary-10",
        scope: "product",
        type: "automatic",
        value: 10,
        title: "10% off anniversary edits",
        validUntil: "2030-01-01T00:00:00.000Z",
      },
    ],
    variants: [
      {
        id: "neck-anniversary-18",
        sku: "N-101-18",
        title: "18 inch",
        attributes: { size: "18 inch", purity: "22K", finish: "polished" },
        listPriceMajor: 4999,
        salePriceMajor: 3999,
        stock: inStock(12),
      },
      {
        id: "neck-anniversary-20",
        sku: "N-101-20",
        title: "20 inch",
        attributes: { size: "20 inch", purity: "22K", finish: "polished" },
        listPriceMajor: 5499,
        salePriceMajor: 4399,
        stock: inStock(6),
      },
    ],
  },
  {
    id: "neck-mangalsutra",
    ref: "N-102",
    title: "Mangalsutra with Diamond Pendant",
    category: "Necklaces",
    brand: "Aarna",
    description: "Elegant everyday mangalsutra with a delicate diamond accent.",
    material: "18K Gold",
    occasions: ["wedding", "traditional"],
    variants: [
      {
        id: "neck-mangalsutra-std",
        sku: "N-102-STD",
        title: "Standard",
        attributes: { purity: "18K", length: "16 inch" },
        listPriceMajor: 12999,
        stock: inStock(3),
      },
      {
        id: "neck-mangalsutra-lx",
        sku: "N-102-LX",
        title: "With extended chain",
        attributes: { purity: "18K", length: "18 inch" },
        listPriceMajor: 13999,
        stock: limited(2),
      },
    ],
  },
  {
    id: "neck-silver-cuff",
    ref: "N-103",
    title: "Minimalist Silver Cuff Necklace",
    category: "Necklaces",
    brand: "Mira",
    description: "Understated sterling silver necklace for everyday minimal looks.",
    material: "Sterling Silver",
    occasions: ["everyday", "office"],
    variants: [
      {
        id: "neck-silver-cuff-16",
        sku: "N-103-16",
        title: "16 inch",
        attributes: { size: "16 inch", finish: "matte" },
        listPriceMajor: 2499,
        stock: inStock(20),
      },
      {
        id: "neck-silver-cuff-18",
        sku: "N-103-18",
        title: "18 inch",
        attributes: { size: "18 inch", finish: "matte" },
        listPriceMajor: 2699,
        stock: inStock(9),
      },
    ],
  },
  {
    id: "neck-pearl-strand",
    ref: "N-104",
    title: "Freshwater Pearl Strand",
    category: "Necklaces",
    brand: "Mira",
    description: "Classic freshwater pearl strand, a graceful gift for any occasion.",
    material: "Pearl",
    occasions: ["anniversary", "wedding", "gift"],
    variants: [
      {
        id: "neck-pearl-strand-16",
        sku: "N-104-16",
        title: "16 inch",
        attributes: { size: "16 inch", length: "16 inch" },
        listPriceMajor: 8999,
        salePriceMajor: 7499,
        stock: inStock(5),
      },
    ],
  },
  {
    id: "neck-layered-trend",
    ref: "N-105",
    title: "Layered Boho Necklace Set",
    category: "Necklaces",
    brand: "Aarna",
    description: "Trendy layered necklace set in mixed metals.",
    material: "Mixed Metal",
    occasions: ["casual", "party"],
    variants: [
      {
        id: "neck-layered-trend-std",
        sku: "N-105-STD",
        title: "One size",
        attributes: { finish: "antique", length: "18-20 inch" },
        listPriceMajor: 1499,
        stock: out(),
      },
    ],
  },
  {
    id: "neck-kundan-bridal",
    ref: "N-106",
    title: "Kundan Bridal Choker",
    category: "Necklaces",
    brand: "Ritika",
    description: "Statement kundan choker for bridal occasions.",
    material: "Gold Plated",
    occasions: ["wedding", "festive"],
    variants: [
      {
        id: "neck-kundan-bridal-std",
        sku: "N-106-STD",
        title: "One size",
        attributes: { finish: "kundan", size: "adjustable" },
        listPriceMajor: 5999,
        stock: unknown(),
      },
    ],
  },
  {
    id: "neck-solitaire-rhodium",
    ref: "N-107",
    title: "Rhodium Plated Solitaire Pendant",
    category: "Necklaces",
    brand: "Mira",
    description: "A quiet solitaire pendant on a fine rhodium-plated chain.",
    material: "Rhodium Plated",
    occasions: ["office", "gift"],
    variants: [
      {
        id: "neck-solitaire-rhodium-std",
        sku: "N-107-STD",
        title: "One size",
        attributes: { finish: "rhodium", chain: "18 inch" },
        listPriceMajor: 3499,
        stock: inStock(15),
      },
    ],
  },
  {
    id: "neck-antique-gold",
    ref: "N-108",
    title: "Antique Gold Temple Necklace",
    category: "Necklaces",
    brand: "Ritika",
    description: "Handcrafted antique-finish temple jewellery, festive staple.",
    material: "22K Gold",
    occasions: ["festive", "traditional"],
    discounts: [
      {
        id: "disc-neck-antique-15",
        scope: "product",
        type: "automatic",
        value: 15,
        title: "Festive 15% off",
        validUntil: "2030-01-01T00:00:00.000Z",
      },
    ],
    variants: [
      {
        id: "neck-antique-gold-std",
        sku: "N-108-STD",
        title: "One size",
        attributes: { finish: "antique", size: "18 inch" },
        listPriceMajor: 19999,
        salePriceMajor: 16999,
        stock: inStock(2),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Earrings
  // -------------------------------------------------------------------------
  {
    id: "ear-gold-studs",
    ref: "E-201",
    title: "Classic Gold Stud Earrings",
    category: "Earrings",
    brand: "Aarna",
    description: "Everyday 22k gold studs that go with everything.",
    material: "22K Gold",
    occasions: ["everyday", "office", "gift"],
    variants: [
      {
        id: "ear-gold-studs-1g",
        sku: "E-201-1G",
        title: "1 g pair",
        attributes: { weight: "1 g", closure: "push back" },
        listPriceMajor: 3899,
        salePriceMajor: 3499,
        stock: limited(2),
      },
      {
        id: "ear-gold-studs-2g",
        sku: "E-201-2G",
        title: "2 g pair",
        attributes: { weight: "2 g", closure: "push back" },
        listPriceMajor: 7599,
        stock: inStock(8),
      },
    ],
  },
  {
    id: "ear-jhumka",
    ref: "E-202",
    title: "Traditional Gold Jhumkas",
    category: "Earrings",
    brand: "Ritika",
    description: "Festive jhumka earrings with a classic bell silhouette.",
    material: "Gold Plated",
    occasions: ["festive", "wedding"],
    variants: [
      {
        id: "ear-jhumka-std",
        sku: "E-202-STD",
        title: "One size",
        attributes: { finish: "gold plated", drop: "2 inch" },
        listPriceMajor: 1299,
        stock: inStock(30),
      },
    ],
  },
  {
    id: "ear-hoops-silver",
    ref: "E-203",
    title: "Sterling Silver Hoops",
    category: "Earrings",
    brand: "Mira",
    description: "Lightweight silver hoops, a wardrobe essential.",
    material: "Sterling Silver",
    occasions: ["everyday", "casual"],
    variants: [
      {
        id: "ear-hoops-silver-1in",
        sku: "E-203-1IN",
        title: "1 inch",
        attributes: { size: "1 inch", closure: "hinge" },
        listPriceMajor: 1999,
        stock: out(),
      },
      {
        id: "ear-hoops-silver-1.5in",
        sku: "E-203-15IN",
        title: "1.5 inch",
        attributes: { size: "1.5 inch", closure: "hinge" },
        listPriceMajor: 2299,
        stock: inStock(7),
      },
    ],
  },
  {
    id: "ear-pearl-drop",
    ref: "E-204",
    title: "Pearl Drop Earrings",
    category: "Earrings",
    brand: "Mira",
    description: "Elegant pearl drops for weddings and evenings.",
    material: "Pearl",
    occasions: ["wedding", "anniversary", "party"],
    variants: [
      {
        id: "ear-pearl-drop-std",
        sku: "E-204-STD",
        title: "One size",
        attributes: { closure: "hook", drop: "1.5 inch" },
        listPriceMajor: 2799,
        salePriceMajor: 2199,
        stock: inStock(11),
      },
    ],
  },
  {
    id: "ear-diamond-huggies",
    ref: "E-205",
    title: "Diamond Huggies",
    category: "Earrings",
    brand: "Aarna",
    description: "Tiny diamond huggies that catch the light.",
    material: "18K Gold",
    occasions: ["office", "gift", "party"],
    discounts: [
      {
        id: "disc-ear-diamond-20",
        scope: "product",
        type: "automatic",
        value: 20,
        title: "20% off diamond studs",
        validUntil: "2030-01-01T00:00:00.000Z",
      },
    ],
    variants: [
      {
        id: "ear-diamond-huggies-std",
        sku: "E-205-STD",
        title: "One size",
        attributes: { closure: "hinge", carat: "0.10 ct" },
        listPriceMajor: 8999,
        stock: inStock(4),
      },
    ],
  },
  {
    id: "ear-stone-drops",
    ref: "E-206",
    title: "Gemstone Drop Earrings",
    category: "Earrings",
    brand: "Mira",
    description: "Colourful gemstone drops in mixed metals.",
    material: "Mixed Metal",
    occasions: ["party", "casual"],
    variants: [
      {
        id: "ear-stone-drops-blue",
        sku: "E-206-BLUE",
        title: "Blue topaz",
        attributes: { gemstone: "topaz", colour: "blue" },
        listPriceMajor: 1699,
        stock: inStock(14),
      },
      {
        id: "ear-stone-drops-green",
        sku: "E-206-GREEN",
        title: "Green peridot",
        attributes: { gemstone: "peridot", colour: "green" },
        listPriceMajor: 1699,
        stock: inStock(3),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Rings
  // -------------------------------------------------------------------------
  {
    id: "ring-silver-band",
    ref: "R-301",
    title: "Plain Silver Band Ring",
    category: "Rings",
    brand: "Mira",
    description: "A clean sterling silver band, no discounts, always a staple.",
    material: "Sterling Silver",
    occasions: ["everyday"],
    variants: [
      {
        id: "ring-silver-band-6",
        sku: "R-301-6",
        title: "Size 6",
        attributes: { size: "6", finish: "polished" },
        listPriceMajor: 999,
        stock: inStock(40),
      },
      {
        id: "ring-silver-band-7",
        sku: "R-301-7",
        title: "Size 7",
        attributes: { size: "7", finish: "polished" },
        listPriceMajor: 999,
        stock: inStock(25),
      },
      {
        id: "ring-silver-band-8",
        sku: "R-301-8",
        title: "Size 8",
        attributes: { size: "8", finish: "polished" },
        listPriceMajor: 999,
        stock: out(),
      },
    ],
  },
  {
    id: "ring-solitaire",
    ref: "R-302",
    title: "Diamond Solitaire Ring",
    category: "Rings",
    brand: "Aarna",
    description: "A classic solitaire for proposals and milestones.",
    material: "18K Gold",
    occasions: ["engagement", "anniversary", "wedding"],
    variants: [
      {
        id: "ring-solitaire-6",
        sku: "R-302-6",
        title: "Size 6",
        attributes: { size: "6", carat: "0.20 ct", purity: "18K" },
        listPriceMajor: 24999,
        salePriceMajor: 20999,
        stock: inStock(2),
      },
      {
        id: "ring-solitaire-7",
        sku: "R-302-7",
        title: "Size 7",
        attributes: { size: "7", carat: "0.20 ct", purity: "18K" },
        listPriceMajor: 24999,
        salePriceMajor: 20999,
        stock: inStock(2),
      },
    ],
  },
  {
    id: "ring-stone-stack",
    ref: "R-303",
    title: "Stackable Gemstone Rings",
    category: "Rings",
    brand: "Mira",
    description: "Mix-and-match stackable bands with tiny gemstones.",
    material: "Gold Plated",
    occasions: ["casual", "gift"],
    variants: [
      {
        id: "ring-stone-stack-set3",
        sku: "R-303-SET3",
        title: "Set of 3",
        attributes: { quantity: "3", finish: "gold plated" },
        listPriceMajor: 1499,
        salePriceMajor: 1199,
        stock: inStock(18),
      },
    ],
  },
  {
    id: "ring-rose-gold-band",
    ref: "R-304",
    title: "Rose Gold CZ Band",
    category: "Rings",
    brand: "Aarna",
    description: "Delicate rose gold band with cubic zirconia.",
    material: "Rose Gold Plated",
    occasions: ["party", "gift", "casual"],
    variants: [
      {
        id: "ring-rose-gold-band-7",
        sku: "R-304-7",
        title: "Size 7",
        attributes: { size: "7", finish: "rose gold", stones: "CZ" },
        listPriceMajor: 1799,
        stock: unknown(),
      },
    ],
  },
  {
    id: "ring-platinum-band",
    ref: "R-305",
    title: "Platinum Wedding Band",
    category: "Rings",
    brand: "Ritika",
    description: "Hallmarked platinum wedding band.",
    material: "Platinum",
    occasions: ["wedding"],
    variants: [
      {
        id: "ring-platinum-band-9",
        sku: "R-305-9",
        title: "Size 9",
        attributes: { size: "9", purity: "950" },
        listPriceMajor: 38999,
        stock: inStock(1),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Bracelets
  // -------------------------------------------------------------------------
  {
    id: "brace-tennis",
    ref: "B-401",
    title: "Tennis Bracelet",
    category: "Bracelets",
    brand: "Aarna",
    description: "Classic tennis bracelet lined with sparkling stones.",
    material: "Gold Plated",
    occasions: ["anniversary", "party", "wedding"],
    discounts: [
      {
        id: "disc-brace-tennis-10",
        scope: "product",
        type: "automatic",
        value: 10,
        title: "Bracelet week 10% off",
        validUntil: "2030-01-01T00:00:00.000Z",
      },
    ],
    variants: [
      {
        id: "brace-tennis-std",
        sku: "B-401-STD",
        title: "7 inch",
        attributes: { size: "7 inch", closure: "lobster" },
        listPriceMajor: 4999,
        salePriceMajor: 3999,
        stock: inStock(6),
      },
    ],
  },
  {
    id: "brace-oxidised-cuff",
    ref: "B-402",
    title: "Oxidised Silver Cuff",
    category: "Bracelets",
    brand: "Ritika",
    description: "Tribal oxidised cuff with hand-engraved details.",
    material: "Oxidised Silver",
    occasions: ["traditional", "casual"],
    variants: [
      {
        id: "brace-oxidised-cuff-std",
        sku: "B-402-STD",
        title: "One size",
        attributes: { finish: "oxidised", style: "cuff" },
        listPriceMajor: 1299,
        stock: inStock(9),
      },
    ],
  },
  {
    id: "brace-beaded-thread",
    ref: "B-403",
    title: "Beaded Thread Bracelet",
    category: "Bracelets",
    brand: "Mira",
    description: "Adjustable beaded thread bracelet, fun for stacking.",
    material: "Mixed Metal",
    occasions: ["casual"],
    variants: [
      {
        id: "brace-beaded-thread-std",
        sku: "B-403-STD",
        title: "Adjustable",
        attributes: { colour: "multicolour" },
        listPriceMajor: 499,
        stock: out(),
      },
    ],
  },
  {
    id: "brace-gold-chain",
    ref: "B-404",
    title: "Gold Chain Bracelet",
    category: "Bracelets",
    brand: "Aarna",
    description: "Fine 22k gold chain bracelet for daily wear.",
    material: "22K Gold",
    occasions: ["everyday", "gift"],
    variants: [
      {
        id: "brace-gold-chain-7",
        sku: "B-404-7",
        title: "7 inch",
        attributes: { size: "7 inch", purity: "22K" },
        listPriceMajor: 14999,
        salePriceMajor: 13499,
        stock: inStock(3),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Anklets & Bangles
  // -------------------------------------------------------------------------
  {
    id: "anklet-silver-chain",
    ref: "A-501",
    title: "Sterling Silver Anklet",
    category: "Anklets",
    brand: "Mira",
    description: "Dainty sterling silver anklet with a tiny charm.",
    material: "Sterling Silver",
    occasions: ["casual", "summer"],
    variants: [
      {
        id: "anklet-silver-chain-std",
        sku: "A-501-STD",
        title: "9 inch",
        attributes: { size: "9 inch", charm: "heart" },
        listPriceMajor: 1899,
        salePriceMajor: 1499,
        stock: inStock(13),
      },
    ],
  },
  {
    id: "anklet-gold-payal",
    ref: "A-502",
    title: "Traditional Gold Payal",
    category: "Anklets",
    brand: "Ritika",
    description: "Classic gold-tone payal set for festive wear.",
    material: "Gold Plated",
    occasions: ["traditional", "wedding"],
    variants: [
      {
        id: "anklet-gold-payal-std",
        sku: "A-502-STD",
        title: "Pair",
        attributes: { quantity: "pair", style: "payal" },
        listPriceMajor: 2199,
        stock: unknown(),
      },
    ],
  },
  {
    id: "bangle-set-glass",
    ref: "B-601",
    title: "Coloured Glass Bangle Set",
    category: "Bangles",
    brand: "Mira",
    description: "Set of six traditional glass bangles.",
    material: "Glass",
    occasions: ["festive", "traditional"],
    variants: [
      {
        id: "bangle-set-glass-red",
        sku: "B-601-RED",
        title: "Red set of 6",
        attributes: { colour: "red", quantity: "6" },
        listPriceMajor: 599,
        stock: inStock(60),
      },
      {
        id: "bangle-set-glass-green",
        sku: "B-601-GREEN",
        title: "Green set of 6",
        attributes: { colour: "green", quantity: "6" },
        listPriceMajor: 599,
        stock: inStock(22),
      },
    ],
  },
  {
    id: "bangle-gold-kada",
    ref: "B-602",
    title: "Gold Kada",
    category: "Bangles",
    brand: "Aarna",
    description: "Bold 22k gold kada, unisex.",
    material: "22K Gold",
    occasions: ["festive", "wedding", "traditional"],
    discounts: [
      {
        id: "disc-bangle-kada-5",
        scope: "variant",
        variantId: "bangle-gold-kada-60g",
        type: "automatic",
        value: 5,
        title: "Kada making-charge waiver (5%)",
        validUntil: "2030-01-01T00:00:00.000Z",
      },
    ],
    variants: [
      {
        id: "bangle-gold-kada-60g",
        sku: "B-602-60G",
        title: "60 g",
        attributes: { weight: "60 g", purity: "22K", size: "2.4 inch" },
        listPriceMajor: 249000,
        stock: inStock(1),
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Edge cases for the acceptance suite
  // -------------------------------------------------------------------------

  // Malformed merchant record: the "backend" returns a product whose variant
  // payload is missing its price. getProduct must surface MALFORMED_RECORD and
  // search must exclude it rather than crash.
  {
    id: "malformed-1",
    ref: "X-900",
    title: "Broken Listing",
    category: "Necklaces",
    brand: "Aarna",
    description: "This row simulates a corrupt backend record.",
    malformed: true,
    variants: [
      {
        id: "malformed-1-v1",
        sku: "X-900-V1",
        title: "Broken variant",
        listPriceMajor: 0,
        stock: inStock(1),
      },
    ],
  },

  // Duplicate merchant SKU: two variants under different products share a SKU,
  // which many backends do by mistake. Lookups by product/variant id must not
  // crash and must never collide with each other.
  {
    id: "dup-sku-a",
    ref: "D-001",
    title: "Duplicate SKU Item A",
    category: "Bracelets",
    brand: "Mira",
    description: "Shares its SKU with item B to test duplicate handling.",
    variants: [
      {
        id: "dup-sku-a-v1",
        sku: "SKU-DUP-1",
        title: "Variant A1",
        listPriceMajor: 1999,
        stock: inStock(5),
      },
    ],
  },
  {
    id: "dup-sku-b",
    ref: "D-002",
    title: "Duplicate SKU Item B",
    category: "Bracelets",
    brand: "Mira",
    description: "Shares its SKU with item A to test duplicate handling.",
    variants: [
      {
        id: "dup-sku-b-v1",
        sku: "SKU-DUP-1",
        title: "Variant B1",
        listPriceMajor: 2099,
        stock: inStock(4),
      },
    ],
  },
];

export function standardSeedCount(): number {
  return STANDARD_SEED.filter((p) => !p.malformed).length;
}

export const DEMO_NECKLACE = STANDARD_SEED[0]!;
