/**
 * Rachna Design DNA — a preference profile built from what the customer did.
 *
 * WHAT THIS IS, PLAINLY: weighted counting over an append-only list of
 * interactions, with fixed rules. It is not machine learning, it does not
 * train, and nothing in this file may be described as learning in the UI. The
 * word used on screen is "built from what you chose", because that is exactly
 * what happens here.
 *
 * WHY THE SIGNALS ARE KEPT: `profile` is a pure function of `signals`, so the
 * derivation can be improved — or replaced by a model behind the adapter in
 * `lib/ai.ts` — and every existing profile recomputed rather than lost. That is
 * the whole reason both are stored.
 *
 * WHY IT IS HONEST ABOUT THINNESS: a profile from two taps is a guess. Every
 * facet carries its own confidence and the UI is required to render "still
 * learning your taste" below a threshold rather than assert a style.
 */

import { hexToHsl, hexToLab } from "./color";
import type { Scheme } from "./recommend";

/* -------------------------------- signals -------------------------------- */

/**
 * One recorded interaction.
 *
 * `weight` is what separates a glance from a decision. Saving a design says far
 * more than scrolling past one, and discarding says more than either — a
 * rejection is the only signal the customer gives deliberately.
 */
export type DesignSignalKind =
  | "viewed"
  | "previewed"
  | "saved"
  | "chosen"
  | "discarded"
  | "shade-swapped"
  | "brief";

export type DesignSignal = {
  kind: DesignSignalKind;
  at: string;
  /** Shade hexes involved, main first. */
  hexes?: string[];
  /** Product finish, when a product line was involved. */
  finish?: string;
  budget?: string;
  roomType?: string;
  surface?: string;
  mood?: string;
  approach?: string;
  /** Free label for a brief signal: "wants low maintenance", etc. */
  note?: string;
};

const WEIGHT: Record<DesignSignalKind, number> = {
  viewed: 0.4,
  previewed: 1,
  "shade-swapped": 2.2,
  saved: 3.5,
  chosen: 5,
  // Negative on purpose: a discarded scheme should pull the profile away from
  // its colours, not merely fail to pull it towards them.
  discarded: -2.5,
  // The brief is what the customer said before seeing anything. It anchors the
  // profile while there is nothing else, and is quickly outweighed by actions.
  brief: 1.5,
};

/* -------------------------------- profile -------------------------------- */

export type Facet<T> = {
  value: T;
  /** 0..1. Below 0.4 the UI must show this as provisional. */
  confidence: number;
  /** Why this value won, in one line the customer can check. */
  because: string;
};

export type DesignDNA = {
  engine: string;
  style: Facet<string>;
  palette: Facet<string>;
  finish: Facet<string>;
  budget: Facet<string>;
  /** Up to four, strongest first. Named, not just hex. */
  colours: { hex: string; name: string; weight: number }[];
  lighting: Facet<string>;
  roomType: string | null;
  /** Total evidence weight. Drives the "still learning" state. */
  evidence: number;
  signalCount: number;
  /** True when there is too little to say anything. */
  provisional: boolean;
};

export const DNA_ENGINE = "rules-v1";

/** Below this the profile is shown as forming, not as a conclusion. */
const CONFIDENT_AT = 6;

/* ------------------------------- derivation ------------------------------- */

type Tally = Map<string, number>;

const bump = (t: Tally, k: string | undefined | null, w: number) => {
  if (!k) return;
  t.set(k, (t.get(k) ?? 0) + w);
};

function top(t: Tally): { key: string | null; share: number; total: number } {
  let total = 0;
  for (const v of t.values()) total += Math.max(0, v);
  let key: string | null = null;
  let best = 0;
  for (const [k, v] of t) {
    if (v > best) {
      best = v;
      key = k;
    }
  }
  return { key, share: total > 0 ? best / total : 0, total };
}

/**
 * Colour temperature family for a hex.
 *
 * Deliberately coarse. Four buckets a customer would recognise beats twelve
 * they would not, and the profile is meant to be read aloud across a counter.
 */
