/**
 * Product catalogue and dealer stock position.
 *
 * Structured the way the real schema must be: the CATALOGUE is shared across
 * every dealer (brands, product lines, shades, formulas), and the DEALER STOCK
 * is a thin per-tenant overlay saying which lines he carries, at what price,
 * and which shades he can actually produce today.
 *
 * ASSUMPTION: prices, coverage rates and stock levels below are plausible
 * Indian-market figures used for the demo. They are not scraped from any price
 * list, and coverage in particular varies by surface. Every number the customer
 * sees is shown with its arithmetic so it can be corrected against reality.
 */

export type PaintCategory =
  | "interior"
  | "exterior"
  | "waterproofing"
  | "primer"
  | "putty"
  | "enamel";

export type Budget = "economy" | "mid" | "premium";
export type Finish = "matt" | "soft-sheen" | "satin" | "gloss";

export type ProductLine = {
  id: string;
  brand: string;
  name: string;
  category: PaintCategory;
  finish: Finish;
  budget: Budget;
  /** ₹ per litre at MRP, before the dealer's own override. */
  pricePerLitre: number;
  /** sq ft covered by one litre, one coat, on a primed surface. */
  coverage: number;
  packSizes: number[];
  features: string[];
  blurb: string;
};

export const PRODUCT_LINES: ProductLine[] = [
  // ---- interior ----
  { id: "ap-tractor", brand: "Asian Paints", name: "Tractor Emulsion", category: "interior", finish: "matt", budget: "economy", pricePerLitre: 118, coverage: 150, packSizes: [1, 4, 10, 20], features: ["low odour"], blurb: "Everyday interior emulsion. Honest coverage, no washability claim." },
  { id: "ap-apcolite", brand: "Asian Paints", name: "Apcolite Premium Emulsion", category: "interior", finish: "soft-sheen", budget: "mid", pricePerLitre: 268, coverage: 145, packSizes: [1, 4, 10, 20], features: ["washable", "anti-fungal"], blurb: "The workhorse mid-range. Wipes clean, holds colour." },
  { id: "ap-royale", brand: "Asian Paints", name: "Royale Luxury Emulsion", category: "interior", finish: "soft-sheen", budget: "premium", pricePerLitre: 462, coverage: 160, packSizes: [1, 4, 10, 20], features: ["washable", "anti-fungal", "low-VOC", "stain guard"], blurb: "Deep, even finish. Worth it on a wall people stand close to." },
  { id: "ber-silk", brand: "Berger", name: "Easy Clean Silk", category: "interior", finish: "satin", budget: "premium", pricePerLitre: 428, coverage: 155, packSizes: [1, 4, 10, 20], features: ["washable", "stain guard"], blurb: "Satin sheen that survives children and switchboards." },
  { id: "ner-beauty", brand: "Nerolac", name: "Beauty Smooth Finish", category: "interior", finish: "matt", budget: "economy", pricePerLitre: 132, coverage: 148, packSizes: [1, 4, 10, 20], features: ["low odour"], blurb: "Budget interior with a genuinely flat matt." },
  { id: "ner-impressions", brand: "Nerolac", name: "Impressions Kashmir", category: "interior", finish: "soft-sheen", budget: "mid", pricePerLitre: 289, coverage: 150, packSizes: [1, 4, 10, 20], features: ["washable", "anti-bacterial"], blurb: "Mid-range with a slightly warmer light return." },
  { id: "opus-inspire", brand: "Birla Opus", name: "Inspire Interior", category: "interior", finish: "matt", budget: "mid", pricePerLitre: 246, coverage: 152, packSizes: [1, 4, 10, 20], features: ["washable", "low-VOC"], blurb: "Newer line, aggressive pricing, good depth in mid-tones." },
  { id: "dul-velvet", brand: "Dulux", name: "Velvet Touch Platinum", category: "interior", finish: "soft-sheen", budget: "premium", pricePerLitre: 574, coverage: 165, packSizes: [1, 4, 10, 20], features: ["washable", "low-VOC", "stain guard", "anti-fungal"], blurb: "The softest light diffusion of anything on this shelf." },

  // ---- exterior ----
  { id: "ap-apex", brand: "Asian Paints", name: "Apex Weatherproof", category: "exterior", finish: "matt", budget: "mid", pricePerLitre: 312, coverage: 105, packSizes: [1, 4, 10, 20], features: ["weatherproof", "anti-algal", "UV resistant"], blurb: "Standard exterior. Seven-ish years in this climate." },
  { id: "ap-apex-ultima", brand: "Asian Paints", name: "Apex Ultima Protek", category: "exterior", finish: "matt", budget: "premium", pricePerLitre: 528, coverage: 112, packSizes: [1, 4, 10, 20], features: ["weatherproof", "anti-algal", "dirt resistant", "UV resistant"], blurb: "Holds colour on a south face far longer than it should." },
  { id: "ber-weathercoat", brand: "Berger", name: "WeatherCoat All Guard", category: "exterior", finish: "matt", budget: "mid", pricePerLitre: 298, coverage: 100, packSizes: [1, 4, 10, 20], features: ["weatherproof", "anti-algal"], blurb: "Reliable exterior, slightly cooler undertone." },
  { id: "ner-excel", brand: "Nerolac", name: "Excel Total", category: "exterior", finish: "matt", budget: "premium", pricePerLitre: 486, coverage: 108, packSizes: [1, 4, 10, 20], features: ["weatherproof", "anti-algal", "dirt resistant"], blurb: "Strong on dirt pickup near a main road." },

  // ---- waterproofing ----
  { id: "ap-smartcare-damp", brand: "Asian Paints", name: "SmartCare Damp Proof", category: "waterproofing", finish: "matt", budget: "premium", pricePerLitre: 596, coverage: 55, packSizes: [1, 4, 10, 20], features: ["waterproof", "damp block", "crack bridging"], blurb: "For a wall that already shows damp. Not a topcoat." },
  { id: "ber-homeshield", brand: "Berger", name: "HomeShield Damp Stop", category: "waterproofing", finish: "matt", budget: "mid", pricePerLitre: 442, coverage: 58, packSizes: [1, 4, 10, 20], features: ["waterproof", "damp block"], blurb: "Interior-side damp barrier for a shared or external wall." },
  { id: "dul-aquatech", brand: "Dulux", name: "Aquatech Flexifill", category: "waterproofing", finish: "matt", budget: "premium", pricePerLitre: 638, coverage: 48, packSizes: [1, 4, 10, 20], features: ["waterproof", "crack bridging", "elastomeric"], blurb: "Bridges hairline cracks. Terrace and parapet work." },

  // ---- prep ----
  { id: "ap-primer-int", brand: "Asian Paints", name: "Interior Wall Primer ST", category: "primer", finish: "matt", budget: "mid", pricePerLitre: 186, coverage: 130, packSizes: [1, 4, 10, 20], features: ["sealer"], blurb: "Required on fresh plaster or over distemper." },
  { id: "ber-primer-ext", brand: "Berger", name: "Exterior Wall Primer", category: "primer", finish: "matt", budget: "mid", pricePerLitre: 214, coverage: 118, packSizes: [1, 4, 10, 20], features: ["sealer", "alkali resistant"], blurb: "Alkali-resistant. Skip it and the topcoat lifts." },
  { id: "ap-putty", brand: "Asian Paints", name: "TruCare Wall Putty", category: "putty", finish: "matt", budget: "mid", pricePerLitre: 42, coverage: 22, packSizes: [5, 20, 40], features: ["levelling"], blurb: "Priced per kg. Levels the surface before anything else." },

  // ---- enamel / trim ----
  { id: "ap-enamel", brand: "Asian Paints", name: "Apcolite Premium Gloss Enamel", category: "enamel", finish: "gloss", budget: "mid", pricePerLitre: 386, coverage: 160, packSizes: [0.5, 1, 4, 10], features: ["washable", "for wood & metal"], blurb: "Doors, grilles, railings. Gloss trim against matt walls." },
  { id: "ner-satin-enamel", brand: "Nerolac", name: "Satin Enamel", category: "enamel", finish: "satin", budget: "mid", pricePerLitre: 402, coverage: 155, packSizes: [0.5, 1, 4], features: ["washable", "for wood & metal"], blurb: "Lower sheen trim where gloss would look dated." },
];

