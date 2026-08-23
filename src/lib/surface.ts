/**
 * Surface Health Intelligence — photo → possible surface conditions → prep plan.
 *
 * WHAT THIS IS, PLAINLY: image statistics, not a trained defect classifier. It
 * measures five things over a downsampled copy of the customer's own photograph
 * — directional edge energy, local luminance variance, chroma deviation from
 * the wall's own base tone, a vertical darkness gradient and patch mottling —
 * and turns each into an observation with the evidence attached. Every
 * threshold below is a named constant, so a reading can always be traced to a
 * number rather than to a black box.
 *
 * WHAT IT IS NOT: an inspection. Nothing here may be presented as a confirmed
 * defect, and the vocabulary enforces that: observations read "possible
 * dampness", never "damage confirmed". A photograph is not a substitute for
 * standing in front of the wall, and confidence is capped at 0.72 everywhere in
 * this file to keep that honest.
 *
 * WHERE THE REAL MODEL GOES: `measure` is the only place pixels are
 * interpreted, and `SurfaceReport` is the only thing the rest of the app
 * consumes. A hosted segmentation model becomes a second implementation behind
 * the adapter in `lib/ai.ts`; every screen, the stored shape and the dealer's
 * view are unchanged.
 */

import { hexToLab, rgbToHex } from "./color";

/* --------------------------------- types --------------------------------- */

export type SurfaceCode =
  | "cracks"
  | "dampness"
  | "peeling"
  | "stains"
  | "uneven"
  | "deterioration";

/** `ok` is a clean reading and is shown with a tick, not a warning. */
export type Severity = "ok" | "watch" | "attention";

export type SurfaceObservation = {
  code: SurfaceCode;
  /** Customer-facing wording. Always hedged — "possible", "signs of". */
  label: string;
  severity: Severity;
  /** 0..1. Low values are shown as low, never rounded up into certainty. */
  confidence: number;
  /** The measurement behind it, in words the customer can check against. */
  evidence: string;
};

export type PrepStep = {
  order: number;
  title: string;
  /** Maps onto a real catalogue category, so products can be attached. */
  category: "preparation" | "putty" | "primer" | "waterproofing" | "paint";
  why: string;
  /** True when the diagnosis required it, rather than it being routine. */
  triggered: boolean;
};

export type SurfaceReport = {
  engine: string;
  observations: SurfaceObservation[];
  prep: PrepStep[];
  /** none | light | moderate | significant — the dealer's triage key. */
  severity: "none" | "light" | "moderate" | "significant";
  confidence: "low" | "medium";
  /** Codes that map onto `CustomerSpec.condition`, so the recommender reacts. */
  conditions: string[];
  imageCount: number;
};

/* ------------------------------ measurement ------------------------------ */

export const SAMPLE_SIZE = 128;

export type Metrics = {
  /** Energy of thin dark ridges — the visual signature of a crack line. */
  lineEnergy: number;
  /** Mean local luminance standard deviation over 8x8 blocks. */
  blockVariance: number;
  /** Share of blocks whose chroma departs sharply from the base wall tone. */
  chromaOutlierShare: number;
  /** Mean luminance of the bottom third against the top third, normalised. */
  bottomDarkening: number;
  /** Share of blocks that are both darker and flatter than the wall. */
  mottleShare: number;
  /** Low-frequency luminance spread — broad shading, not sharp defects. */
  shadingSpread: number;
  baseHex: string;
  meanLuma: number;
};

const lumaAt = (px: Uint8ClampedArray, i: number) =>
  0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

/**
 * The pure core: pixels in, metrics out.
 *
 * Separated from the DOM so it is testable and so a server-side implementation
 * could reuse it verbatim — nothing in here touches a canvas.
 */
