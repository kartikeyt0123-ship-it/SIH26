/**
 * The recommendation engine.
 *
 * Hard filters first, colour theory second, ranking last — never an LLM picking
 * a product. The rule the whole product rests on: a scheme may only contain a
 * finish this dealer can supply today. Anything else is a promise that breaks
 * at the counter.
 *
 *   spec + room palette
 *     → filter product lines   (category, budget, brand, dealer carries it)
 *     → filter shades          (dealer can produce, suitable for the surface)
 *     → generate combinations  (analogous / complementary / tonal / photo-led)
 *     → score                  (harmony, contrast, photo fit, brand fit)
 *     → top N with reasons
 */

import {
  AVAILABLE_SHADES,
  DEALER_LINE_BY_ID,
  PRODUCT_LINES,
  SHADES,
  dealerCarries,
  pricePerLitre,
  type Budget,
  type Finish,
  type PaintCategory,
  type ProductLine,
  type Shade,
} from "./catalog";
import { deltaEHex, hexToHsl, hexToLab, isLight } from "./color";

/**
 * What the customer says about where the building is.
 *
 * Asked in their own words rather than derived from the dealer's city, because
 * the two are often different — a dealer in Kanpur sells to a site an hour
 * away, and a coastal wall behaves nothing like an inland one whatever the
 * shop's postcode says. It is a coarse bucket on purpose: a customer can answer
 * "we get heavy rain" reliably, and cannot answer "what is your annual
 * precipitation" at all.
 */
export type ClimateZone = "hot" | "rainy" | "coastal" | "cold" | "moderate";

export type CustomerSpec = {
  surface: "interior" | "exterior";
  /** The wall already shows damp, or the customer asked for waterproofing. */
  waterproofing: boolean;
  budget: Budget;
  /** Empty means no preference — do not narrow on the customer's behalf. */
  brands: string[];
  finish: Finish | "any";
  mood: "warm" | "cool" | "neutral" | "bold" | "any";
  roomType: string;
  condition: string[];
  /** Undefined on projects created before this was asked. Never assumed. */
  climateZone?: ClimateZone;
  /** Prep product ids the customer explicitly accepted from the surface report. */
  prepAccepted?: string[];
};

/**
 * Live availability, read from the dealer's inventory.
 *
 * When supplied, this overrides the static catalogue helpers entirely — the
 * database is the authority on what can be sold, not a constant in the source.
 * When omitted (the browser, before the API responds) the static overlay is
 * used so the UI still shows something honest rather than nothing.
 */
export type Availability = {
  stockedLineIds: Set<string>;
  producibleShades: Set<string>;
};

export type SchemeRole = "main" | "feature" | "ceiling" | "trim";

export type Scheme = {
  id: string;
  title: string;
  approach: "analogous" | "complementary" | "tonal" | "photo-led" | "neutral-accent";
  rationale: string;
  shades: Record<SchemeRole, Shade>;
  /** The line used for the walls; trim uses an enamel where the dealer has one. */
  line: ProductLine;
  trimLine: ProductLine | null;
  score: number;
  /** ΔE from the strongest colour in the customer's own photos, if any. */
  photoDelta?: number;
};

const BUDGET_ORDER: Budget[] = ["economy", "mid", "premium"];

/* ------------------------- 1. product line filter ------------------------- */

export function eligibleLines(spec: CustomerSpec, avail?: Availability): ProductLine[] {
  const carries = (id: string) => (avail ? avail.stockedLineIds.has(id) : dealerCarries(id));
  const category: PaintCategory = spec.surface === "exterior" ? "exterior" : "interior";
  return PRODUCT_LINES.filter((l) => {
    if (l.category !== category) return false;
    if (!carries(l.id)) return false;
    if (spec.brands.length && !spec.brands.includes(l.brand)) return false;
    // One band of slack either side — a customer who says "mid" will still look
    // at a premium line if the mid one is thin, but never at three bands away.
    const gap = Math.abs(BUDGET_ORDER.indexOf(l.budget) - BUDGET_ORDER.indexOf(spec.budget));
    if (gap > 1) return false;
    if (spec.finish !== "any" && l.finish !== spec.finish && gap > 0) return false;
    return true;
  }).sort((a, b) => {
    const ga = Math.abs(BUDGET_ORDER.indexOf(a.budget) - BUDGET_ORDER.indexOf(spec.budget));
    const gb = Math.abs(BUDGET_ORDER.indexOf(b.budget) - BUDGET_ORDER.indexOf(spec.budget));
    if (ga !== gb) return ga - gb;
    return (DEALER_LINE_BY_ID.get(b.id)?.litres ?? 0) - (DEALER_LINE_BY_ID.get(a.id)?.litres ?? 0);
  });
}