/* --------------------------------- shades -------------------------------- */

export type ShadeFamily =
  | "white"
  | "warm neutral"
  | "cool neutral"
  | "earth"
  | "ochre"
  | "terracotta"
  | "green"
  | "teal"
  | "blue"
  | "grey"
  | "accent";

export type Shade = {
  code: string;
  name: string;
  hex: string;
  family: ShadeFamily;
  /** Wall-safe means it works over a large area without becoming oppressive. */
  wallSafe: boolean;
  exteriorSuitable: boolean;
};

export const SHADES: Shade[] = [
  { code: "W-101", name: "Chalk White", hex: "#f4f1ea", family: "white", wallSafe: true, exteriorSuitable: true },
  { code: "W-104", name: "Lime Wash", hex: "#efe9dc", family: "white", wallSafe: true, exteriorSuitable: true },
  { code: "W-108", name: "Cotton Grey", hex: "#e8e6e1", family: "white", wallSafe: true, exteriorSuitable: true },
  { code: "N-201", name: "Oat Milk", hex: "#e7dcc7", family: "warm neutral", wallSafe: true, exteriorSuitable: true },
  { code: "N-205", name: "Ivory Warm", hex: "#e3d3b4", family: "warm neutral", wallSafe: true, exteriorSuitable: true },
  { code: "N-209", name: "Sandcast", hex: "#d9c4a0", family: "warm neutral", wallSafe: true, exteriorSuitable: true },
  { code: "N-214", name: "Almond Shell", hex: "#cdb692", family: "warm neutral", wallSafe: true, exteriorSuitable: true },
  { code: "N-221", name: "Pale Linen", hex: "#ded6c4", family: "warm neutral", wallSafe: true, exteriorSuitable: true },
  { code: "C-301", name: "Morning Mist", hex: "#dfe3e2", family: "cool neutral", wallSafe: true, exteriorSuitable: true },
  { code: "C-305", name: "Cold Porcelain", hex: "#d3d9da", family: "cool neutral", wallSafe: true, exteriorSuitable: true },
  { code: "C-311", name: "Slate Wash", hex: "#b9c2c4", family: "cool neutral", wallSafe: true, exteriorSuitable: true },
  { code: "G-401", name: "Ash Grey", hex: "#b3b0aa", family: "grey", wallSafe: true, exteriorSuitable: true },
  { code: "G-406", name: "Graphite", hex: "#6d6a63", family: "grey", wallSafe: false, exteriorSuitable: true },
  { code: "G-412", name: "Charcoal Ink", hex: "#3f4145", family: "grey", wallSafe: false, exteriorSuitable: true },
  { code: "E-501", name: "Clay Beige", hex: "#c9a97b", family: "earth", wallSafe: true, exteriorSuitable: true },
  { code: "E-506", name: "Raw Umber", hex: "#9c7a4f", family: "earth", wallSafe: false, exteriorSuitable: true },
  { code: "E-511", name: "Walnut Bark", hex: "#7b5a3c", family: "earth", wallSafe: false, exteriorSuitable: true },
  { code: "O-601", name: "Turmeric Light", hex: "#e6bf74", family: "ochre", wallSafe: true, exteriorSuitable: true },
  { code: "O-607", name: "Mustard Field", hex: "#c79a45", family: "ochre", wallSafe: false, exteriorSuitable: true },
  { code: "T-701", name: "Rose Clay", hex: "#d09a80", family: "terracotta", wallSafe: true, exteriorSuitable: true },
  { code: "T-706", name: "Terracotta", hex: "#b56a4a", family: "terracotta", wallSafe: false, exteriorSuitable: true },
  { code: "T-712", name: "Burnt Sienna", hex: "#a9543c", family: "terracotta", wallSafe: false, exteriorSuitable: true },
  { code: "T-718", name: "Vermilion", hex: "#e2542a", family: "accent", wallSafe: false, exteriorSuitable: false },
  { code: "V-801", name: "Sage Light", hex: "#c3cbb8", family: "green", wallSafe: true, exteriorSuitable: true },
  { code: "V-806", name: "Olive Field", hex: "#8f9c86", family: "green", wallSafe: true, exteriorSuitable: true },
  { code: "V-812", name: "Forest Deep", hex: "#4a5c47", family: "green", wallSafe: false, exteriorSuitable: true },
  { code: "Q-901", name: "Duck Egg", hex: "#bdd3cf", family: "teal", wallSafe: true, exteriorSuitable: true },
  { code: "Q-906", name: "Glaze Teal", hex: "#4f8079", family: "teal", wallSafe: false, exteriorSuitable: true },
  { code: "Q-912", name: "Deep Peacock", hex: "#1a5f5a", family: "teal", wallSafe: false, exteriorSuitable: true },
  { code: "B-1001", name: "Sky Powder", hex: "#c6d4e2", family: "blue", wallSafe: true, exteriorSuitable: true },
  { code: "B-1006", name: "Denim Wash", hex: "#7f93ac", family: "blue", wallSafe: true, exteriorSuitable: true },
  { code: "B-1012", name: "Indigo Night", hex: "#33456e", family: "blue", wallSafe: false, exteriorSuitable: true },
  { code: "A-1101", name: "Blush Plaster", hex: "#e5c8c0", family: "accent", wallSafe: true, exteriorSuitable: false },
  { code: "A-1106", name: "Old Rose", hex: "#b57f7a", family: "accent", wallSafe: false, exteriorSuitable: false },
  { code: "A-1112", name: "Plum Shadow", hex: "#6b4a5c", family: "accent", wallSafe: false, exteriorSuitable: false },
  { code: "A-1118", name: "Brass Glow", hex: "#b98a3e", family: "accent", wallSafe: false, exteriorSuitable: true },
];

