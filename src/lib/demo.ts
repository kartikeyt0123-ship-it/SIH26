/**
 * Demo dataset for the dealer console.
 *
 * Realistic in SHAPE, obviously synthetic in CONTENT — that is the rule. Names,
 * figures and dates are invented; the field structure is what the real Postgres
 * schema should carry, so swapping this module for API calls is a
 * one-file change.
 *
 * ASSUMPTION: weather-driven demand shifts (monsoon → waterproofing, anti-skid
 * floors, exterior coatings) are directional trade knowledge, not a validated
 * model. The UI presents them as signals with their reasoning shown, never as
 * predictions.
 */

export const DEALER = {
  id: "d_7XK92",
  name: "Sharma Interiors & Hardware",
  owner: "Rakesh Sharma",
  city: "Kanpur",
  pincode: "208011",
  tier: "Pro",
  since: "2023",
};

/* ------------------------------ inventory ------------------------------ */

export type MaterialType =
  | "Coatings"
  | "Tiles"
  | "Wallpaper"
  | "Laminates"
  | "Plywood"
  | "Sanitaryware"
  | "Hardware";

export const MATERIAL_TYPES: MaterialType[] = [
  "Coatings",
  "Tiles",
  "Wallpaper",
  "Laminates",
  "Plywood",
  "Sanitaryware",
  "Hardware",
];

/** Swatch per category — drawn in CSS, used everywhere the category appears. */
export const CATEGORY_SWATCH: Record<MaterialType, string> = {
  Coatings: "radial-gradient(120% 90% at 30% 20%, #e2542a, #a9543c 45%, #6d3527 100%)",
  Tiles: "conic-gradient(from 0deg, #cfc7b8 0 25%, #b3aa9b 25% 50%, #cfc7b8 50% 75%, #b3aa9b 75%)",
  Wallpaper:
    "repeating-conic-gradient(from 45deg at 50% 50%, #2f4f4a 0deg 20deg, #46685f 20deg 40deg)",
  Laminates: "repeating-linear-gradient(102deg, #8a6a45 0 3px, #a07d54 3px 6px, #7a5c3c 6px 11px)",
  Plywood: "repeating-linear-gradient(88deg, #b98a57 0 8px, #c9a97b 8px 12px, #a87e4f 12px 22px)",
  Sanitaryware: "radial-gradient(90% 80% at 35% 25%, #f2f0ea, #d5d3cc 55%, #a9a7a1 100%)",
  Hardware:
    "linear-gradient(135deg, #6b5a33 0%, #c79a45 38%, #f0dca8 52%, #b3893c 68%, #5e4e2c 100%)",
};

export type StockItem = {
  id: string;
  type: MaterialType;
  brand: string;
  product: string;
  variant: string;
  unit: string;
  qty: number;
  reorderLevel: number;
  weeklyOfftake: number;
  leadTimeDays: number;
  unitPrice: number;
  hex: string;
};

