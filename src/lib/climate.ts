/**
 * Climate context — the environmental half of a recommendation.
 *
 * THE ONE RULE: this module never invents a live reading. When no weather
 * service is configured it returns typical conditions for the city and month
 * from a built-in table, `source` is "demo", `live` is false, and every screen
 * that renders it is required to say "typical for August in Kanpur", not
 * "34°C right now". A fabricated live temperature is the single most damaging
 * thing this feature could do, because a dealer would believe it.
 *
 * WHERE THE REAL FEED GOES: `resolveClimate` is the only entry point.
 * Configuring WEATHER_API_URL swaps in the live provider; the returned shape,
 * the stored row and every consumer are unchanged, and `live` flips to true,
 * which is what changes the wording on screen.
 */

/* --------------------------------- types ---------------------------------- */

export type Season = "summer" | "monsoon" | "winter" | "post-monsoon";

export type ClimateContext = {
  city: string;
  /** demo | the configured provider's name. Never implied. */
  source: string;
  /** False for the built-in table. The UI keys its wording off this. */
  live: boolean;
  /** Rendered verbatim above the panel. */
  disclosure: string;
  season: Season;
  month: number;
  /** Typical daytime high, °C. */
  tempC: number;
  /** Typical relative humidity, %. */
  humidityPct: number;
  /** Typical monthly rainfall, mm. */
  rainfallMm: number;
  /** Derived bands, which is what the rules actually consume. */
  heat: "mild" | "warm" | "severe";
  damp: "dry" | "moderate" | "high";
  observedAt: string;
};

export type ClimateAdvice = {
  /** Short imperative the customer reads first. */
  headline: string;
  /** The environmental fact it rests on. */
  because: string;
  /** Which product properties this argues for. */
  wants: string[];
  /** Severity of the argument — drives emphasis, not alarm. */
  weight: "note" | "important";
};

/* ------------------------------ the demo table ---------------------------- */

/**
 * Typical monthly conditions for the cities this pilot covers.
 *
 * These are climate normals — what August is usually like — not observations.
 * They are good enough to reason with (an exterior wall in a 900 mm monsoon
 * month wants a different coating whatever today's weather is doing) and they
 * are labelled so nobody mistakes them for a forecast.
 *
 * Tuple order: [tempC, humidityPct, rainfallMm] per month, January first.
 */
const NORMALS: Record<string, [number, number, number][]> = {
  kanpur: [
    [23, 62, 15], [27, 52, 12], [33, 40, 8], [39, 28, 5], [42, 30, 12],
    [40, 48, 68], [34, 76, 240], [33, 80, 268], [33, 72, 158], [33, 55, 32],
    [29, 55, 5], [24, 62, 8],
  ],
  lucknow: [
    [24, 63, 16], [28, 53, 14], [34, 41, 9], [39, 29, 6], [41, 32, 15],
    [39, 51, 82], [34, 78, 262], [33, 82, 280], [33, 74, 172], [33, 57, 34],
    [29, 56, 6], [25, 63, 9],
  ],
  delhi: [
    [21, 63, 19], [24, 55, 20], [30, 45, 15], [36, 32, 10], [40, 34, 20],
    [39, 52, 65], [35, 76, 210], [34, 80, 250], [34, 72, 130], [33, 56, 20],
    [28, 57, 5], [22, 63, 10],
  ],
  mumbai: [
    [31, 65, 1], [31, 68, 1], [32, 72, 1], [33, 74, 2], [33, 74, 12],
    [32, 84, 520], [30, 88, 840], [30, 87, 585], [31, 84, 320], [34, 76, 90],
    [34, 68, 20], [32, 65, 5],
  ],
};

const DEFAULT_CITY = "kanpur";

function seasonFor(month: number, rainfall: number): Season {
  if (rainfall > 120) return "monsoon";
  if (month >= 11 || month <= 2) return "winter";
  if (month >= 3 && month <= 6) return "summer";
  return "post-monsoon";
}

const heatBand = (t: number): ClimateContext["heat"] =>
  t >= 38 ? "severe" : t >= 31 ? "warm" : "mild";
const dampBand = (h: number, r: number): ClimateContext["damp"] =>
  r > 150 || h >= 78 ? "high" : r > 50 || h >= 62 ? "moderate" : "dry";

/* -------------------------------- provider -------------------------------- */

/* ------------------------------- geocoding -------------------------------- */

export type Place = { name: string; lat: number; lon: number; admin?: string };

/**
 * City name → coordinates, via Open-Meteo's geocoding service.
 *
 * No API key, no account, no rate-limit ceremony — which is why it is used
 * rather than a provider that would make live weather a paid feature nobody
 * turns on. Called once at dealer sign-up and the result stored, so a failure
 * here costs a coordinate, never a registration.
 */
