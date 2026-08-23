/**
 * The AI adapter.
 *
 * Six capabilities, six interfaces, one registry. Nothing in the application
 * imports a provider; it asks this module for a capability and gets whichever
 * implementation is configured. That is what makes "swap in a real model" a
 * change to one file rather than a change to every screen.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a deterministic implementation must
 * never be described as a model call. Every provider carries an `engine` string
 * and a `kind` of "deterministic" or "model", both of which travel with the
 * result all the way to the screen. If the UI wants to say "AI analysed your
 * photo", it has to check, and today it will be told no.
 *
 * There is no fallback that fakes a success. When a model provider is
 * configured and fails, the deterministic path runs and the result says so —
 * it does not pretend the model answered.
 */

import type { SurfaceReport } from "./surface";
import type { DesignDNA, DesignSignal } from "./dna";
import type { ClimateContext } from "./climate";

export type ProviderKind = "deterministic" | "model";

export type ProviderInfo = {
  /** Recorded in the database and rendered in the UI. Never inferred. */
  engine: string;
  kind: ProviderKind;
  /** One line the UI can show verbatim when asked "how was this produced?". */
  disclosure: string;
};

/* ------------------------------ capabilities ------------------------------ */

export interface VisionProvider extends ProviderInfo {
  /**
   * Surface reading. The browser implementation is the default; a hosted
   * segmentation model would implement the same signature server-side.
   */
  readonly capability: "vision";
}

export interface PreferenceProvider extends ProviderInfo {
  readonly capability: "preference";
  derive(signals: DesignSignal[]): DesignDNA;
}

export interface ClimateProvider extends ProviderInfo {
  readonly capability: "climate";
  /** `live` is false for the built-in table, and the UI keys off it. */
  readonly live: boolean;
  context(input: { city: string; month: number }): Promise<ClimateContext>;
}

/* -------------------------------- registry -------------------------------- */

/**
 * What is actually available in this deployment.
 *
 * Read at runtime from the environment, so a key added to a hosting dashboard
 * takes effect on restart rather than on rebuild. The customer-facing surface
 * of this is a single sentence — "produced by X" — and it changes on its own
 * when a provider is configured.
 */
export function providerStatus() {
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const weather = Boolean(process.env.WEATHER_API_URL?.trim());
  return {
    vision: {
      engine: "surface-heuristic-v1",
      kind: "deterministic" as ProviderKind,
      disclosure:
        "Read in your browser from the photograph's own pixel statistics. Not a trained model, and not an inspection.",
      // Present so the shape does not change when a model is added; the value
      // is what changes.
      modelConfigured: anthropic,
    },
    preference: {
      engine: "rules-v1",
      kind: "deterministic" as ProviderKind,
      disclosure:
        "Built from what you actually opened, saved and skipped, using fixed rules. No machine learning is involved.",
      modelConfigured: anthropic,
    },
    climate: {
      engine: weather ? "weather-api" : "climate-table-v1",
      kind: "deterministic" as ProviderKind,
      live: weather,
      disclosure: weather
        ? "Live conditions from the configured weather service."
        : "Typical conditions for this city and month, from a built-in table. Simulated, not a live reading.",
      modelConfigured: weather,
    },
    materials: {
      engine: "material-graph-v1",
      kind: "deterministic" as ProviderKind,
      disclosure:
        "Catalogue relationships and colour rules. Compatibility here is a design convention, not a tested property.",
      modelConfigured: false,
    },
    whatif: {
      engine: "whatif-rules-v1",
      kind: "deterministic" as ProviderKind,
      disclosure:
        "Your request is turned into a change of brief, then run back through the same recommender against live stock.",
      modelConfigured: anthropic,
    },
    demand: {
      engine: "demand-radar-v1",
      kind: "deterministic" as ProviderKind,
      disclosure:
        "Counted from your own customers' activity and your own stock. No external market data is involved.",
      modelConfigured: false,
    },
  };
}

export type ProviderStatus = ReturnType<typeof providerStatus>;

/** The single sentence a screen shows under an intelligence panel. */
export function disclosureFor(cap: keyof ProviderStatus): string {
  return providerStatus()[cap].disclosure;
}

/**
 * Guard used by the UI before it may use the word "AI" about a result.
 *
 * It is a function rather than a constant so that the answer changes the moment
 * a provider is configured, and so that nobody can hardcode `true`.
 */
export function isModelBacked(cap: keyof ProviderStatus): boolean {
  return providerStatus()[cap].kind === "model";
}

/** Re-exported so a caller can label a stored row without importing schema. */
export type { SurfaceReport, DesignDNA, DesignSignal, ClimateContext };