export const STOCK: StockItem[] = [
  { id: "s01", type: "Coatings", brand: "Asian Paints", product: "Apex Ultima", variant: "Deep base · 20 L", unit: "cans", qty: 6, reorderLevel: 12, weeklyOfftake: 7, leadTimeDays: 4, unitPrice: 8400, hex: "#c96f4a" },
  { id: "s02", type: "Coatings", brand: "Asian Paints", product: "Royale Luxury", variant: "White base · 20 L", unit: "cans", qty: 21, reorderLevel: 10, weeklyOfftake: 5, leadTimeDays: 4, unitPrice: 9200, hex: "#efe7d8" },
  { id: "s03", type: "Coatings", brand: "Berger", product: "WeatherCoat", variant: "Light base · 10 L", unit: "cans", qty: 14, reorderLevel: 8, weeklyOfftake: 4, leadTimeDays: 6, unitPrice: 4300, hex: "#dcc9a6" },
  { id: "s04", type: "Coatings", brand: "Birla Opus", product: "Colorant · Yellow Oxide", variant: "1 L canister", unit: "L", qty: 1.1, reorderLevel: 4, weeklyOfftake: 1.6, leadTimeDays: 9, unitPrice: 2100, hex: "#c79a45" },
  { id: "s05", type: "Coatings", brand: "Nerolac", product: "Damp Block Primer", variant: "10 L", unit: "cans", qty: 3, reorderLevel: 10, weeklyOfftake: 6, leadTimeDays: 5, unitPrice: 3900, hex: "#9fb2af" },

  { id: "s06", type: "Tiles", brand: "Kajaria", product: "Vitrified 600×600", variant: "Bianco matt", unit: "sq ft", qty: 182, reorderLevel: 600, weeklyOfftake: 156, leadTimeDays: 6, unitPrice: 62, hex: "#cfc7b8" },
  { id: "s07", type: "Tiles", brand: "Somany", product: "Wall tile 300×600", variant: "Grigio gloss", unit: "sq ft", qty: 940, reorderLevel: 400, weeklyOfftake: 88, leadTimeDays: 7, unitPrice: 48, hex: "#b3aa9b" },
  { id: "s08", type: "Tiles", brand: "Kajaria", product: "Anti-skid 300×300", variant: "Slate grey", unit: "sq ft", qty: 210, reorderLevel: 350, weeklyOfftake: 74, leadTimeDays: 6, unitPrice: 54, hex: "#6d6a63" },

  { id: "s09", type: "Wallpaper", brand: "Nilaya", product: "Damask roll", variant: "Emerald", unit: "rolls", qty: 2, reorderLevel: 8, weeklyOfftake: 3, leadTimeDays: 11, unitPrice: 1700, hex: "#2f4f4a" },
  { id: "s10", type: "Wallpaper", brand: "Excel", product: "Textured roll", variant: "Oat linen", unit: "rolls", qty: 19, reorderLevel: 8, weeklyOfftake: 2, leadTimeDays: 10, unitPrice: 1450, hex: "#e7dbc4" },

  { id: "s11", type: "Laminates", brand: "Merino", product: "1 mm sheet", variant: "Walnut ribbed", unit: "sheets", qty: 26, reorderLevel: 15, weeklyOfftake: 6, leadTimeDays: 8, unitPrice: 1250, hex: "#8a6a45" },
  { id: "s12", type: "Laminates", brand: "Century", product: "0.8 mm sheet", variant: "Frost white", unit: "sheets", qty: 7, reorderLevel: 15, weeklyOfftake: 5, leadTimeDays: 8, unitPrice: 980, hex: "#efeae0" },

  { id: "s13", type: "Plywood", brand: "Greenply", product: "BWP 18 mm", variant: "710 grade", unit: "sheets", qty: 34, reorderLevel: 20, weeklyOfftake: 8, leadTimeDays: 5, unitPrice: 3100, hex: "#b98a57" },
  { id: "s14", type: "Plywood", brand: "Century", product: "MR 12 mm", variant: "Commercial", unit: "sheets", qty: 12, reorderLevel: 20, weeklyOfftake: 9, leadTimeDays: 5, unitPrice: 1850, hex: "#c9a97b" },

  { id: "s15", type: "Sanitaryware", brand: "Jaquar", product: "Wall-hung WC", variant: "Alpine white", unit: "pcs", qty: 9, reorderLevel: 6, weeklyOfftake: 2, leadTimeDays: 12, unitPrice: 14800, hex: "#f2f0ea" },
  { id: "s16", type: "Sanitaryware", brand: "Cera", product: "Counter basin", variant: "Matt black", unit: "pcs", qty: 3, reorderLevel: 6, weeklyOfftake: 2, leadTimeDays: 12, unitPrice: 6400, hex: "#2b2b2e" },

  { id: "s17", type: "Hardware", brand: "Hettich", product: "Soft-close hinge", variant: "Nickel", unit: "pcs", qty: 240, reorderLevel: 120, weeklyOfftake: 46, leadTimeDays: 4, unitPrice: 210, hex: "#a9a7a1" },
  { id: "s18", type: "Hardware", brand: "Dorset", product: "Mortise handle", variant: "Antique brass", unit: "sets", qty: 11, reorderLevel: 25, weeklyOfftake: 9, leadTimeDays: 6, unitPrice: 1650, hex: "#c79a45" },
];