export async function geocodeCity(city: string): Promise<Place | null> {
  const q = city.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string }[] };
    const hit = j.results?.[0];
    if (!hit) return null;
    return { name: hit.name, lat: hit.latitude, lon: hit.longitude, admin: hit.admin1 };
  } catch {
    return null;
  }
}

/* -------------------------------- resolver -------------------------------- */

/**
 * The only entry point.
 *
 * Order of preference:
 *   1. Live observation from Open-Meteo, when coordinates are known.
 *   2. A custom provider at WEATHER_API_URL, if one is configured.
 *   3. The built-in climate-normals table, labelled simulated.
 *
 * The fall-through is what keeps this honest. A network failure downgrades the
 * reading to the table AND downgrades the label with it — `live` goes false and
 * every screen changes its wording, because nothing is allowed to present a
 * monthly normal as today's weather.
 */
export async function resolveClimate(input: {
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
  month?: number;
  now?: Date;
}): Promise<ClimateContext> {
  const now = input.now ?? new Date();
  const month = input.month ?? now.getMonth() + 1;
  const cityKey = (input.city ?? DEFAULT_CITY).trim().toLowerCase();
  const cityLabel = (input.city ?? "Kanpur").trim() || "Kanpur";

  if (typeof input.lat === "number" && typeof input.lon === "number") {
    const live = await tryOpenMeteo(input.lat, input.lon, cityLabel, month, now);
    if (live) return live;
  }

  const endpoint = process.env.WEATHER_API_URL?.trim();
  if (endpoint) {
    const live = await tryLive(endpoint, cityLabel, month, now);
    // A configured provider that fails falls through to the table — but the
    // result says "demo" and the screen says simulated. It never claims the
    // provider answered when it did not.
    if (live) return live;
  }

  const table = NORMALS[cityKey] ?? NORMALS[DEFAULT_CITY];
  const [tempC, humidityPct, rainfallMm] = table[Math.max(0, Math.min(11, month - 1))];

  return {
    city: cityLabel,
    source: "demo",
    live: false,
    disclosure:
      "Typical conditions for this city and month, from a built-in climate table. Simulated for development — not a live reading.",
    season: seasonFor(month, rainfallMm),
    month,
    tempC,
    humidityPct,
    rainfallMm,
    heat: heatBand(tempC),
    damp: dampBand(humidityPct, rainfallMm),
    observedAt: now.toISOString(),
  };
}

/**
 * Live observation from Open-Meteo.
 *
 * Asks for the CURRENT temperature and humidity plus today's accumulated
 * rainfall, and separately the last 30 days of precipitation. Both matter and
 * they answer different questions: "is it raining on the wall right now"
 * decides whether the job can start, and "how wet has this month been"
 * decides which coating belongs on the wall at all. A single instantaneous
 * reading cannot tell a dealer that August has been relentless.
 */
async function tryOpenMeteo(
  lat: number,
  lon: number,
  city: string,
  month: number,
  now: Date,
): Promise<ClimateContext | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation` +
      `&daily=precipitation_sum,temperature_2m_max` +
      `&past_days=30&forecast_days=1&timezone=auto`;

    const res = await fetch(url, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    if (!res.ok) return null;

    const j = (await res.json()) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number; precipitation?: number };
      daily?: { precipitation_sum?: (number | null)[]; temperature_2m_max?: (number | null)[] };
    };

    const tempNow = Number(j.current?.temperature_2m);
    const humidity = Number(j.current?.relative_humidity_2m);
    if (!Number.isFinite(tempNow) || !Number.isFinite(humidity)) return null;

    // Rolling 30-day total, which is directly comparable to the monthly normals
    // in the table below — so the two sources say the same kind of thing.
    const rain = (j.daily?.precipitation_sum ?? []).reduce<number>(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0,
    );
    const highs = (j.daily?.temperature_2m_max ?? []).filter(
      (v): v is number => typeof v === "number",
    );
    // Heat exposure is about what the wall endures, not this minute's air
    // temperature — a reading taken at dawn would otherwise class a 42°C
    // afternoon as mild.
    const peak = highs.length ? Math.max(...highs.slice(-14)) : tempNow;

    return {
      city,
      source: "open-meteo",
      live: true,
      disclosure: `Live reading for ${city} from Open-Meteo, taken ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Rainfall is the last 30 days.`,
      season: seasonFor(month, rain),
      month,
      tempC: Math.round(tempNow),
      humidityPct: Math.round(humidity),
      rainfallMm: Math.round(rain),
      heat: heatBand(peak),
      damp: dampBand(humidity, rain),
      observedAt: now.toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Custom provider path, deliberately small.
 *
 * It expects a JSON body with `temp_c`, `humidity` and `rain_mm`. Anything
 * else — a non-200, a timeout, a shape it does not recognise — returns null and
 * the caller falls back to the table. It does not throw, because a weather
 * service being down must not stop a customer designing a room.
 */
async function tryLive(
  endpoint: string,
  city: string,
  month: number,
  now: Date,
): Promise<ClimateContext | null> {
  try {
    const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(city)}`, {
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const tempC = Number(j.temp_c);
    const humidityPct = Number(j.humidity);
    const rainfallMm = Number(j.rain_mm ?? 0);
    if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct)) return null;

    return {
      city,
      source: "weather-api",
      live: true,
      disclosure: "Live conditions from the configured weather service.",
      season: seasonFor(month, rainfallMm),
      month,
      tempC,
      humidityPct,
      rainfallMm,
      heat: heatBand(tempC),
      damp: dampBand(humidityPct, rainfallMm),
      observedAt: now.toISOString(),
    };
  } catch {
    return null;
  }
}