export function paletteFamily(hex: string): string {
  const { h, s } = hexToHsl(hex);
  const { L } = hexToLab(hex);
  if (s < 10) return L > 70 ? "Soft Neutral" : "Deep Neutral";
  if (h < 45 || h >= 330) return s > 45 ? "Warm Bold" : "Warm Neutral";
  if (h < 70) return "Warm Neutral";
  if (h < 170) return s > 40 ? "Fresh Green" : "Muted Green";
  if (h < 260) return "Cool Blue";
  return "Cool Violet";
}

/** Style from the geometry of the choices, not from a questionnaire. */
function styleFrom(palette: string, contrast: number, saturation: number): string {
  if (saturation > 42 && contrast > 30) return "Bold Contemporary";
  if (saturation > 34) return "Warm Eclectic";
  if (contrast > 34) return "Modern Graphic";
  if (palette.includes("Neutral") && contrast < 22) return "Modern Minimal";
  if (palette.startsWith("Warm")) return "Warm Contemporary";
  if (palette.startsWith("Cool")) return "Calm Contemporary";
  return "Modern Minimal";
}

/**
 * Build the profile.
 *
 * Pure, synchronous, and total: it returns a usable object for an empty signal
 * list, because the customer app renders this card before anything has
 * happened and an exception there would take the whole screen down.
 */
export function deriveDNA(
  signals: DesignSignal[],
  shadeNames: Map<string, string> = new Map(),
): DesignDNA {
  const paletteT: Tally = new Map();
  const finishT: Tally = new Map();
  const budgetT: Tally = new Map();
  const moodT: Tally = new Map();
  const approachT: Tally = new Map();
  const colourT: Tally = new Map();
  let roomType: string | null = null;

  let evidence = 0;
  let contrastSum = 0;
  let contrastW = 0;
  let satSum = 0;
  let satW = 0;
  let lightSum = 0;
  let lightW = 0;

  for (const s of signals) {
    const w = WEIGHT[s.kind] ?? 0;
    if (w > 0) evidence += w;
    if (s.roomType) roomType = s.roomType;

    bump(finishT, s.finish, w);
    bump(budgetT, s.budget, w);
    bump(moodT, s.mood, w);
    bump(approachT, s.approach, w);

    const hexes = s.hexes ?? [];
    if (!hexes.length) continue;

    // The main wall carries the profile; the accent is evidence but weaker.
    // Weighting them equally makes one dramatic feature wall look like the
    // customer's whole taste, which it never is.
    hexes.forEach((hex, i) => {
      const share = i === 0 ? 1 : 0.45;
      bump(colourT, hex.toLowerCase(), w * share);
      bump(paletteT, paletteFamily(hex), w * share);
    });

    if (w > 0 && hexes.length >= 2) {
      const a = hexToLab(hexes[0]).L;
      const b = hexToLab(hexes[1]).L;
      contrastSum += Math.abs(a - b) * w;
      contrastW += w;
      const sat = hexToHsl(hexes[1]).s;
      satSum += sat * w;
      satW += w;
      lightSum += a * w;
      lightW += w;
    }
  }

  const palette = top(paletteT);
  const finish = top(finishT);
  const budget = top(budgetT);
  const contrast = contrastW ? contrastSum / contrastW : 0;
  const saturation = satW ? satSum / satW : 0;
  const lightness = lightW ? lightSum / lightW : 0;

  // Confidence has two independent gates: is there enough evidence at all, and
  // does that evidence agree? A single strong choice is not confidence, and
  // neither is twenty scattered ones.
  const depth = Math.min(1, evidence / CONFIDENT_AT);
  const conf = (share: number, present: boolean) =>
    present ? Math.min(0.92, depth * (0.45 + share * 0.55)) : 0;

  const paletteValue = palette.key ?? "Not yet clear";
  const styleValue = palette.key
    ? styleFrom(paletteValue, contrast, saturation)
    : "Not yet clear";

  const colours = [...colourT.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([hex, weight]) => ({
      hex,
      name: shadeNames.get(hex) ?? shadeNames.get(hex.toUpperCase()) ?? hex.toUpperCase(),
      weight: Math.round(weight * 10) / 10,
    }));

  const lightingValue =
    lightW === 0
      ? "Not yet clear"
      : lightness > 78
        ? "Bright and open"
        : lightness > 66
          ? "Soft daylight"
          : "Low and warm";

  const saved = signals.filter((s) => s.kind === "saved" || s.kind === "chosen").length;
  const discarded = signals.filter((s) => s.kind === "discarded").length;

  return {
    engine: DNA_ENGINE,
    style: {
      value: styleValue,
      confidence: conf(palette.share, Boolean(palette.key)),
      because: palette.key
        ? `Your choices average ${Math.round(contrast)} points of wall-to-accent contrast at ${Math.round(saturation)}% accent saturation.`
        : "Open a few schemes and this will fill in.",
    },
    palette: {
      value: paletteValue,
      confidence: conf(palette.share, Boolean(palette.key)),
      because: palette.key
        ? `${Math.round(palette.share * 100)}% of the weight behind your picks sits in this family.`
        : "No colour family is ahead yet.",
    },
    finish: {
      value: finish.key ?? "Not yet clear",
      confidence: conf(finish.share, Boolean(finish.key)),
      because: finish.key
        ? `${Math.round(finish.share * 100)}% of the product lines you looked at were ${finish.key}.`
        : "You have not settled on a finish yet.",
    },
    budget: {
      value: budget.key ?? "Not yet clear",
      confidence: conf(budget.share, Boolean(budget.key)),
      because: budget.key
        ? `Taken from the band you asked for and the lines you actually opened.`
        : "No budget band chosen yet.",
    },
    colours,
    lighting: {
      value: lightingValue,
      confidence: conf(1, lightW > 0) * 0.8,
      because:
        lightW > 0
          ? `Your walls average ${Math.round(lightness)} on the lightness scale.`
          : "Not enough colour picks yet.",
    },
    roomType,
    evidence: Math.round(evidence * 10) / 10,
    signalCount: signals.length,
    provisional: evidence < CONFIDENT_AT || (saved === 0 && discarded === 0),
  };
}