/** Days of cover left at the current rate. The number a dealer actually acts on. */
export function daysOfCover(item: StockItem) {
  if (item.weeklyOfftake <= 0) return 999;
  return Math.round((item.qty / item.weeklyOfftake) * 7);
}

export function stockStatus(item: StockItem): "critical" | "low" | "healthy" | "overstocked" {
  const cover = daysOfCover(item);
  if (cover <= item.leadTimeDays) return "critical";
  if (item.qty < item.reorderLevel) return "low";
  if (item.qty > item.reorderLevel * 3) return "overstocked";
  return "healthy";
}

/** Suggested order = cover the lead time plus two weeks of demand, less stock. */
export function suggestedOrder(item: StockItem) {
  const horizonWeeks = item.leadTimeDays / 7 + 2;
  return Math.max(0, Math.ceil(item.weeklyOfftake * horizonWeeks - item.qty));
}

/* --------------------------- demand signals --------------------------- */

export type Signal = {
  id: string;
  kind: "weather" | "trend" | "local";
  headline: string;
  reason: string;
  categories: MaterialType[];
  action: string;
  confidence: "high" | "medium" | "watch";
};

export const SIGNALS: Signal[] = [
  {
    id: "sg1",
    kind: "weather",
    headline: "Monsoon onset in ~3 weeks",
    reason:
      "IMD long-range outlook for your district plus last two years of your own offtake over the same window.",
    categories: ["Coatings", "Tiles"],
    action: "Build damp-block primer and anti-skid floor cover before the first week of rain.",
    confidence: "high",
  },
  {
    id: "sg2",
    kind: "trend",
    headline: "Feature-wall schemes up 2.4× this quarter",
    reason:
      "Share of customer designs specifying a distinct feature surface, across your own QR sessions.",
    categories: ["Wallpaper", "Laminates"],
    action: "Emerald and oat-linen rolls are your two fastest movers. Emerald is down to 2.",
    confidence: "high",
  },
  {
    id: "sg3",
    kind: "local",
    headline: "Warm neutrals displacing cool greys",
    reason: "Colour families chosen in accepted quotations, last 12 weeks versus the 12 before.",
    categories: ["Coatings", "Tiles"],
    action: "Weight new tile and base purchases toward warm bianco / oat, away from grigio.",
    confidence: "medium",
  },
  {
    id: "sg4",
    kind: "trend",
    headline: "Matt black fittings still rising",
    reason: "Third consecutive quarter of growth in fittings selected alongside light floors.",
    categories: ["Sanitaryware", "Hardware"],
    action: "Counter basin (matt black) at 3 units against 2/week. Thin.",
    confidence: "watch",
  },
];

/* ------------------------------ customers ------------------------------ */

export type Proposal = {
  id: string;
  customer: string;
  phone: string;
  locality: string;
  space: string;
  sqft: number;
  submitted: string;
  status: "new" | "quoted" | "won" | "lost";
  palette: string[];
  surfaces: { surface: string; spec: string; category: MaterialType; qty: string; amount: number }[];
  note?: string;
};

