/**
 * Quantities and pricing.
 *
 * Every figure here is derived from measurements the CUSTOMER entered, never
 * from a photograph. Area estimated from an uncalibrated photo is one of the
 * things this product refuses to do, and the whole quotation would inherit the
 * error if it did.
 *
 * The arithmetic is returned alongside the result so the UI can show it. A
 * dealer who cannot check a number will not stand behind it in front of a
 * customer.
 */

import {
  LINE_BY_ID,
  pricePerLitre,
  type ProductLine,
} from "./catalog";
import type { CustomerSpec } from "./recommend";
import { requiredPrep } from "./recommend";
import type { Measurements, SelectedScheme } from "./session-types";

const SQFT_PER_SQM = 10.7639;
/** ASSUMPTION: standard door 2.0 × 0.9 m, standard window 1.5 × 1.2 m. */
const DOOR_SQM = 1.8;
const WINDOW_SQM = 1.8;
/** Trade rule of thumb for spillage, roller loading and touch-ups. */
const WASTAGE = 1.08;

export type Areas = {
  perimeterM: number;
  grossWallSqft: number;
  deductionSqft: number;
  netWallSqft: number;
  featureWallSqft: number;
  mainWallSqft: number;
  ceilingSqft: number;
  trimSqft: number;
};

export function computeAreas(m: Measurements): Areas {
  const perimeterM = 2 * (m.lengthM + m.widthM);
  const grossSqm = perimeterM * m.heightM;
  const deductionSqm = m.doors * DOOR_SQM + m.windows * WINDOW_SQM;
  const netSqm = Math.max(0, grossSqm - deductionSqm);

  // The feature wall is taken as one short wall, which is what a customer
  // almost always means when they point at one.
  const featureSqm = m.featureWall ? m.widthM * m.heightM : 0;
  const mainSqm = Math.max(0, netSqm - featureSqm);
  const ceilingSqm = m.includeCeiling ? m.lengthM * m.widthM : 0;
  // Door and window frames, both faces.
  const trimSqm = m.doors * 3.4 + m.windows * 2.2;

  const f = (v: number) => Math.round(v * SQFT_PER_SQM);
  return {
    perimeterM: Math.round(perimeterM * 10) / 10,
    grossWallSqft: f(grossSqm),
    deductionSqft: f(deductionSqm),
    netWallSqft: f(netSqm),
    featureWallSqft: f(featureSqm),
    mainWallSqft: f(mainSqm),
    ceilingSqft: f(ceilingSqm),
    trimSqft: f(trimSqm),
  };
}

export type QuoteLine = {
  role: string;
  productId: string;
  product: string;
  brand: string;
  shadeName?: string;
  shadeHex?: string;
  areaSqft: number;
  coats: number;
  coverage: number;
  litres: number;
  packs: { size: number; count: number }[];
  billedLitres: number;
  ratePerLitre: number;
  amount: number;
  /** Human-readable arithmetic, shown under the line in the UI. */
  working: string;
  required: boolean;
  why?: string;
};

/** Greedy pack breakdown — dealers sell tins, not decilitres. */
function packsFor(line: ProductLine, litres: number) {
  const sizes = [...line.packSizes].sort((a, b) => b - a);
  const out: { size: number; count: number }[] = [];
  let left = litres;
  for (const s of sizes) {
    if (s > left) continue;
    const count = Math.floor(left / s);
    if (count > 0) {
      out.push({ size: s, count });
      left -= count * s;
    }
  }
  // Ignore a sliver of a remainder. The 8% wastage allowance is already in the
  // figure, so forcing another whole tin over 60 ml of shortfall sells the
  // customer paint they will never open — and a dealer who does that once gets
  // asked about it every time afterwards.
  const smallest = sizes[sizes.length - 1];
  if (left > smallest * 0.12) {
    const existing = out.find((p) => p.size === smallest);
    if (existing) existing.count += 1;
    else out.push({ size: smallest, count: 1 });
  }
  return out.sort((a, b) => b.size - a.size);
}