export const SHADE_BY_CODE = new Map(SHADES.map((s) => [s.code, s]));
export const LINE_BY_ID = new Map(PRODUCT_LINES.map((p) => [p.id, p]));

/* ----------------------------- dealer overlay ---------------------------- */

export type DealerLineStock = {
  lineId: string;
  /** Litres on the shelf across all pack sizes. */
  litres: number;
  /** The dealer's own selling price per litre. Overrides MRP. */
  sellingPerLitre: number;
};

/**
 * What Sharma Interiors actually carries. Deliberately incomplete — no dealer
 * stocks every line of every brand, and the gaps are what make the availability
 * filter worth having.
 */
export const DEALER_LINES: DealerLineStock[] = [
  { lineId: "ap-tractor", litres: 240, sellingPerLitre: 112 },
  { lineId: "ap-apcolite", litres: 180, sellingPerLitre: 252 },
  { lineId: "ap-royale", litres: 96, sellingPerLitre: 438 },
  { lineId: "ber-silk", litres: 40, sellingPerLitre: 408 },
  { lineId: "ner-beauty", litres: 200, sellingPerLitre: 126 },
  { lineId: "ner-impressions", litres: 110, sellingPerLitre: 274 },
  { lineId: "opus-inspire", litres: 150, sellingPerLitre: 232 },
  // Dulux Velvet Touch is NOT carried — the recommender must never offer it.
  { lineId: "ap-apex", litres: 160, sellingPerLitre: 296 },
  { lineId: "ap-apex-ultima", litres: 60, sellingPerLitre: 502 },
  { lineId: "ber-weathercoat", litres: 120, sellingPerLitre: 284 },
  { lineId: "ap-smartcare-damp", litres: 40, sellingPerLitre: 566 },
  { lineId: "ber-homeshield", litres: 70, sellingPerLitre: 420 },
  { lineId: "ap-primer-int", litres: 140, sellingPerLitre: 176 },
  { lineId: "ber-primer-ext", litres: 90, sellingPerLitre: 204 },
  { lineId: "ap-putty", litres: 300, sellingPerLitre: 40 },
  { lineId: "ap-enamel", litres: 55, sellingPerLitre: 368 },
];