export const PROPOSALS: Proposal[] = [
  {
    id: "p1",
    customer: "Meena Verma",
    phone: "+91 98••• ••214",
    locality: "Kidwai Nagar",
    space: "Living room",
    sqft: 1240,
    submitted: "Today · 4:12 pm",
    status: "new",
    palette: ["#d9c4a0", "#2f4f4a", "#cfc7b8", "#a97c4c"],
    surfaces: [
      { surface: "Walls", spec: "Royale Luxury · Ivory Warm", category: "Coatings", qty: "2 × 20 L", amount: 11800 },
      { surface: "Prep", spec: "Damp Block Primer + putty", category: "Coatings", qty: "10 L", amount: 5440 },
      { surface: "Floor", spec: "Vitrified 600×600 · Bianco", category: "Tiles", qty: "420 sq ft", amount: 23940 },
      { surface: "Feature wall", spec: "Damask roll · Emerald", category: "Wallpaper", qty: "4 rolls", amount: 6800 },
      { surface: "Trims", spec: "Skirting & beading", category: "Hardware", qty: "62 rft", amount: 2270 },
    ],
    note: "Damp flagged near the window at 0.81 confidence.",
  },
  {
    id: "p2",
    customer: "Arif Khan",
    phone: "+91 90••• ••887",
    locality: "Swaroop Nagar",
    space: "Master bedroom",
    sqft: 640,
    submitted: "Today · 1:40 pm",
    status: "new",
    palette: ["#e7dbc4", "#8a6a45", "#a97c4c"],
    surfaces: [
      { surface: "Walls", spec: "Royale Luxury · Oat", category: "Coatings", qty: "1 × 20 L", amount: 6100 },
      { surface: "Wardrobe", spec: "Merino 1 mm · Walnut ribbed", category: "Laminates", qty: "9 sheets", amount: 11250 },
      { surface: "Carcass", spec: "Greenply BWP 18 mm", category: "Plywood", qty: "6 sheets", amount: 18600 },
      { surface: "Fittings", spec: "Hettich soft-close", category: "Hardware", qty: "24 pcs", amount: 5040 },
    ],
  },
  {
    id: "p3",
    customer: "Sunita Rao",
    phone: "+91 99••• ••102",
    locality: "Civil Lines",
    space: "Guest bathroom",
    sqft: 210,
    submitted: "Yesterday",
    status: "quoted",
    palette: ["#b3aa9b", "#2b2b2e", "#f2f0ea"],
    surfaces: [
      { surface: "Walls", spec: "Wall tile 300×600 · Grigio", category: "Tiles", qty: "180 sq ft", amount: 8640 },
      { surface: "Floor", spec: "Anti-skid 300×300 · Slate", category: "Tiles", qty: "42 sq ft", amount: 2268 },
      { surface: "Fittings", spec: "Cera counter basin · Matt black", category: "Sanitaryware", qty: "1 pc", amount: 6400 },
      { surface: "Fittings", spec: "Jaquar wall-hung WC", category: "Sanitaryware", qty: "1 pc", amount: 14800 },
    ],
  },
  {
    id: "p4",
    customer: "Deepak Mishra",
    phone: "+91 87••• ••455",
    locality: "Panki",
    space: "Shop frontage",
    sqft: 880,
    submitted: "2 days ago",
    status: "quoted",
    palette: ["#c96f4a", "#6d6a63"],
    surfaces: [
      { surface: "Exterior", spec: "Apex Ultima · Terracotta", category: "Coatings", qty: "3 × 20 L", amount: 25200 },
      { surface: "Prep", spec: "Exterior primer", category: "Coatings", qty: "20 L", amount: 7800 },
      { surface: "Entrance floor", spec: "Anti-skid 300×300", category: "Tiles", qty: "120 sq ft", amount: 6480 },
    ],
  },
  {
    id: "p5",
    customer: "Priya Nair",
    phone: "+91 88••• ••319",
    locality: "Kalyanpur",
    space: "Full flat · 2BHK",
    sqft: 1980,
    submitted: "4 days ago",
    status: "won",
    palette: ["#efe7d8", "#cfc7b8", "#8a6a45", "#c79a45"],
    surfaces: [
      { surface: "Walls", spec: "Royale Luxury · Chalk", category: "Coatings", qty: "4 × 20 L", amount: 24400 },
      { surface: "Floors", spec: "Vitrified 600×600 · Bianco", category: "Tiles", qty: "820 sq ft", amount: 46740 },
      { surface: "Joinery", spec: "Century MR 12 mm + Frost white", category: "Plywood", qty: "11 sheets", amount: 20350 },
      { surface: "Hardware", spec: "Dorset mortise · Antique brass", category: "Hardware", qty: "7 sets", amount: 11550 },
    ],
  },
  {
    id: "p6",
    customer: "Harish Gupta",
    phone: "+91 70••• ••640",
    locality: "Govind Nagar",
    space: "Staircase & lobby",
    sqft: 430,
    submitted: "6 days ago",
    status: "lost",
    palette: ["#b3bda9", "#6d6a63"],
    surfaces: [
      { surface: "Walls", spec: "WeatherCoat · Sage", category: "Coatings", qty: "2 × 10 L", amount: 8600 },
      { surface: "Steps", spec: "Anti-skid 300×300", category: "Tiles", qty: "160 sq ft", amount: 8640 },
    ],
  },
];