export function measure(px: Uint8ClampedArray, w: number, h: number): Metrics {
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) luma[p] = lumaAt(px, i);

  let meanLuma = 0;
  for (let p = 0; p < luma.length; p++) meanLuma += luma[p];
  meanLuma /= luma.length || 1;

  /* --- 1. line energy: a RIDGE response, not an edge response ------------ */
  // A crack is a thin dark line on a lighter wall. Sobel is the obvious tool
  // and the wrong one: it responds at the two flanks of a line and returns
  // almost exactly ZERO at the centre of a symmetric one, because the left and
  // right neighbourhoods are equally bright and cancel. A one-pixel crack is
  // therefore invisible to it — which is the whole thing we are looking for.
  //
  // So this measures a ridge instead: how much darker a pixel is than the
  // neighbourhood around it. That peaks exactly at the centre of a thin dark
  // line and stays near zero on a smooth gradient or a bright edge.
  let lineSum = 0;
  let lineN = 0;
  const RIDGE_MIN = 10;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const local =
        (luma[p - 1] + luma[p + 1] + luma[p - w] + luma[p + w] +
          luma[p - w - 1] + luma[p - w + 1] + luma[p + w - 1] + luma[p + w + 1]) / 8;
      const ridge = local - luma[p];
      if (ridge > RIDGE_MIN) {
        lineSum += ridge;
        lineN++;
      }
    }
  }
  // Depth times the square root of extent. Square root rather than the raw
  // share because a hairline crack occupies well under 1% of a frame — scaling
  // linearly buries it, while sqrt keeps a genuine hairline above the watch
  // level without letting a wall of noise saturate the reading.
  const ridgeShare = lineN / (w * h);
  const lineEnergy = lineN
    ? (lineSum / lineN / 255) * Math.sqrt(ridgeShare) * 100
    : 0;

  /* --- 2..6. block statistics -------------------------------------------- */
  const B = 8;
  const bw = Math.floor(w / B);
  const bh = Math.floor(h / B);
  const blockMean: number[] = [];
  const blockSd: number[] = [];
  const blockLab: { L: number; a: number; b: number }[] = [];

  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let sumSq = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = by * B; y < by * B + B; y++) {
        for (let x = bx * B; x < bx * B + B; x++) {
          const p = y * w + x;
          const i = p * 4;
          sum += luma[p];
          sumSq += luma[p] * luma[p];
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
        }
      }
      const n = B * B;
      const mean = sum / n;
      blockMean.push(mean);
      blockSd.push(Math.sqrt(Math.max(0, sumSq / n - mean * mean)));
      blockLab.push(hexToLab(rgbToHex({ r: r / n, g: g / n, b: b / n })));
    }
  }

  const blockVariance = blockSd.reduce((s, v) => s + v, 0) / (blockSd.length || 1);

  // Base wall tone: the MEDIAN block, which is robust to furniture and a bright
  // window in a way that a plain average is not.
  const byL = [...blockLab].sort((a, b) => a.L - b.L);
  const base = byL[Math.floor(byL.length / 2)] ?? { L: 50, a: 0, b: 0 };

  // Chroma outliers: a stain is a patch whose colour has drifted from the wall
  // while its lightness may not have. Lightness is excluded on purpose, so a
  // shadow is not reported as a stain.
  const chromaOutliers = blockLab.filter(
    (l) => Math.hypot(l.a - base.a, l.b - base.b) > 9,
  ).length;
  const chromaOutlierShare = chromaOutliers / (blockLab.length || 1);

  // Bottom darkening: rising damp and skirting-level seepage darken the lower
  // band of a wall. Taken as a ratio, so exposure and white balance do not
  // change the reading.
  const third = Math.max(1, Math.floor(bh / 3));
  const meanRows = (from: number, to: number) => {
    let s = 0;
    let n = 0;
    for (let by = from; by < to; by++) {
      for (let bx = 0; bx < bw; bx++) {
        s += blockMean[by * bw + bx];
        n++;
      }
    }
    return n ? s / n : 0;
  };
  const topMean = meanRows(0, third);
  const botMean = meanRows(Math.max(third, bh - third), bh);
  const bottomDarkening = topMean > 0 ? Math.max(0, (topMean - botMean) / topMean) : 0;

  // Mottling: blocks noticeably darker than the wall AND internally flat. Flat
  // rules out texture and detail, dark rules out highlights; what is left looks
  // like a patch, which is the signature of peeling or a repaired area.
  const meanBlock = blockMean.reduce((s, v) => s + v, 0) / (blockMean.length || 1);

  // The flatness test needs an absolute floor. Against a purely relative
  // threshold, a photograph whose patches are internally smooth drives
  // `blockVariance` to nearly zero, and the test becomes `0 < 0` — so the
  // flattest, most obvious patching in the frame is the one case that scores
  // nothing. The floor is what stops the detector failing on its best input.
  const flatEnough = Math.max(3, blockVariance * 0.7);

  // Compared against the LOCAL neighbourhood, not the frame average. Against
  // the frame average, any smooth gradient — raking light across a wall, which
  // is present in a large share of real photographs — puts its whole dark half
  // below the mean and reports it as peeling. A gradient is smooth locally, so
  // each block sits close to its own neighbours; a genuine patch does not.
  let mottle = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const i = by * bw + bx;
      let around = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ny = by + dy;
          const nx = bx + dx;
          if (ny < 0 || ny >= bh || nx < 0 || nx >= bw) continue;
          around += blockMean[ny * bw + nx];
          n++;
        }
      }
      if (!n) continue;
      if (blockMean[i] < around / n - 10 && blockSd[i] < flatEnough) mottle++;
    }
  }
  const mottleShare = mottle / (blockMean.length || 1);

  // Shading spread: how far block means scatter WITHIN their own row.
  //
  // The row mean is subtracted first, and that subtraction is the whole point.
  // Measured raw, a wall with a damp-darkened base reports high unevenness too
  // — so a single dark band at the bottom would light up dampness AND
  // unevenness, and the report would show two independent-looking findings
  // that are really one observation counted twice. Removing the vertical
  // profile leaves only side-to-side variation, which is what uneven plaster
  // actually looks like.
  let sqSum = 0;
  let sqN = 0;
  for (let by = 0; by < bh; by++) {
    let rowSum = 0;
    for (let bx = 0; bx < bw; bx++) rowSum += blockMean[by * bw + bx];
    const rowMean = rowSum / (bw || 1);
    for (let bx = 0; bx < bw; bx++) {
      sqSum += (blockMean[by * bw + bx] - rowMean) ** 2;
      sqN++;
    }
  }
  const shadingSpread = Math.sqrt(sqSum / (sqN || 1));

  return {
    lineEnergy,
    blockVariance,
    chromaOutlierShare,
    bottomDarkening,
    mottleShare,
    shadingSpread,
    baseHex: labToApproxHex(base),
    meanLuma,
  };
}

