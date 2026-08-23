/**
 * What-If — design exploration by changing the brief, not by inventing colours.
 *
 * The mechanism, plainly: "make it more premium" is turned into a concrete edit
 * to the `CustomerSpec` — budget up a band, finish towards satin, mood towards
 * deeper tones — and then the SAME recommender runs against the SAME live
 * inventory. Nothing here generates a colour, ranks a product, or bypasses a
 * stock check, which is why a What-If result can be saved and quoted exactly
 * like a first-pass recommendation.
 *
 * This is the property that matters: there is one recommendation engine in this
 * application, and What-If is a caller of it. A second engine that produced
 * pretty options the dealer could not supply would be worse than no feature.
 *
 * WHERE A MODEL GOES: parsing free text into an `Intent` is the natural place
 * for a language model, and it is isolated in `parseIntent` for exactly that
 * reason. The transforms themselves stay deterministic — a model choosing which
 * products are eligible is the thing this codebase refuses to do.
 */

import type { CustomerSpec } from "./recommend";

export type Intent =
  | "premium"
  | "brighter"
  | "warmer"
  | "cooler"
  | "minimal"
  | "bold-accent"
  | "low-maintenance"
  | "value";

export type WhatIfOption = {
  intent: Intent;
  /** Button text. Written as the customer would say it. */
  prompt: string;
  /** One line explaining what will change, shown before they tap. */
  effect: string;
};

/**
 * The offered directions.
 *
 * Eight, not thirty. Every one of these changes something the recommender
 * actually reads; a chip that produced the same five schemes would teach the
 * customer that the feature does nothing.
 */
export const OPTIONS: WhatIfOption[] = [
  {
    intent: "premium",
    prompt: "Make it more premium",
    effect: "Moves up a budget band and towards deeper, lower-contrast pairings.",
  },
  {
    intent: "brighter",
    prompt: "Make it brighter",
    effect: "Favours lighter walls and a cleaner, more reflective finish.",
  },
  {
    intent: "warmer",
    prompt: "Use warmer colours",
    effect: "Shifts the whole palette towards reds, ochres and warm neutrals.",
  },
  {
    intent: "cooler",
    prompt: "Use cooler colours",
    effect: "Shifts towards greens, blues and grey neutrals.",
  },
  {
    intent: "minimal",
    prompt: "Give me a minimal look",
    effect: "Tonal schemes only — one family, quiet separation, no strong accent.",
  },
  {
    intent: "bold-accent",
    prompt: "I want a bold accent wall",
    effect: "Keeps the walls calm and pushes the feature wall much harder.",
  },
  {
    intent: "low-maintenance",
    prompt: "Something low maintenance",
    effect: "Washable, harder-wearing finishes; avoids the palest walls.",
  },
  {
    intent: "value",
    prompt: "Keep the cost down",
    effect: "Moves down a budget band and prefers what your dealer has most of.",
  },
];

export const OPTION_BY_INTENT = new Map(OPTIONS.map((o) => [o.intent, o]));

/* ------------------------------- transforms ------------------------------- */

const BUDGETS = ["economy", "mid", "premium"] as const;
type Budget = (typeof BUDGETS)[number];

const shiftBudget = (b: Budget, by: number): Budget =>
  BUDGETS[Math.max(0, Math.min(BUDGETS.length - 1, BUDGETS.indexOf(b) + by))];

/**
 * Intent → a changed brief.
 *
 * Returns the new spec AND the sentence explaining the change, together, so it
 * is impossible to show the customer an explanation that has drifted from what
 * was actually done. They are produced in one place because they are one fact.
 */