function buildLine(args: {
  role: string;
  line: ProductLine;
  areaSqft: number;
  coats: number;
  shadeName?: string;
  shadeHex?: string;
  required: boolean;
  why?: string;
}): QuoteLine | null {
  if (args.areaSqft <= 0) return null;
  const rawLitres = (args.areaSqft * args.coats) / args.line.coverage;
  const litres = Math.round(rawLitres * WASTAGE * 100) / 100;
  const packs = packsFor(args.line, litres);
  const billedLitres = packs.reduce((s, p) => s + p.size * p.count, 0);
  const rate = pricePerLitre(args.line.id);

  return {
    role: args.role,
    productId: args.line.id,
    product: args.line.name,
    brand: args.line.brand,
    shadeName: args.shadeName,
    shadeHex: args.shadeHex,
    areaSqft: args.areaSqft,
    coats: args.coats,
    coverage: args.line.coverage,
    litres,
    packs,
    billedLitres,
    ratePerLitre: rate,
    amount: Math.round(billedLitres * rate),
    working: `${args.areaSqft} sq ft × ${args.coats} coat${args.coats > 1 ? "s" : ""} ÷ ${args.line.coverage} sq ft per litre × 1.08 wastage = ${litres} L → ${packs
      .map((p) => `${p.count} × ${p.size} L`)
      .join(" + ")} = ${billedLitres} L @ ₹${rate}/L`,
    required: args.required,
    why: args.why,
  };
}

export type Quote = {
  areas: Areas;
  lines: QuoteLine[];
  subtotal: number;
  unavailable: string[];
  notes: string[];
};

export function buildQuote(
  spec: CustomerSpec,
  scheme: SelectedScheme,
  m: Measurements,
): Quote {
  const areas = computeAreas(m);
  const wallLine = LINE_BY_ID.get(scheme.lineId);
  const trimLine = scheme.trimLineId ? LINE_BY_ID.get(scheme.trimLineId) : null;
  const lines: QuoteLine[] = [];
  const unavailable: string[] = [];

  if (!wallLine) {
    return { areas, lines, subtotal: 0, unavailable: ["Selected product line is no longer carried."], notes: [] };
  }

  // Prep first, and never as an optional extra: the defect decides it.
  for (const prep of requiredPrep(spec)) {
    const isPutty = prep.category === "putty";
    const l = buildLine({
      role: prep.category === "putty" ? "Surface levelling" : prep.category === "primer" ? "Primer" : "Damp treatment",
      line: prep,
      areaSqft: areas.netWallSqft + areas.ceilingSqft,
      coats: isPutty ? 2 : 1,
      required: true,
      why:
        prep.category === "waterproofing"
          ? "The wall shows damp. A topcoat over untreated damp will peel within two seasons, and the complaint comes back to the dealer."
          : prep.category === "primer"
            ? "Required over fresh plaster or old distemper, otherwise the topcoat lifts."
            : "Levels the surface so the finish coat reads evenly.",
    });
    if (l) lines.push(l);
  }

  const mainLine = buildLine({
    role: "Main walls",
    line: wallLine,
    areaSqft: areas.mainWallSqft,
    coats: m.coats,
    shadeName: scheme.shades.main.name,
    shadeHex: scheme.shades.main.hex,
    required: true,
  });
  if (mainLine) lines.push(mainLine);

  if (areas.featureWallSqft > 0) {
    const f = buildLine({
      role: "Feature wall",
      line: wallLine,
      areaSqft: areas.featureWallSqft,
      coats: m.coats,
      shadeName: scheme.shades.feature.name,
      shadeHex: scheme.shades.feature.hex,
      required: true,
    });
    if (f) lines.push(f);
  }

  if (areas.ceilingSqft > 0) {
    const c = buildLine({
      role: "Ceiling",
      line: wallLine,
      areaSqft: areas.ceilingSqft,
      coats: Math.max(1, m.coats - 1),
      shadeName: scheme.shades.ceiling.name,
      shadeHex: scheme.shades.ceiling.hex,
      required: false,
    });
    if (c) lines.push(c);
  }

  if (trimLine && areas.trimSqft > 0) {
    const t = buildLine({
      role: "Doors & window frames",
      line: trimLine,
      areaSqft: areas.trimSqft,
      coats: 2,
      shadeName: scheme.shades.trim.name,
      shadeHex: scheme.shades.trim.hex,
      required: false,
    });
    if (t) lines.push(t);
  } else if (!trimLine) {
    unavailable.push("No enamel line in stock for door and window frames — quote them separately.");
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);

  return {
    areas,
    lines,
    subtotal,
    unavailable,
    notes: [
      "Materials only. Labour, scaffolding and taxes are not included.",
      "Quantities include an 8% wastage allowance and are rounded up to whole packs.",
      "Coverage figures are the manufacturer's, on a primed surface. A rough or very porous wall will take more.",
    ],
  };
}