/**
 * The prep the customer was offered, and whether each one was prescribed.
 *
 * `required` means the diagnosis called for it — damp was seen, the film is
 * peeling — as opposed to primer, which is simply how paint is applied. The
 * distinction matters because the customer is allowed to decline, and a dealer
 * looking at the quotation afterwards needs to see which omissions were
 * choices rather than oversights.
 */
export type PrepOption = {
  line: ProductLine;
  required: boolean;
  why: string;
};

export function prepOptions(spec: CustomerSpec, avail?: Availability): PrepOption[] {
  // Always from the diagnosis, never from `requiredPrep` — that now honours the
  // customer's own answer, so asking it here would make a step "not required"
  // simply because the customer had unticked it, and the reason for ticking it
  // would disappear the moment they did.
  const prescribed = new Set(diagnosedPrep(spec, avail).map((p) => p.id));
  const carries = (id: string) => (avail ? avail.stockedLineIds.has(id) : dealerCarries(id));
  const byId = (id: string) => PRODUCT_LINES.find((p) => p.id === id);

  const out: PrepOption[] = [];
  const push = (line: ProductLine | undefined, why: string) => {
    if (!line || !carries(line.id) || out.some((o) => o.line.id === line.id)) return;
    out.push({ line, required: prescribed.has(line.id), why });
  };

  if (spec.waterproofing || spec.condition.includes("dampness")) {
    push(
      byId(spec.surface === "exterior" ? "ap-smartcare-damp" : "ber-homeshield"),
      "Your photographs suggested damp. Paint over untreated moisture and it comes back through, usually within one season.",
    );
  }
  push(
    byId("ap-putty"),
    spec.condition.some((c) => ["peeling", "cracks", "uneven", "stains"].includes(c))
      ? "Levels the shading and fills the fine lines the analysis picked up, so the finish reads flat."
      : "Two thin coats give the paint an even surface to sit on.",
  );
  push(
    byId(spec.surface === "exterior" ? "ber-primer-ext" : "ap-primer-int"),
    "Primer is what the topcoat holds on to. Skipping it is the commonest reason a repaint fails early.",
  );

  return out;
}

/** Required prep, driven by the diagnosis rather than by upsell. */
export function requiredPrep(spec: CustomerSpec, avail?: Availability): ProductLine[] {
  // An explicit answer from the customer wins. `prepAccepted` is undefined
  // until the surface report is shown, so every existing project keeps the
  // diagnosis-driven behaviour unchanged.
  if (spec.prepAccepted) {
    const chosen = new Set(spec.prepAccepted);
    return PRODUCT_LINES.filter((p) => chosen.has(p.id));
  }
  return diagnosedPrep(spec, avail);
}

function diagnosedPrep(spec: CustomerSpec, avail?: Availability): ProductLine[] {
  const carries = (id: string) => (avail ? avail.stockedLineIds.has(id) : dealerCarries(id));
  const out: ProductLine[] = [];
  const byId = (id: string) => PRODUCT_LINES.find((p) => p.id === id);

  if (spec.waterproofing || spec.condition.includes("dampness")) {
    const damp = spec.surface === "exterior" ? byId("ap-smartcare-damp") : byId("ber-homeshield");
    if (damp && carries(damp.id)) out.push(damp);
  }
  if (spec.condition.includes("fresh") || spec.condition.includes("peeling")) {
    const putty = byId("ap-putty");
    if (putty && carries(putty.id)) out.push(putty);
  }
  const primer = spec.surface === "exterior" ? byId("ber-primer-ext") : byId("ap-primer-int");
  if (primer && carries(primer.id)) out.push(primer);

  return out;
}

/* ---------------------------- 2. shade universe --------------------------- */