export const DEALER_LINE_BY_ID = new Map(DEALER_LINES.map((d) => [d.lineId, d]));

/**
 * Shades this dealer can produce today.
 *
 * In reality this is computed: does he hold the right base in the right pack
 * size, and enough of every colorant in the shade's formula. Here it is a
 * stored list with the same effect, so the customer app can be honest about
 * what it offers while the availability engine is still to be built.
 */
const UNAVAILABLE = new Set([
  "T-718", // vermilion — yellow oxide colorant is at 11%
  "O-607", // mustard field — same colorant
  "A-1112", // plum shadow — magenta canister empty
  "B-1012", // indigo night — on order
  "G-412", // charcoal ink — black base out of 20 L
]);

export function shadeAvailable(code: string) {
  return !UNAVAILABLE.has(code);
}

export const AVAILABLE_SHADES = SHADES.filter((s) => shadeAvailable(s.code));

export function dealerCarries(lineId: string) {
  return DEALER_LINE_BY_ID.has(lineId);
}

export function pricePerLitre(lineId: string) {
  const d = DEALER_LINE_BY_ID.get(lineId);
  return d?.sellingPerLitre ?? LINE_BY_ID.get(lineId)?.pricePerLitre ?? 0;
}

export const BRANDS = Array.from(new Set(PRODUCT_LINES.map((p) => p.brand)));

/** Brands this dealer can actually supply — the only list a customer should see. */
export const DEALER_BRANDS = Array.from(
  new Set(DEALER_LINES.map((d) => LINE_BY_ID.get(d.lineId)!.brand)),
);