export function applyIntent(
  spec: CustomerSpec,
  intent: Intent,
): { spec: CustomerSpec; changed: string[] } {
  const next: CustomerSpec = { ...spec, brands: [...spec.brands], condition: [...spec.condition] };
  const changed: string[] = [];

  switch (intent) {
    case "premium": {
      const b = shiftBudget(next.budget as Budget, 1);
      if (b !== next.budget) {
        changed.push(`budget raised to ${b}`);
        next.budget = b;
      }
      // Satin reads as premium in a way matt does not, and it is what the
      // higher lines are actually sold in.
      if (next.finish === "matt" || next.finish === "any") {
        next.finish = "satin";
        changed.push("finish moved to satin");
      }
      if (next.mood === "any" || next.mood === "neutral") {
        next.mood = "warm";
        changed.push("palette allowed to go deeper");
      }
      break;
    }

    case "brighter": {
      next.mood = next.mood === "bold" ? "any" : next.mood;
      if (next.finish === "matt") {
        next.finish = "soft-sheen";
        changed.push("finish moved to soft-sheen, which throws more light back");
      }
      changed.push("ranking now favours the lightest walls available");
      break;
    }

    case "warmer":
      next.mood = "warm";
      changed.push("palette restricted to the warm half of the wheel");
      break;

    case "cooler":
      next.mood = "cool";
      changed.push("palette restricted to greens, blues and cool neutrals");
      break;

    case "minimal":
      next.mood = "neutral";
      if (next.finish === "any") next.finish = "matt";
      changed.push("accent saturation held down, tonal pairings preferred");
      break;

    case "bold-accent":
      next.mood = "bold";
      changed.push("feature wall pushed to a much stronger colour");
      break;

    case "low-maintenance": {
      // Washability comes from the resin, and the resin comes with the band.
      // This is why the transform touches budget and not just finish.
      if (next.budget === "economy") {
        next.budget = "mid";
        changed.push("budget raised to mid — washability comes with the line, not the colour");
      }
      next.finish = "satin";
      changed.push("finish moved to satin, which takes a wipe");
      break;
    }

    case "value": {
      const b = shiftBudget(next.budget as Budget, -1);
      if (b !== next.budget) {
        changed.push(`budget lowered to ${b}`);
        next.budget = b;
      }
      // Widening the brand filter is the cheapest real saving available: it
      // lets the dealer's deepest stock into the running.
      if (next.brands.length) {
        next.brands = [];
        changed.push("brand filter removed so your dealer's deepest stock counts");
      }
      if (next.finish !== "any") {
        next.finish = "any";
        changed.push("finish opened up");
      }
      break;
    }
  }

  if (!changed.length) changed.push("brief already matched this direction; ranking re-run against live stock");
  return { spec: next, changed };
}

/**
 * Ranking bias applied AFTER the recommender returns.
 *
 * Some intents are about ordering rather than eligibility — "brighter" does not
 * make a dark wall ineligible, it makes it a worse answer. Doing this as a
 * re-sort keeps `recommend.ts` free of What-If concepts entirely.
 */
export function biasFor(intent: Intent): (s: { shades: { main: { hex: string }; feature: { hex: string } }; score: number }) => number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };

  switch (intent) {
    case "brighter":
      return (s) => s.score + lum(s.shades.main.hex) * 60;
    case "premium":
      // Premium reads as restraint: less separation between wall and feature.
      return (s) => s.score - Math.abs(lum(s.shades.main.hex) - lum(s.shades.feature.hex)) * 25;
    case "bold-accent":
      return (s) => s.score + Math.abs(lum(s.shades.main.hex) - lum(s.shades.feature.hex)) * 45;
    case "low-maintenance":
      // The palest walls show every mark; that is a maintenance fact, not taste.
      return (s) => s.score - Math.max(0, lum(s.shades.main.hex) - 0.88) * 200;
    case "minimal":
      return (s) => s.score - Math.abs(lum(s.shades.main.hex) - lum(s.shades.feature.hex)) * 30;
    default:
      return (s) => s.score;
  }
}

/**
 * Free text → intent.
 *
 * Keyword matching, and it says so when it fails rather than guessing. This is
 * the one function in the feature a language model would improve, and it is
 * isolated here so that swapping it changes nothing else.
 */
export function parseIntent(text: string): Intent | null {
  const t = text.toLowerCase();
  const table: [Intent, string[]][] = [
    ["premium", ["premium", "luxury", "expensive", "upmarket", "rich"]],
    ["brighter", ["bright", "lighter", "airy", "open", "light"]],
    ["warmer", ["warm", "cosy", "cozy", "earthy"]],
    ["cooler", ["cool", "calm", "blue", "green", "fresh"]],
    ["minimal", ["minimal", "simple", "plain", "quiet", "subtle"]],
    ["bold-accent", ["bold", "accent", "dramatic", "statement", "striking"]],
    ["low-maintenance", ["maintenance", "washable", "clean", "durable", "kids"]],
    ["value", ["cheap", "budget", "affordable", "save", "cost", "economical"]],
  ];
  for (const [intent, words] of table) {
    if (words.some((w) => t.includes(w))) return intent;
  }
  return null;
}

export const WHATIF_ENGINE = "whatif-rules-v1";