export function shadePool(spec: CustomerSpec, avail?: Availability) {
  const base = avail
    ? SHADES.filter((s) => avail.producibleShades.has(s.code))
    : AVAILABLE_SHADES;
  return base.filter((s) => (spec.surface === "exterior" ? s.exteriorSuitable : true));
}

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/* ---------------------------- 3. combinations ----------------------------- */

type Candidate = { main: Shade; feature: Shade; approach: Scheme["approach"] };

function buildCandidates(pool: Shade[], spec: CustomerSpec): Candidate[] {
  const mains = pool.filter((s) => s.wallSafe && hexToLab(s.hex).L > 62);
  const out: Candidate[] = [];

  for (const main of mains) {
    const mh = hexToHsl(main.hex);
    const mL = hexToLab(main.hex).L;

    for (const feature of pool) {
      if (feature.code === main.code) continue;
      const fh = hexToHsl(feature.hex);
      const fL = hexToLab(feature.hex).L;

      // A feature wall has to actually read as different. Below ~18 L of
      // separation it looks like a patch job, not a decision.
      if (mL - fL < 18) continue;

      const gap = hueGap(mh.h, fh.h);
      let approach: Scheme["approach"] | null = null;
      if (fh.s < 12 && mh.s < 12) approach = "tonal";
      else if (gap < 22) approach = "tonal";
      else if (gap >= 22 && gap <= 55) approach = "analogous";
      else if (gap >= 140) approach = "complementary";
      else if (mh.s < 14 && fh.s > 18) approach = "neutral-accent";

      if (!approach) continue;
      if (spec.mood === "bold" && fh.s < 22) continue;
      if (spec.mood === "warm" && (fh.h > 200 && fh.h < 300)) continue;
      if (spec.mood === "cool" && (fh.h < 60 || fh.h > 330)) continue;
      if (spec.mood === "neutral" && fh.s > 30) continue;

      out.push({ main, feature, approach });
    }
  }
  return out;
}

/* ------------------------------- 4. scoring ------------------------------- */

function scoreCandidate(c: Candidate, spec: CustomerSpec, photoHex?: string) {
  const mL = hexToLab(c.main.hex).L;
  const fL = hexToLab(c.feature.hex).L;
  const fs = hexToHsl(c.feature.hex).s;

  let score = 0;

  // Separation: strong, but stops rewarding past a point where the feature
  // wall starts to feel like a different building.
  const sep = mL - fL;
  score += Math.min(sep, 48) * 0.9;

  // Bright, open main walls do more for a room than a clever feature wall —
  // but weighted lightly. Weighted heavily, every recommendation collapses to
  // white walls, and a list of five whites is not a list of five options.
  score += (mL - 62) * 0.22;

  // Keep the wall colour in the family the customer asked for.
  const mainHue = hexToHsl(c.main.hex);
  if (spec.mood === "warm" && mainHue.s > 6 && (mainHue.h < 65 || mainHue.h > 330)) score += 12;
  if (spec.mood === "cool" && mainHue.s > 6 && mainHue.h > 150 && mainHue.h < 265) score += 12;

  // Approach preference by mood.
  const approachBonus: Record<Scheme["approach"], number> = {
    analogous: 16,
    "neutral-accent": 14,
    complementary: spec.mood === "bold" ? 20 : 8,
    tonal: spec.mood === "neutral" ? 18 : 6,
    "photo-led": 12,
  };
  score += approachBonus[c.approach];

  if (spec.mood === "bold") score += fs * 0.35;
  if (spec.mood === "neutral") score -= fs * 0.3;

  /**
   * Where the building is.
   *
   * These bias ranking rather than eligibility, with one deliberate exception
   * handled in `shadePool`: a shade that is not rated for exteriors is removed
   * outright on an exterior wall, in every zone. Everything below is a
   * preference, not a rule, because a customer who wants a deep colour on a hot
   * wall is allowed to have one — they should simply see the calmer options first.
   */
  switch (spec.climateZone) {
    case "hot":
      // Strong sun bleaches deep pigment and a dark wall runs hotter. Both
      // argue for a lighter body colour on anything facing the weather.
      if (spec.surface === "exterior") {
        score += (mL - 62) * 0.5;
        score -= Math.max(0, 55 - fL) * 0.25;
      }
      break;
    case "rainy":
    case "coastal":
      // Wet walls stain and grow algae from the bottom up, and it shows most on
      // a pale wall. A mid-depth main reads clean far longer.
      score += mL > 88 ? -14 : 8;
      if (spec.surface === "exterior") score += fs * 0.1;
      break;
    case "cold":
      // Low winter light drains cool greys; warmth is doing real work here
      // rather than being a taste preference.
      if (mainHue.s > 6 && (mainHue.h < 70 || mainHue.h > 330)) score += 10;
      break;
    default:
      break;
  }

  // Fit to what is already in the room, if we have photos.
  let photoDelta: number | undefined;
  if (photoHex) {
    photoDelta = deltaEHex(c.main.hex, photoHex);
    // Close to the existing tone is reassuring; identical is pointless.
    score += photoDelta > 3 && photoDelta < 22 ? 14 : photoDelta <= 3 ? -6 : 0;
  }

  return { score, photoDelta };
}

