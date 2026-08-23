/**
 * Demand Radar — the dealer's own customer activity, counted.
 *
 * THE ONE RULE: nothing here is a market trend. Every number on this page comes
 * from rows this dealer's own customers created — a shade that was shortlisted,
 * a design that was submitted, litres that are actually on the shelf. The
 * wording is fixed at the source ("based on your customer activity") rather
 * than left to whoever writes the component, because the temptation to upgrade
 * "eleven of your customers" into "the market is moving" is exactly what would
 * make this feature worthless.
 *
 * WHERE EXTERNAL DATA GOES: `ExternalSignal` is already threaded through
 * `rank`. A seasonal or regional feed becomes rows with `source: "market"`,
 * they sort alongside the internal ones, and the badge on each row is what
 * tells the dealer which kind it is looking at. No consumer changes.
 */

/* -------------------------------- inputs ---------------------------------- */

/** One customer touch on one shade. */
export type ShadeTouch = {
  code: string;
  name: string;
  hex: string;
  /** saved | chosen | submitted — weighted differently below. */
  kind: "saved" | "chosen" | "submitted";
  at: Date;
};

export type StockRow = {
  productId: string;
  product: string;
  brand: string;
  litres: number;
  reorderLevel: number;
  weeklyOfftake: number;
  leadTimeDays: number;
  sellingPerLitre: number;
};

export type ExternalSignal = {
  headline: string;
  reason: string;
  action: string;
  /** "demo" until a real feed exists. Rendered as a badge, never hidden. */
  source: string;
  confidence: string;
};

/* -------------------------------- outputs --------------------------------- */

export type TrendRow = {
  code: string;
  name: string;
  hex: string;
  /** Weighted interest in the recent window. */
  score: number;
  /** Same, for the window before it — this is what makes the arrow honest. */
  priorScore: number;
  direction: "up" | "flat" | "down";
  /** Percentage change, null when there is no prior period to compare against. */
  changePct: number | null;
  touches: number;
  /** Always internal today. Kept so an external row can sit in the same list. */
  source: "customer-activity";
};

export type StockAlert = {
  productId: string;
  product: string;
  brand: string;
  litres: number;
  /** Days of cover at this dealer's own offtake rate. */
  daysOfCover: number;
  leadTimeDays: number;
  severity: "critical" | "low";
  /** Recent customer interest in this product, if any. */
  demandTouches: number;
  reason: string;
};

export type RestockAction = {
  productId: string;
  product: string;
  brand: string;
  /** Litres, rounded to a pack-sensible number. */
  suggestLitres: number;
  approxCost: number;
  /** The full sentence, assembled from the evidence, not a template. */
  reason: string;
  priority: number;
};

export type DemandRadar = {
  engine: string;
  /** Rendered above the panel, verbatim. */
  basis: string;
  trends: TrendRow[];
  alerts: StockAlert[];
  restock: RestockAction[];
  external: ExternalSignal[];
  windowDays: number;
  /** True when there is genuinely nothing yet — drives the empty state. */
  empty: boolean;
};

export const DEMAND_ENGINE = "demand-radar-v1";
export const DEMAND_BASIS =
  "Counted from your own customers' activity and your own stock levels. No external market data is involved.";

/* -------------------------------- weights --------------------------------- */

/**
 * A submitted design is a customer who has committed; a saved one is a
 * shortlist. The gap between them is the whole reason this is weighted rather
 * than counted — treating a shortlist as a sale is how a dealer ends up with a
 * shelf full of a colour nobody bought.
 */
const TOUCH_WEIGHT: Record<ShadeTouch["kind"], number> = {
  saved: 1,
  chosen: 2,
  submitted: 3.5,
};

/** Recent activity counts for more, on a gentle half-life rather than a cliff. */
function recency(at: Date, now: Date, halfLifeDays: number) {
  const days = Math.max(0, (now.getTime() - at.getTime()) / 86_400_000);
  return Math.pow(0.5, days / halfLifeDays);
}

/* ------------------------------- computation ------------------------------ */