export const proposalTotal = (p: Proposal) => p.surfaces.reduce((s, l) => s + l.amount, 0);

/* -------------------------------- QR ---------------------------------- */

export type CustomerLink = {
  id: string;
  code: string;
  issuedTo: string;
  issuedOn: string;
  expiresIn: string;
  hoursLeft: number;
  validityHours: number;
  status: "active" | "used" | "expired";
  opens: number;
  designs: number;
};

export const LINKS: CustomerLink[] = [
  { id: "l1", code: "7XK92", issuedTo: "Meena Verma", issuedOn: "16 Aug, 11:02", expiresIn: "58 h", hoursLeft: 58, validityHours: 72, status: "used", opens: 6, designs: 3 },
  { id: "l2", code: "QD4M1", issuedTo: "Arif Khan", issuedOn: "16 Aug, 09:20", expiresIn: "44 h", hoursLeft: 44, validityHours: 48, status: "active", opens: 2, designs: 1 },
  { id: "l3", code: "B8ZR6", issuedTo: "Walk-in · counter", issuedOn: "15 Aug, 17:45", expiresIn: "19 h", hoursLeft: 19, validityHours: 72, status: "active", opens: 1, designs: 0 },
  { id: "l4", code: "T2NW7", issuedTo: "Sunita Rao", issuedOn: "14 Aug, 12:10", expiresIn: "expired", hoursLeft: 0, validityHours: 48, status: "expired", opens: 4, designs: 2 },
];

/* ----------------------------- performance ----------------------------- */

export type Deal = {
  id: string;
  customer: string;
  closed: string;
  categories: MaterialType[];
  value: number;
  margin: number;
};

export const DEALS: Deal[] = [
  { id: "d1", customer: "Priya Nair", closed: "14 Aug", categories: ["Coatings", "Tiles", "Plywood", "Hardware"], value: 103040, margin: 0.21 },
  { id: "d2", customer: "R. K. Traders", closed: "13 Aug", categories: ["Tiles"], value: 41200, margin: 0.16 },
  { id: "d3", customer: "Anand Residency", closed: "11 Aug", categories: ["Coatings", "Wallpaper"], value: 58900, margin: 0.24 },
  { id: "d4", customer: "S. Bhatia", closed: "09 Aug", categories: ["Laminates", "Hardware"], value: 27350, margin: 0.19 },
  { id: "d5", customer: "Verma Builders", closed: "07 Aug", categories: ["Coatings", "Tiles", "Sanitaryware"], value: 148600, margin: 0.18 },
  { id: "d6", customer: "Nisha Agarwal", closed: "05 Aug", categories: ["Wallpaper"], value: 12400, margin: 0.27 },
];

export const REVENUE_BY_WEEK = [
  { week: "W22", value: 182000 },
  { week: "W23", value: 214000 },
  { week: "W24", value: 196000 },
  { week: "W25", value: 241000 },
  { week: "W26", value: 268000 },
  { week: "W27", value: 252000 },
  { week: "W28", value: 311000 },
  { week: "W29", value: 348000 },
];

export const BEST_SELLERS = [
  { product: "Vitrified 600×600 · Bianco", type: "Tiles" as MaterialType, units: "3,240 sq ft", revenue: 200880, share: 100 },
  { product: "Royale Luxury · White base 20 L", type: "Coatings" as MaterialType, units: "41 cans", revenue: 377200, share: 82 },
  { product: "Greenply BWP 18 mm", type: "Plywood" as MaterialType, units: "62 sheets", revenue: 192200, share: 61 },
  { product: "Hettich soft-close hinge", type: "Hardware" as MaterialType, units: "580 pcs", revenue: 121800, share: 44 },
  { product: "Damask roll · Emerald", type: "Wallpaper" as MaterialType, units: "34 rolls", revenue: 57800, share: 31 },
];

export const MONTH = {
  revenue: 1216000,
  revenueDeltaPct: 18,
  deals: 23,
  quotations: 39,
  avgBasket: 52870,
  multiCategoryShare: 0.83,
};