/* ------------------------------ signal makers ----------------------------- */

/** From the opening brief, before the customer has seen anything. */
export function briefSignal(spec: {
  budget?: string;
  finish?: string;
  mood?: string;
  roomType?: string;
  surface?: string;
}): DesignSignal {
  return {
    kind: "brief",
    at: new Date().toISOString(),
    budget: spec.budget,
    finish: spec.finish && spec.finish !== "any" ? spec.finish : undefined,
    mood: spec.mood && spec.mood !== "any" ? spec.mood : undefined,
    roomType: spec.roomType,
    surface: spec.surface,
  };
}

/** From an actual scheme the customer interacted with. */
export function schemeSignal(kind: DesignSignalKind, scheme: {
  shades: { main: { hex: string }; feature: { hex: string } };
  line?: { finish?: string; budget?: string };
  approach?: string;
}): DesignSignal {
  return {
    kind,
    at: new Date().toISOString(),
    hexes: [scheme.shades.main.hex, scheme.shades.feature.hex],
    finish: scheme.line?.finish,
    budget: scheme.line?.budget,
    approach: scheme.approach,
  };
}

/** Convenience for the full engine-side Scheme type. */
export const fromScheme = (kind: DesignSignalKind, s: Scheme): DesignSignal =>
  schemeSignal(kind, s);

/**
 * The dealer's view.
 *
 * Deliberately narrower than the customer's: taste, not identity. No phone
 * number, no note, no photograph reference — a dealer needs to know that this
 * customer keeps choosing warm neutrals in matte, and nothing more than that to
 * serve them well.
 */
export function dealerSummary(dna: DesignDNA) {
  return {
    style: dna.style.value,
    palette: dna.palette.value,
    finish: dna.finish.value,
    budget: dna.budget.value,
    colours: dna.colours.slice(0, 3).map((c) => ({ hex: c.hex, name: c.name })),
    provisional: dna.provisional,
    evidence: dna.evidence,
  };
}

export type DealerDNASummary = ReturnType<typeof dealerSummary>;