/* --------------------------------- rules ---------------------------------- */

/**
 * Climate → what the product needs to be.
 *
 * Every rule states the fact it rests on, so the dealer can disagree with the
 * conclusion while still trusting the number. Interior work gets far fewer
 * rules than exterior, and that asymmetry is correct: an inside wall in Kanpur
 * does not care that August brings 268 mm of rain unless the wall is already wet.
 */
export function climateAdvice(
  ctx: ClimateContext,
  spec: { surface: "interior" | "exterior"; conditions: string[] },
): ClimateAdvice[] {
  const out: ClimateAdvice[] = [];
  const typical = ctx.live ? "" : "typically ";

  if (spec.surface === "exterior") {
    out.push({
      headline: "This is an outside wall, so weather decides how long it lasts",
      because: `${ctx.city} sees ${typical}${ctx.rainfallMm} mm of rain and ${ctx.humidityPct}% humidity this month.`,
      wants: ["exterior emulsion", "weather-resistant film", "UV-stable pigment"],
      weight: "important",
    });

    if (ctx.damp === "high") {
      out.push({
        headline: "Choose a coating that sheds water, not one that only looks good",
        because: `${ctx.season === "monsoon" ? "This is the monsoon window" : "Humidity runs high here"} — ${typical}${ctx.rainfallMm} mm this month.`,
        wants: ["waterproof topcoat", "elastomeric film", "anti-fungal additive"],
        weight: "important",
      });
    }

    if (ctx.heat === "severe") {
      out.push({
        headline: "Deep shades will fade first on this wall",
        because: `Daytime highs reach ${typical}${ctx.tempC}°C, and the south and west faces take the worst of it.`,
        wants: ["heat-reflective finish", "lighter body colour", "UV-stable pigment"],
        weight: "important",
      });
    }
  } else {
    if (ctx.damp === "high" || spec.conditions.includes("dampness")) {
      out.push({
        headline: "Inside, the risk here is moisture behind the paint",
        because: spec.conditions.includes("dampness")
          ? "Your own photographs showed possible dampness, and the season is against you."
          : `Indoor humidity tracks the outside, which runs ${typical}${ctx.humidityPct}% this month.`,
        wants: ["damp-resistant primer", "washable finish", "anti-fungal additive"],
        weight: spec.conditions.includes("dampness") ? "important" : "note",
      });
    }

    if (ctx.heat !== "mild") {
      out.push({
        headline: "A washable finish earns its price in this climate",
        because: `Warm months mean fans, dust and more wiping down. ${typical}${ctx.tempC}°C highs this month.`,
        wants: ["washable finish", "soft-sheen or satin"],
        weight: "note",
      });
    }
  }

  if (ctx.season === "monsoon") {
    out.push({
      headline: "Drying time between coats will be longer than usual",
      because: `${typical}${ctx.humidityPct}% humidity slows the film. Rushing the second coat is what causes patchiness.`,
      wants: ["longer recoat interval"],
      weight: "note",
    });
  }

  return out;
}

/**
 * The properties the recommender should favour, flattened.
 *
 * Returned as plain strings that match the `features` already on product lines,
 * so climate can bias ranking without the recommender knowing what weather is.
 */
export function climateFeatureBias(advice: ClimateAdvice[]): string[] {
  return [...new Set(advice.flatMap((a) => a.wants))];
}

export const SEASON_LABEL: Record<Season, string> = {
  summer: "Summer",
  monsoon: "Monsoon",
  winter: "Winter",
  "post-monsoon": "Post-monsoon",
};