export function computeTrends(
  touches: ShadeTouch[],
  now: Date,
  windowDays = 14,
): TrendRow[] {
  const cur = new Map<string, { row: ShadeTouch; score: number; n: number }>();
  const prior = new Map<string, number>();
  const windowMs = windowDays * 86_400_000;

  for (const t of touches) {
    const age = now.getTime() - t.at.getTime();
    const w = TOUCH_WEIGHT[t.kind] * recency(t.at, now, windowDays);

    if (age <= windowMs) {
      const e = cur.get(t.code);
      if (e) {
        e.score += w;
        e.n += 1;
      } else {
        cur.set(t.code, { row: t, score: w, n: 1 });
      }
    } else if (age <= windowMs * 2) {
      // The window immediately before this one. Anything older is not a
      // comparison, it is history, and it would flatten every arrow to zero.
      prior.set(t.code, (prior.get(t.code) ?? 0) + TOUCH_WEIGHT[t.kind]);
    }
  }

  return [...cur.entries()]
    .map(([code, e]) => {
      const priorScore = prior.get(code) ?? 0;
      // No prior period means no claim about direction. Showing an up arrow for
      // "first time we have seen this" would be a fabricated trend.
      const changePct =
        priorScore > 0 ? ((e.score - priorScore) / priorScore) * 100 : null;
      const direction: TrendRow["direction"] =
        changePct === null ? "flat" : changePct > 12 ? "up" : changePct < -12 ? "down" : "flat";

      return {
        code,
        name: e.row.name,
        hex: e.row.hex,
        score: Math.round(e.score * 100) / 100,
        priorScore: Math.round(priorScore * 100) / 100,
        direction,
        changePct: changePct === null ? null : Math.round(changePct),
        touches: e.n,
        source: "customer-activity" as const,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Days of cover at this dealer's own offtake. Infinity when nothing moves. */
export function daysOfCover(row: StockRow) {
  if (row.weeklyOfftake <= 0) return row.litres > 0 ? Infinity : 0;
  return Math.round((row.litres / row.weeklyOfftake) * 7);
}

export function computeAlerts(
  stock: StockRow[],
  demandByProduct: Map<string, number>,
): StockAlert[] {
  return stock
    .map((row) => {
      const cover = daysOfCover(row);
      const touches = demandByProduct.get(row.productId) ?? 0;

      // Critical means the shelf runs dry before a reorder could land. That is
      // a different and more urgent statement than "below reorder level", and
      // it is the one a dealer can act on.
      const severity: StockAlert["severity"] | null =
        cover <= row.leadTimeDays
          ? "critical"
          : row.litres <= row.reorderLevel || cover <= row.leadTimeDays * 2
            ? "low"
            : null;
      if (!severity) return null;

      const coverText = Number.isFinite(cover) ? `${cover} days of cover` : "no recorded offtake";
      const reason =
        severity === "critical"
          ? `${coverText} against a ${row.leadTimeDays}-day lead time — an order placed today may not arrive before you run out.`
          : `${coverText}, and stock is at or below your reorder level of ${row.reorderLevel} L.`;

      return {
        productId: row.productId,
        product: row.product,
        brand: row.brand,
        litres: row.litres,
        daysOfCover: Number.isFinite(cover) ? cover : 999,
        leadTimeDays: row.leadTimeDays,
        severity,
        demandTouches: touches,
        reason,
      };
    })
    .filter((x): x is StockAlert => x !== null)
    .sort((a, b) => a.daysOfCover - b.daysOfCover);
}

/**
 * Restock recommendations.
 *
 * The sentence is assembled from whichever pieces of evidence actually exist,
 * so a product with customer interest gets a different reason from one that is
 * simply running low. A template that always said "frequently shortlisted"
 * would be false half the time, and a dealer only has to catch that once.
 */
export function computeRestock(
  alerts: StockAlert[],
  stock: Map<string, StockRow>,
): RestockAction[] {
  return alerts
    .map((a) => {
      const row = stock.get(a.productId);
      if (!row) return null;

      // Cover the lead time plus a fortnight's buffer, less what is on the
      // shelf. Rounded up to a 20 L pack, which is how paint is actually bought.
      const target = row.weeklyOfftake * ((a.leadTimeDays + 14) / 7);
      const need = Math.max(20, Math.ceil((target - row.litres) / 20) * 20);

      const evidence: string[] = [];
      if (a.demandTouches > 0) {
        evidence.push(
          `${a.demandTouches} customer ${a.demandTouches === 1 ? "design has" : "designs have"} used it in the last two weeks`,
        );
      }
      if (a.severity === "critical") {
        evidence.push(`only ${a.daysOfCover} days of cover against a ${a.leadTimeDays}-day lead time`);
      } else {
        evidence.push(`stock is at ${a.litres} L, at or below your reorder level`);
      }

      return {
        productId: a.productId,
        product: a.product,
        brand: a.brand,
        suggestLitres: need,
        approxCost: need * row.sellingPerLitre,
        reason: `Recommended because ${evidence.join(", and ")}.`,
        // Customer interest is what separates "low" from "low and wanted".
        priority:
          (a.severity === "critical" ? 100 : 50) + a.demandTouches * 10 - a.daysOfCover,
      };
    })
    .filter((x): x is RestockAction => x !== null)
    .sort((a, b) => b.priority - a.priority);
}

/** Assemble the whole radar. Pure — the server module does the reading. */
export function buildRadar(input: {
  touches: ShadeTouch[];
  stock: StockRow[];
  demandByProduct: Map<string, number>;
  external: ExternalSignal[];
  now: Date;
  windowDays?: number;
}): DemandRadar {
  const windowDays = input.windowDays ?? 14;
  const trends = computeTrends(input.touches, input.now, windowDays);
  const alerts = computeAlerts(input.stock, input.demandByProduct);
  const restock = computeRestock(alerts, new Map(input.stock.map((s) => [s.productId, s])));

  return {
    engine: DEMAND_ENGINE,
    basis: DEMAND_BASIS,
    trends: trends.slice(0, 8),
    alerts: alerts.slice(0, 6),
    restock: restock.slice(0, 4),
    external: input.external,
    windowDays,
    empty: trends.length === 0 && alerts.length === 0,
  };
}

export const DIRECTION_GLYPH: Record<TrendRow["direction"], string> = {
  up: "↑",
  flat: "→",
  down: "↓",
};