/** Good enough for a swatch beside the reading; never used for colour matching. */
function labToApproxHex(m: { L: number; a: number; b: number }) {
  const v = Math.round((Math.max(0, Math.min(100, m.L)) / 100) * 255);
  const warm = Math.round(Math.max(-40, Math.min(40, m.b)) * 1.1);
  const green = Math.round(Math.max(-40, Math.min(40, m.a)) * 1.1);
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return rgbToHex({ r: clamp(v + green), g: clamp(v), b: clamp(v - warm) });
}

/* ------------------------------ interpretation ---------------------------- */

/**
 * Thresholds, in one place and named.
 *
 * Calibrated against ordinary interior photographs rather than a labelled
 * dataset — which is exactly why every observation carries its measurement and
 * why confidence is capped below.
 */
const T = {
  // Calibrated against synthetic walls covering the realistic range: a flat
  // wall, sensor noise, raking light across the frame, one hairline, several
  // hairlines, heavy crazing, damp bands, patch peeling, a stain and wavy
  // plaster. The levels are set so that light and noise score clean, and so
  // that the milder version of each real defect lands on "watch" rather than
  // jumping straight to "attention".
  cracks: { watch: 2.0, attention: 4.5 },
  dampness: { watch: 0.09, attention: 0.17 },
  peeling: { watch: 0.07, attention: 0.14 },
  // A stain is local by nature: a patch covering a twentieth of the frame is
  // already worth mentioning, so this sits far lower than it first appears.
  stains: { watch: 0.04, attention: 0.12 },
  uneven: { watch: 9, attention: 15 },
} as const;

type Band = { watch: number; attention: number };

