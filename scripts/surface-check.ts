/**
 * Calibration check for the surface analyser. Run with `npm run test:surface`.
 *
 * The analyser reads photographs, so its failure mode is silent: it keeps
 * returning a confident-looking report while detecting nothing. Two real
 * defects were found exactly this way and both are pinned here —
 *
 *   1. A Sobel edge detector returns near-ZERO at the centre of a thin dark
 *      line, because the bright flanks either side cancel. Cracks were
 *      invisible to it. "ONE hairline crack" fails if that regresses.
 *   2. Measuring patch darkness against the FRAME average makes any smooth
 *      gradient — raking light, present in a large share of real photographs —
 *      report its dark half as peeling. "gentle raking light" pins that.
 *
 * The specificity cases matter as much as the detection ones. A analyser that
 * flags every wall is worse than none, because a dealer stops reading it.
 */

import { measure, reportFrom, type SurfaceCode } from "@/lib/surface";

const W = 128;
const H = 128;

function make(fill: (x: number, y: number) => [number, number, number]) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b] = fill(x, y);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

const BASE: [number, number, number] = [232, 226, 214];

// Deterministic, so a run is comparable with the run before it.
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

type Case = [name: string, fill: (x: number, y: number) => [number, number, number], expect: SurfaceCode | "none"];

const CASES: Case[] = [
  /* --- specificity: these must come back clean ------------------------- */
  ["flat clean wall", () => BASE, "none"],
  [
    "clean + sensor noise",
    () => {
      const n = (rnd() - 0.5) * 10;
      return [BASE[0] + n, BASE[1] + n, BASE[2] + n];
    },
    "none",
  ],
  [
    "gentle raking light",
    (x) => {
      const d = (x / W) * 28;
      return [BASE[0] - d, BASE[1] - d, BASE[2] - d];
    },
    "none",
  ],

  /* --- detection -------------------------------------------------------- */
  ["ONE hairline crack", (x, y) => (x === 64 && y > 20 ? [120, 116, 110] : BASE), "cracks"],
  [
    "several hairlines",
    (x, y) => ((x === 30 || x === 64 || x === 97) && y > 10 ? [110, 106, 100] : BASE),
    "cracks",
  ],
  ["heavy crazing", (x) => (x % 17 === 0 ? [90, 86, 80] : BASE), "cracks"],
  ["damp lower third", (_x, y) => (y > H * 0.66 ? [150, 146, 138] : BASE), "dampness"],
  ["mild damp base", (_x, y) => (y > H * 0.75 ? [200, 195, 184] : BASE), "dampness"],
  [
    "patchy peeling",
    (x, y) => ((Math.floor(x / 16) + Math.floor(y / 16)) % 5 === 0 ? [170, 165, 155] : BASE),
    "peeling",
  ],
  [
    "brown stain patch",
    (x, y) => (x > 40 && x < 75 && y > 40 && y < 75 ? [190, 150, 110] : BASE),
    "stains",
  ],
  [
    "uneven plaster",
    (x) => {
      const d = Math.sin(x / 9) * 16;
      return [BASE[0] + d, BASE[1] + d, BASE[2] + d];
    },
    "uneven",
  ],
];

let pass = 0;
let fail = 0;

for (const [name, fill, expect] of CASES) {
  const report = reportFrom([measure(make(fill), W, H)], "interior");
  const flagged = report.observations.filter((o) => o.severity !== "ok").map((o) => o.code);
  const ok = expect === "none" ? flagged.length === 0 : flagged.includes(expect);
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} want=${String(expect).padEnd(9)} got=[${flagged.join(",")}] severity=${report.severity}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