/* -------------------------------- 5. build -------------------------------- */

function pickCeiling(pool: Shade[], main: Shade, feature: Shade): Shade {
  // Ceilings go lighter than the walls, always — a ceiling darker than the
  // walls lowers the room, and customers rarely mean to ask for that. It must
  // also be a DIFFERENT shade from the walls: returning the wall colour would
  // put the same swatch in two boxes and make the scheme look unconsidered.
  const mainL = hexToLab(main.hex).L;
  const candidates = pool.filter(
    (s) => s.code !== main.code && s.code !== feature.code && hexToLab(s.hex).L >= mainL,
  );
  if (!candidates.length) {
    // Main walls are already the lightest thing in stock; go a touch off-white
    // rather than repeating the wall colour.
    return (
      pool
        .filter((s) => s.code !== main.code)
        .sort((a, b) => hexToLab(b.hex).L - hexToLab(a.hex).L)[0] ?? main
    );
  }
  // The nearest lighter neighbour, so the ceiling reads as "the same room".
  return candidates.sort((a, b) => deltaEHex(a.hex, main.hex) - deltaEHex(b.hex, main.hex))[0];
}

function pickTrim(pool: Shade[], main: Shade, feature: Shade): Shade {
  // Trim either disappears into the wall or holds a line against it; the middle
  // ground looks like a mistake, so we go deliberately dark. It must be
  // distinct from the feature wall — repeating it flattens the whole scheme.
  const darks = pool.filter(
    (s) =>
      s.code !== feature.code &&
      s.code !== main.code &&
      !isLight(s.hex) &&
      deltaEHex(s.hex, feature.hex) > 6,
  );
  if (!darks.length) {
    return (
      pool
        .filter((s) => s.code !== feature.code && s.code !== main.code)
        .sort((a, b) => hexToLab(a.hex).L - hexToLab(b.hex).L)[0] ?? feature
    );
  }
  // Closest dark that is still clearly its own colour — related, not identical.
  return darks.sort((a, b) => deltaEHex(a.hex, feature.hex) - deltaEHex(b.hex, feature.hex))[0];
}

function titleFor(c: Candidate, spec: CustomerSpec) {
  const f = c.feature.name;
  const m = c.main.name;
  switch (c.approach) {
    case "analogous": return `${m} with ${f}`;
    case "complementary": return `${m} against ${f}`;
    case "tonal": return `${m}, tonal`;
    case "neutral-accent": return `${m} with a ${f} accent`;
    default: return `${m} · ${f}`;
  }
}

/**
 * The sentence attached when a climate zone shaped the ranking.
 *
 * Interior entries are mostly absent on purpose: an inside wall in a hot
 * district is still an inside wall, and inventing an environmental
 * justification for it would be noise dressed as intelligence.
 */
const ZONE_REASON: Partial<
  Record<ClimateZone, Partial<Record<"interior" | "exterior", string>>>