const band = (v: number, t: Band): Severity =>
  v >= t.attention ? "attention" : v >= t.watch ? "watch" : "ok";

/** Confidence rises with how far past the threshold a reading sits, and caps. */
function confidenceFor(v: number, t: Band) {
  if (v < t.watch) return 0.35;
  const over = (v - t.watch) / Math.max(1e-6, t.attention - t.watch);
  return Math.min(0.72, 0.45 + Math.min(1.2, over) * 0.22);
}

export function interpret(m: Metrics): SurfaceObservation[] {
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const make = (
    code: SurfaceCode,
    value: number,
    t: Band,
    clean: string,
    flagged: string,
    evidence: string,
  ): SurfaceObservation => {
    const severity = band(value, t);
    return {
      code,
      severity,
      confidence: confidenceFor(value, t),
      label: severity === "ok" ? clean : flagged,
      evidence,
    };
  };

  const obs: SurfaceObservation[] = [
    make(
      "cracks",
      m.lineEnergy,
      T.cracks,
      "No obvious crack lines",
      "Possible fine crack lines",
      `Thin dark line energy measured at ${m.lineEnergy.toFixed(2)} (watch level ${T.cracks.watch}).`,
    ),
    make(
      "dampness",
      m.bottomDarkening,
      T.dampness,
      "No lower-wall darkening",
      "Possible dampness towards the lower wall",
      `The lower third of the frame reads ${pct(m.bottomDarkening)} darker than the upper third.`,
    ),
    make(
      "peeling",
      m.mottleShare,
      T.peeling,
      "Surface film looks continuous",
      "Possible peeling or patched areas",
      `${pct(m.mottleShare)} of the frame reads as flat darker patches against the wall tone.`,
    ),
    make(
      "stains",
      m.chromaOutlierShare,
      T.stains,
      "Colour looks consistent across the wall",
      "Possible staining or discolouration",
      `${pct(m.chromaOutlierShare)} of the frame drifts in colour from the wall's own base tone.`,
    ),
    make(
      "uneven",
      m.shadingSpread,
      T.uneven,
      "Surface reads as level",
      "Minor surface unevenness",
      `Broad shading varies by ${m.shadingSpread.toFixed(1)} levels across the frame — this can also be the light.`,
    ),
  ];

  // Deterioration is not measured directly. It is the statement that several
  // readings agree, which is worth more than any one of them alone.
  //
  // The bar is TWO readings at attention level, not three at any level. These
  // signals are not fully independent — a large dark patch can register as both
  // damp and peeling — so counting weak flags would let one physical feature
  // manufacture a "several signs" conclusion on its own.
  const serious = obs.filter((o) => o.severity === "attention").length;
  if (serious >= 2) {
    obs.push({
      code: "deterioration",
      severity: "attention",
      confidence: 0.6,
      label: "Several signs together — worth a look in person",
      evidence: `${serious} separate readings are at their highest level in the same photograph.`,
    });
  }

  return obs;
}

/* -------------------------------- prep plan ------------------------------- */

/**
 * The preparation workflow.
 *
 * Order is fixed by how the trade actually works — you cannot putty over damp,
 * and you cannot prime over loose film — so the sequence is a constant and only
 * the `triggered` flag and the reasons vary. Steps that were not triggered stay
 * visible: a customer told "primer, always" and shown why is better served than
 * one shown a shorter list.
 */
