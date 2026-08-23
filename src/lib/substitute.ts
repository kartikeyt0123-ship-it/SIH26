/**
 * Nearest producible alternative to a colour the dealer cannot make today.
 *
 * THE PROBLEM THIS SOLVES: the availability rule is absolute — a shade the
 * dealer cannot tint never reaches the customer. That is right, because a
 * promise that breaks at the counter is worse than no promise. But applied
 * bluntly it means a customer who has fallen for a colour is told nothing at
 * all, and both the sale and the demand signal are lost.
 *
 * So the colour is shown, marked unavailable, and answered two ways: here is
 * the closest thing your dealer can mix today, and here is a button to ask them
 * to stock the one you actually wanted.
 *
 * WHAT "CLOSEST" MEANS: not merely the smallest colour difference. A substitute
 * has to be usable in the same place for the same job — an exterior wall needs
 * a shade rated for exteriors, a large wall needs one that does not overwhelm
 * a room. A perceptually closer shade that fails either test is a worse answer
 * than a slightly more distant one that works, so those are hard filters and
 * ΔE only ranks what survives them.
 */

import { deltaEHex, hexToHsl, hexToLab } from "./color";
import type { Shade } from "./catalog";

export type Substitute = {
  shade: Shade;
  /** CIE76 ΔE from the shade the customer asked for. */
  deltaE: number;
  /** How close a person would call it, in words rather than a number. */
  closeness: "almost identical" | "very close" | "close" | "a noticeable change";
  /** Plain-language reason, shown with the swatch. */
  why: string;
};

/**
 * ΔE bands, in the terms a customer would use.
 *
 * Roughly: under 2 is a difference most people cannot see side by side; under 5
 * reads as the same colour in a different light; under 10 is recognisably the
 * same family. Beyond that it is honestly a different colour and says so.
 */
function closenessFor(dE: number): Substitute["closeness"] {
  if (dE < 2) return "almost identical";
  if (dE < 5) return "very close";
  if (dE < 10) return "close";
  return "a noticeable change";
}

export function findSubstitutes(
  wanted: Shade,
  pool: Shade[],
  opts: { surface: "interior" | "exterior"; limit?: number } = { surface: "interior" },
): Substitute[] {
  const wantedHsl = hexToHsl(wanted.hex);
  const wantedL = hexToLab(wanted.hex).L;

  const eligible = pool.filter((s) => {
    if (s.code === wanted.code) return false;
    // Hard filters: same job, same place. A substitute that cannot go on this
    // surface is not a substitute at all, however close the colour.
    if (opts.surface === "exterior" && !s.exteriorSuitable) return false;
    if (wanted.wallSafe && !s.wallSafe) return false;
    return true;
  });

  return eligible
    .map((shade) => {
      const dE = deltaEHex(shade.hex, wanted.hex);
      const hsl = hexToHsl(shade.hex);
      const L = hexToLab(shade.hex).L;

      const notes: string[] = [];
      if (shade.family === wanted.family) notes.push(`same ${shade.family.toLowerCase()} family`);
      if (Math.abs(L - wantedL) < 6) notes.push("same depth");
      else if (L > wantedL) notes.push("a touch lighter");
      else notes.push("a touch deeper");
      if (Math.abs(hsl.s - wantedHsl.s) < 8) notes.push("same intensity");
      if (opts.surface === "exterior") notes.push("rated for outside walls");

      return {
        shade,
        deltaE: Math.round(dE * 10) / 10,
        closeness: closenessFor(dE),
        why: `${notes.join(", ")} — and your dealer can mix it today.`,
      };
    })
    // Same-family first at equal distance: two shades an equal ΔE apart are not
    // equally good answers if one is a neighbouring beige and the other a grey
    // that happens to land the same distance away.
    .sort(
      (a, b) =>
        a.deltaE - b.deltaE ||
        Number(b.shade.family === wanted.family) - Number(a.shade.family === wanted.family),
    )
    .slice(0, opts.limit ?? 3);
}

/** The line the customer reads above the alternatives. */
export function substituteHeadline(wanted: Shade, best: Substitute | undefined) {
  if (!best) {
    return `${wanted.name} is not something your dealer can mix today, and nothing close enough is in stock either.`;
  }
  return best.closeness === "almost identical" || best.closeness === "very close"
    ? `${wanted.name} is not available today, but ${best.shade.name} is ${best.closeness} — most people would not tell them apart on a wall.`
    : `${wanted.name} is not available today. ${best.shade.name} is the nearest your dealer can mix.`;
}