> = {
  hot: {
    exterior:
      "Ranked for a hot, high-sun location: lighter body colours hold their depth for years longer on a wall that takes direct afternoon sun.",
  },
  rainy: {
    exterior:
      "Ranked for heavy rainfall: a mid-depth wall hides the staining and algae that a very pale exterior shows within one monsoon.",
    interior:
      "Chosen with damp in mind — in a high-rainfall area an inside wall still has to cope with the humidity behind it.",
  },
  coastal: {
    exterior:
      "Ranked for a coastal wall, where salt air and constant humidity mark a pale finish fastest.",
  },
  cold: {
    interior:
      "Weighted warm for a cold-climate room, where low winter light drains cooler greys and makes a space read colder than it is.",
  },
};

function rationaleFor(c: Candidate, spec: CustomerSpec, line: ProductLine, photoDelta?: number) {
  const bits: string[] = [];
  const sep = Math.round(hexToLab(c.main.hex).L - hexToLab(c.feature.hex).L);

  switch (c.approach) {
    case "analogous":
      bits.push(`${c.feature.name} sits close to ${c.main.name} on the colour wheel, so the feature wall reads as depth rather than as a second room.`);
      break;
    case "complementary":
      bits.push(`${c.feature.name} sits opposite ${c.main.name}, which is why the feature wall holds attention instead of blending away.`);
      break;
    case "tonal":
      bits.push(`Both tones come from the same family, ${sep} points of lightness apart — quiet, and very hard to get wrong.`);
      break;
    case "neutral-accent":
      bits.push(`Neutral walls carry the light; ${c.feature.name} does the work on one surface only.`);
      break;
    default:
      break;
  }

  if (photoDelta !== undefined && photoDelta < 22) {
    bits.push(`It also stays close to the tone already in your photographs, so the room will still feel like yours.`);
  }

  // Say the environmental reason out loud. A recommendation that quietly
  // reorders itself for the weather is indistinguishable from one that ignored
  // it, and the customer cannot disagree with reasoning they were never shown.
  const zoneNote = ZONE_REASON[spec.climateZone ?? "moderate"]?.[spec.surface];
  if (zoneNote) bits.push(zoneNote);
  bits.push(`${line.brand} ${line.name} — ${line.blurb}`);
  return bits.join(" ");
}

export function recommendSchemes(
  spec: CustomerSpec,
  opts: { photoHex?: string; limit?: number; availability?: Availability } = {},
): Scheme[] {
  const avail = opts.availability;
  const lines = eligibleLines(spec, avail);
  if (!lines.length) return [];

  const pool = shadePool(spec, avail);
  const candidates = buildCandidates(pool, spec);

  const carries = (id: string) => (avail ? avail.stockedLineIds.has(id) : dealerCarries(id));
  const trimLine =
    PRODUCT_LINES.find((p) => p.category === "enamel" && carries(p.id)) ?? null;

  const scored = candidates
    .map((c) => {
      const { score, photoDelta } = scoreCandidate(c, spec, opts.photoHex);
      return { c, score, photoDelta };
    })
    .sort((a, b) => b.score - a.score);

  // One scheme per main shade, so the list reads as five real alternatives
  // rather than five variations on the same wall colour.
  const seenMain = new Set<string>();
  const seenFeature = new Set<string>();
  const out: Scheme[] = [];

  for (const { c, score, photoDelta } of scored) {
    if (out.length >= (opts.limit ?? 5)) break;
    if (seenMain.has(c.main.code)) continue;
    if (seenFeature.has(c.feature.code)) continue;
    seenMain.add(c.main.code);
    seenFeature.add(c.feature.code);

    const line = lines[out.length % lines.length];
    out.push({
      id: `${c.main.code}_${c.feature.code}`,
      title: titleFor(c, spec),
      approach: c.approach,
      rationale: rationaleFor(c, spec, line, photoDelta),
      shades: {
        main: c.main,
        feature: c.feature,
        ceiling: pickCeiling(pool, c.main, c.feature),
        trim: pickTrim(pool, c.main, c.feature),
      },
      line,
      trimLine,
      score,
      photoDelta,
    });
  }

  return out;
}

/** Nearest producible shade to an arbitrary colour — used for photo-led picks. */
export function nearestAvailable(hex: string, spec?: CustomerSpec) {
  const pool = spec ? shadePool(spec) : AVAILABLE_SHADES;
  return pool
    .map((s) => ({ shade: s, dE: deltaEHex(s.hex, hex) }))
    .sort((a, b) => a.dE - b.dE)[0];
}

export { pricePerLitre };