export function buildPrep(
  obs: SurfaceObservation[],
  surface: "interior" | "exterior",
): PrepStep[] {
  const flag = (c: SurfaceCode) => obs.find((o) => o.code === c && o.severity !== "ok");
  const damp = flag("dampness");
  const peel = flag("peeling");
  const crack = flag("cracks");
  const uneven = flag("uneven");
  const stain = flag("stains");

  const steps: PrepStep[] = [
    {
      order: 1,
      title: "Surface preparation",
      category: "preparation",
      why: peel
        ? "Loose or flaking film has to come off first — anything applied over it lifts with it."
        : crack
          ? "Open out the fine lines and clean the wall down before anything is applied."
          : "Clean the wall down and let it dry. Routine, but it decides how long the finish lasts.",
      triggered: Boolean(peel || crack),
    },
  ];

  if (damp) {
    steps.push({
      order: steps.length + 1,
      title: "Treat the damp first",
      category: "waterproofing",
      why: `${damp.evidence} Paint over active moisture and it comes back through, usually within one season.`,
      triggered: true,
    });
  }

  steps.push({
    order: steps.length + 1,
    title: "Putty",
    category: "putty",
    why:
      uneven || crack || stain
        ? "Levels the shading and fills the fine lines so the finish reads flat."
        : "Two thin coats give the paint an even surface to sit on.",
    triggered: Boolean(uneven || crack || stain),
  });

  steps.push({
    order: steps.length + 1,
    title: "Primer",
    category: "primer",
    why:
      surface === "exterior"
        ? "An exterior primer is what bonds the coating to the wall through the weather cycle."
        : "Primer is what the topcoat holds on to. Skipping it is the commonest reason a repaint fails early.",
    triggered: true,
  });

  steps.push({
    order: steps.length + 1,
    title: "Paint or coating",
    category: "paint",
    why: "Two coats of the chosen finish, once everything under it is dry.",
    triggered: true,
  });

  return steps;
}

/** Severity of the whole report — what the dealer's alert list sorts on. */
export function overallSeverity(obs: SurfaceObservation[]): SurfaceReport["severity"] {
  const attention = obs.filter((o) => o.severity === "attention").length;
  const watch = obs.filter((o) => o.severity === "watch").length;
  if (attention >= 2) return "significant";
  if (attention === 1) return "moderate";
  if (watch >= 1) return "light";
  return "none";
}

/**
 * Observation codes translated into the vocabulary `CustomerSpec.condition`
 * already uses, so an analysis changes what gets recommended rather than only
 * what gets displayed.
 */
export function toSpecConditions(obs: SurfaceObservation[]): string[] {
  const out = new Set<string>();
  for (const o of obs) {
    if (o.severity === "ok" || o.code === "deterioration") continue;
    out.add(o.code === "cracks" ? "cracks" : o.code);
  }
  return [...out];
}

export const ENGINE = "surface-heuristic-v1";

/** Assemble a full report from already-measured metrics. */
export function reportFrom(
  metricsList: Metrics[],
  surface: "interior" | "exterior",
): SurfaceReport {
  if (!metricsList.length) {
    return {
      engine: ENGINE,
      observations: [],
      prep: buildPrep([], surface),
      severity: "none",
      confidence: "low",
      conditions: [],
      imageCount: 0,
    };
  }

  // Several photographs of one job: take the WORST reading per signal. A wall
  // is only as sound as its worst patch, and averaging hides exactly the thing
  // the customer uploaded a second photograph to show.
  const worst = metricsList.reduce((a, b) => ({
    lineEnergy: Math.max(a.lineEnergy, b.lineEnergy),
    blockVariance: Math.max(a.blockVariance, b.blockVariance),
    chromaOutlierShare: Math.max(a.chromaOutlierShare, b.chromaOutlierShare),
    bottomDarkening: Math.max(a.bottomDarkening, b.bottomDarkening),
    mottleShare: Math.max(a.mottleShare, b.mottleShare),
    shadingSpread: Math.max(a.shadingSpread, b.shadingSpread),
    baseHex: a.baseHex,
    meanLuma: (a.meanLuma + b.meanLuma) / 2,
  }));

  const observations = interpret(worst);
  return {
    engine: ENGINE,
    observations,
    prep: buildPrep(observations, surface),
    severity: overallSeverity(observations),
    // More photographs, more agreement. Never above "medium" — this is pixel
    // statistics, and the label has to keep saying so.
    confidence: metricsList.length >= 2 ? "medium" : "low",
    conditions: toSpecConditions(observations),
    imageCount: metricsList.length,
  };
}

/* ------------------------------ presentation ------------------------------ */

export const SEVERITY_COPY: Record<SurfaceReport["severity"], string> = {
  none: "Nothing stood out in these photographs",
  light: "One thing worth keeping an eye on",
  moderate: "Something here is worth preparing for",
  significant: "Several signs — prepare the wall before you paint",
};
