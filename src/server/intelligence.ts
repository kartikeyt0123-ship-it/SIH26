/**
 * Dealer intelligence — the read side of Demand Radar and the insight panels.
 *
 * Everything on the Intelligence tab is computed here, from rows this dealer's
 * own customers created. The pure arithmetic lives in `lib/demand.ts`; this
 * module's whole job is to read the database once and hand it clean inputs.
 *
 * PERFORMANCE NOTE: this is one query per table for the entire dealer, then
 * assembly in memory — the same shape as `listSessions`, and for the same
 * reason. The naive version (walk projects, query per project) was seven round
 * trips per customer and would make the tab visibly slow at twenty customers,
 * which is a number a real dealer passes in a fortnight.
 */

import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import {
  buildRadar,
  type DemandRadar,
  type ExternalSignal,
  type ShadeTouch,
  type StockRow,
} from "@/lib/demand";

/* --------------------------------- types ---------------------------------- */

export type CustomerInsights = {
  activeProjects: number;
  submittedProjects: number;
  awaitingQuotation: number;
  /** Most common Design DNA style across this dealer's customers, if any. */
  popularStyle: { value: string; count: number } | null;
  popularPalette: { value: string; count: number } | null;
  popularFinish: { value: string; count: number } | null;
  /** How many profiles are still too thin to draw on — stated, not hidden. */
  provisionalProfiles: number;
  profileCount: number;
};

export type SurfaceAlert = {
  projectId: string;
  sessionToken: string;
  customerName: string;
  severity: string;
  /** The flagged observations only, already hedged by lib/surface.ts. */
  headline: string;
  analysedAt: string;
};

export type RecommendedAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
  priority: number;
};

/**
 * How this dealer's customers actually split across palette temperament.
 *
 * Derived from stored Design DNA profiles, counting only those that have
 * settled on a family — a profile still forming is excluded rather than
 * bucketed, because rounding "we do not know yet" into "neutral" is how a
 * dealer ends up stocking against a preference nobody expressed.
 */
export type PaletteMix = {
  buckets: { label: string; pct: number; count: number; hex: string }[];
  total: number;
  /** Profiles excluded because they have not settled. Stated, not hidden. */
  forming: number;
};

/** A customer who started and went quiet. */
export type InactiveCustomer = {
  token: string;
  name: string;
  phone: string | null;
  daysQuiet: number;
  /** Where they stopped, in words. */
  stage: string;
  /** Hours left before the link dies, so the dealer knows the urgency. */
  hoursLeft: number;
  opens: number;
};

/** What is actually selling, counted from quotations this dealer sent. */
export type BestSeller = {
  productId: string;
  product: string;
  brand: string;
  /** Quotations this line appeared on. */
  quotations: number;
  litres: number;
  value: number;
  /** True when stock will not cover the run rate this implies. */
  thin: boolean;
  reason: string;
};

/** A colour a customer asked for that the dealer cannot currently mix. */
export type ShadeRequestRow = {
  id: string;
  shadeCode: string;
  shadeName: string;
  shadeHex: string;
  substituteName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  askedAt: string;
  /** How many separate customers have asked for this same colour. */
  count: number;
};

export type DealerIntelligence = {
  generatedAt: string;
  insights: CustomerInsights;
  radar: DemandRadar;
  surfaceAlerts: SurfaceAlert[];
  actions: RecommendedAction[];
  paletteMix: PaletteMix;
  inactive: InactiveCustomer[];
  bestSellers: BestSeller[];
  shadeRequests: ShadeRequestRow[];
};

/* ------------------------------- the reader ------------------------------- */

const TOUCH_WINDOW_DAYS = 14;

export async function dealerIntelligence(dealerId: string): Promise<DealerIntelligence> {
  const db = await getDb();
  const now = new Date();

  const sessions = await db.query.customerSessions.findMany({
    where: eq(t.customerSessions.dealerId, dealerId),
  });
  const projects = await db.query.projects.findMany({
    where: eq(t.projects.dealerId, dealerId),
  });
  const projectIds = projects.map((p) => p.id);

  const [designs, profiles, surfaces, inventoryRows, signalRows, shadeRows] = await Promise.all([
    projectIds.length
      ? db.query.savedDesigns.findMany({ where: inArray(t.savedDesigns.projectId, projectIds) })
      : Promise.resolve([]),
    projectIds.length
      ? db.query.designProfiles.findMany({ where: inArray(t.designProfiles.projectId, projectIds) })
      : Promise.resolve([]),
    projectIds.length
      ? db.query.surfaceAnalyses.findMany({ where: inArray(t.surfaceAnalyses.projectId, projectIds) })
      : Promise.resolve([]),
    db
      .select({
        productId: t.inventory.productId,
        litres: t.inventory.litres,
        reorderLevel: t.inventory.reorderLevel,
        weeklyOfftake: t.inventory.weeklyOfftake,
        leadTimeDays: t.inventory.leadTimeDays,
        sellingPerLitre: t.inventory.sellingPerLitre,
        product: t.products.name,
        brand: t.brands.name,
      })
      .from(t.inventory)
      .innerJoin(t.products, eq(t.inventory.productId, t.products.id))
      .innerJoin(t.brands, eq(t.products.brandId, t.brands.id))
      .where(eq(t.inventory.dealerId, dealerId)),
    db.query.demandSignals.findMany({ where: eq(t.demandSignals.dealerId, dealerId) }),
    db.select().from(t.shades),
  ]);

  const shadeByCode = new Map(shadeRows.map((s) => [s.code, s]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  /* ----------------------------- shade touches ---------------------------- */

  // One touch per saved design, weighted by whether the customer merely
  // shortlisted it, chose it, or went on to submit the project. `submitted` is
  // read from the project rather than the design, because submission is a
  // property of the whole project and it is the strongest signal available.
  const touches: ShadeTouch[] = [];
  const productTouchCount = new Map<string, number>();

  for (const d of designs) {
    const project = projectById.get(d.projectId);
    const scheme = d.scheme as Record<string, unknown>;
    const shades = scheme?.shades as Record<string, { code?: string }> | undefined;
    if (!shades) continue;

    const kind: ShadeTouch["kind"] =
      project?.status === "SUBMITTED" || project?.status === "QUOTED" || project?.status === "CONVERTED"
        ? "submitted"
        : d.isChosen
          ? "chosen"
          : "saved";

    // Wall and feature only. Ceiling and trim are picked by the engine, not by
    // the customer, so counting them would report the recommender's habits back
    // to the dealer as if they were customer demand.
    for (const role of ["main", "feature"] as const) {
      const code = shades[role]?.code;
      if (!code) continue;
      const s = shadeByCode.get(code);
      if (!s) continue;
      touches.push({ code: s.code, name: s.name, hex: s.hex, kind, at: d.createdAt });
    }

    const lineId = scheme?.lineId as string | undefined;
    if (lineId && now.getTime() - d.createdAt.getTime() <= TOUCH_WINDOW_DAYS * 86_400_000) {
      productTouchCount.set(lineId, (productTouchCount.get(lineId) ?? 0) + 1);
    }
  }

  const stock: StockRow[] = inventoryRows.map((r) => ({
    productId: r.productId,
    product: r.product,
    brand: r.brand,
    litres: r.litres,
    reorderLevel: r.reorderLevel,
    weeklyOfftake: r.weeklyOfftake,
    leadTimeDays: r.leadTimeDays,
    sellingPerLitre: r.sellingPerLitre,
  }));

  // Seeded signals carry `source: "demo"` and are rendered with that badge.
  // They are kept separate from the counted trends on purpose — mixing a demo
  // row into a list headed "your customer activity" is precisely the confusion
  // this whole module is built to avoid.
  const external: ExternalSignal[] = signalRows.map((s) => ({
    headline: s.headline,
    reason: s.reason,
    action: s.action,
    source: s.source,
    confidence: s.confidence,
  }));

  const radar = buildRadar({
    touches,
    stock,
    demandByProduct: productTouchCount,
    external,
    now,
    windowDays: TOUCH_WINDOW_DAYS,
  });

  /* ---------------------------- customer insights -------------------------- */

  const tally = (key: "style" | "palette" | "finish") => {
    const counts = new Map<string, number>();
    for (const p of profiles) {
      const prof = p.profile as Record<string, { value?: string } | undefined>;
      const v = prof?.[key]?.value;
      // "Not yet clear" is a real state and must not be reported as a trend.
      if (!v || v === "Not yet clear") continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    let best: { value: string; count: number } | null = null;
    for (const [value, count] of counts) {
      if (!best || count > best.count) best = { value, count };
    }
    return best;
  };

  const insights: CustomerInsights = {
    activeProjects: projects.filter((p) => p.status === "IN_PROGRESS" || p.status === "DRAFT").length,
    submittedProjects: projects.filter((p) => p.status === "SUBMITTED").length,
    awaitingQuotation: projects.filter((p) => p.status === "SUBMITTED").length,
    popularStyle: tally("style"),
    popularPalette: tally("palette"),
    popularFinish: tally("finish"),
    provisionalProfiles: profiles.filter(
      (p) => (p.profile as Record<string, unknown>)?.provisional === true,
    ).length,
    profileCount: profiles.length,
  };

  /* ----------------------------- surface alerts ---------------------------- */

  const surfaceAlerts: SurfaceAlert[] = surfaces
    .filter((s) => s.severity !== "none" && s.severity !== "light")
    .map((s) => {
      const project = projectById.get(s.projectId);
      const session = project ? sessionById.get(project.sessionId) : undefined;
      const obs = (s.observations as { label?: string; severity?: string }[]) ?? [];
      const flagged = obs.filter((o) => o.severity && o.severity !== "ok");

      return {
        projectId: s.projectId,
        sessionToken: session?.token ?? "",
        customerName: session?.customerName ?? "Customer",
        severity: s.severity,
        headline: flagged.length
          ? flagged.map((o) => o.label).slice(0, 2).join(" · ")
          : "Surface reading recorded",
        analysedAt: s.createdAt.toISOString(),
      };
    })
    .sort((a, b) => (a.severity === "significant" ? -1 : 1) - (b.severity === "significant" ? -1 : 1));

  /* --------------------------- recommended actions ------------------------- */

  // Assembled from what is actually true right now. An empty list is a valid
  // and honest outcome, and the UI renders it as "nothing needs you" rather
  // than inventing busywork to fill the panel.
  const actions: RecommendedAction[] = [];

  for (const r of radar.restock.slice(0, 2)) {
    actions.push({
      id: `restock_${r.productId}`,
      label: `Restock ${r.product}`,
      detail: r.reason,
      href: "/dashboard/inventory",
      priority: r.priority,
    });
  }

  if (insights.awaitingQuotation > 0) {
    actions.push({
      id: "quote",
      label: `Quote ${insights.awaitingQuotation} submitted ${insights.awaitingQuotation === 1 ? "design" : "designs"}`,
      detail: "These customers have finished designing and are waiting on a price.",
      href: "/dashboard/customers",
      priority: 90 + insights.awaitingQuotation,
    });
  }

  if (surfaceAlerts.length) {
    actions.push({
      id: "surface",
      label: `${surfaceAlerts.length} ${surfaceAlerts.length === 1 ? "project needs" : "projects need"} surface preparation`,
      detail:
        "Their photographs showed possible surface issues. Preparation products are part of these jobs, and they are the easiest line to lose.",
      href: "/dashboard/customers",
      priority: 70 + surfaceAlerts.length,
    });
  }

  const liveLinks = sessions.filter(
    (s) => s.status !== "EXPIRED" && s.status !== "SUBMITTED" && now < s.expiresAt,
  ).length;
  const stale = sessions.filter(
    (s) =>
      s.opens === 0 &&
      now < s.expiresAt &&
      now.getTime() - s.createdAt.getTime() > 24 * 3_600_000,
  ).length;
  if (stale > 0) {
    actions.push({
      id: "followup",
      label: `Follow up with ${stale} ${stale === 1 ? "customer" : "customers"}`,
      detail: `${stale} ${stale === 1 ? "link has" : "links have"} been out for over a day without being opened, and ${stale === 1 ? "it expires" : "they expire"} soon.`,
      href: "/dashboard/qr",
      priority: 60,
    });
  }

  /* ------------------------------ palette mix ------------------------------ */

  const paletteMix = buildPaletteMix(profiles.map((p) => p.profile as Record<string, unknown>));

  /* --------------------------- inactive customers -------------------------- */

  const INACTIVE_AFTER_HOURS = 24;
  const inactive: InactiveCustomer[] = sessions
    .filter((s) => {
      if (s.status === "SUBMITTED" || s.status === "CLOSED") return false;
      // A dead link cannot be revived by a nudge, so chasing it wastes the
      // dealer's time and the customer's patience.
      if (now >= s.expiresAt) return false;
      const last = s.lastSeenAt ?? s.createdAt;
      return now.getTime() - last.getTime() > INACTIVE_AFTER_HOURS * 3_600_000;
    })
    .map((s) => {
      const project = projects.find((p) => p.sessionId === s.id);
      const last = s.lastSeenAt ?? s.createdAt;
      const step = project?.step ?? 0;
      return {
        token: s.token,
        name: s.customerName,
        phone: s.phone,
        daysQuiet: Math.floor((now.getTime() - last.getTime()) / 86_400_000),
        stage:
          s.opens === 0
            ? "never opened the link"
            : STAGE_LABEL[Math.min(step, STAGE_LABEL.length - 1)],
        hoursLeft: Math.max(0, (s.expiresAt.getTime() - now.getTime()) / 3_600_000),
        opens: s.opens,
      };
    })
    // Closest to expiry first: that is the one where a nudge still changes
    // the outcome.
    .sort((a, b) => a.hoursLeft - b.hoursLeft)
    .slice(0, 8);

  /* ------------------------------ best sellers ----------------------------- */

  const quotes = projectIds.length
    ? await db.query.quotations.findMany({ where: eq(t.quotations.dealerId, dealerId) })
    : [];
  const bestSellers = buildBestSellers(quotes, stock);

  /* ----------------------------- shade requests ---------------------------- */

  const requestRows = await db.query.shadeRequests.findMany({
    where: and(eq(t.shadeRequests.dealerId, dealerId), eq(t.shadeRequests.status, "OPEN")),
  });

  // Grouped by colour: three customers asking for the same shade is one
  // stocking decision, not three separate notes.
  const byShade = new Map<string, ShadeRequestRow>();
  for (const r of requestRows) {
    const hit = byShade.get(r.shadeCode);
    if (hit) {
      hit.count += 1;
      continue;
    }
    byShade.set(r.shadeCode, {
      id: r.id,
      shadeCode: r.shadeCode,
      shadeName: r.shadeName,
      shadeHex: r.shadeHex,
      substituteName: r.substituteName,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      askedAt: r.createdAt.toISOString(),
      count: 1,
    });
  }
  const shadeRequests = [...byShade.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  if (shadeRequests.length) {
    const top = shadeRequests[0];
    actions.push({
      id: `shade_${top.shadeCode}`,
      label: `${top.count > 1 ? `${top.count} customers want` : "A customer wants"} ${top.shadeName}`,
      detail: `You cannot mix ${top.shadeName} today. ${top.count > 1 ? "Several customers have" : "A customer has"} asked for it by name — that is demand you can act on rather than guess at.`,
      href: "/dashboard/inventory",
      priority: 85 + top.count * 5,
    });
  }

  if (inactive.length) {
    actions.push({
      id: "inactive",
      label: `Follow up with ${inactive.length} quiet ${inactive.length === 1 ? "customer" : "customers"}`,
      detail: `${inactive.length === 1 ? "One link has" : `${inactive.length} links have`} gone quiet for a day or more and will expire soon. A WhatsApp nudge is on the Intelligence tab.`,
      href: "/dashboard/intelligence",
      priority: 65,
    });
  }

  return {
    generatedAt: now.toISOString(),
    insights: { ...insights, activeProjects: Math.max(insights.activeProjects, liveLinks) },
    radar,
    surfaceAlerts: surfaceAlerts.slice(0, 6),
    actions: actions.sort((a, b) => b.priority - a.priority).slice(0, 5),
    paletteMix,
    inactive,
    bestSellers,
    shadeRequests,
  };
}

const STAGE_LABEL = [
  "opened but not started",
  "answering the questions",
  "uploading photographs",
  "looking at their room",
  "choosing colours",
  "entering measurements",
  "on the review screen",
];

/**
 * Palette temperament across this dealer's customers.
 *
 * The families the Design DNA produces are collapsed into the four words a
 * dealer would actually use when deciding what to stock. Anything still
 * forming is counted separately and excluded from the percentages, so the
 * figures always describe customers who have genuinely settled.
 */
function buildPaletteMix(profiles: Record<string, unknown>[]): PaletteMix {
  const BUCKETS: { label: string; hex: string; match: (v: string) => boolean }[] = [
    { label: "Warm", hex: "#c9a97b", match: (v) => v.startsWith("Warm") },
    { label: "Neutral", hex: "#d8d3c8", match: (v) => v.includes("Neutral") },
    { label: "Cool", hex: "#7f8fa6", match: (v) => v.startsWith("Cool") || v.includes("Green") },
    { label: "Bold", hex: "#a9543c", match: (v) => v.includes("Bold") },
  ];

  const counts = new Map<string, number>();
  let total = 0;
  let forming = 0;

  for (const p of profiles) {
    const palette = (p?.palette as { value?: string } | undefined)?.value;
    if (!palette || palette === "Not yet clear" || p?.provisional === true) {
      forming++;
      continue;
    }
    // Bold is checked before Warm so "Warm Bold" lands in Bold — the stronger
    // signal is the one a dealer stocks against.
    const bucket =
      BUCKETS.find((b) => b.label === "Bold" && b.match(palette)) ??
      BUCKETS.find((b) => b.match(palette));
    if (!bucket) continue;
    counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1);
    total++;
  }

  return {
    total,
    forming,
    buckets: BUCKETS.map((b) => {
      const count = counts.get(b.label) ?? 0;
      return {
        label: b.label,
        hex: b.hex,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
      };
    })
      .filter((b) => b.count > 0)
      .sort((a, b) => b.pct - a.pct),
  };
}

/**
 * What is actually selling, counted from quotations this dealer sent.
 *
 * Quotations rather than saved designs: a design is an intention, a quotation
 * is a price a dealer put his name to. `thin` is the part worth acting on — a
 * line that keeps appearing on quotations while the shelf will not cover it.
 */
function buildBestSellers(
  quotes: { lines: unknown }[],
  stock: StockRow[],
): BestSeller[] {
  const agg = new Map<string, { product: string; brand: string; quotations: number; litres: number; value: number }>();

  for (const q of quotes) {
    const lines = (q.lines ?? []) as {
      productId?: string;
      product?: string;
      brand?: string;
      billedLitres?: number;
      amount?: number;
    }[];
    // Per quotation, not per line: main walls, feature wall and ceiling are
    // three lines of the same product and would treble its apparent popularity.
    const seen = new Set<string>();
    for (const l of lines) {
      if (!l.productId) continue;
      const e = agg.get(l.productId) ?? {
        product: l.product ?? l.productId,
        brand: l.brand ?? "",
        quotations: 0,
        litres: 0,
        value: 0,
      };
      if (!seen.has(l.productId)) {
        e.quotations += 1;
        seen.add(l.productId);
      }
      e.litres += l.billedLitres ?? 0;
      e.value += l.amount ?? 0;
      agg.set(l.productId, e);
    }
  }

  const stockBy = new Map(stock.map((s) => [s.productId, s]));

  return [...agg.entries()]
    .map(([productId, e]) => {
      const s = stockBy.get(productId);
      const cover = s && s.weeklyOfftake > 0 ? (s.litres / s.weeklyOfftake) * 7 : Infinity;
      const thin = Boolean(s && (s.litres < e.litres || cover <= s.leadTimeDays));

      return {
        productId,
        product: e.product,
        brand: e.brand,
        quotations: e.quotations,
        litres: Math.round(e.litres),
        value: Math.round(e.value),
        thin,
        reason: thin
          ? `On ${e.quotations} quotation${e.quotations === 1 ? "" : "s"} worth ${Math.round(e.litres)} L, and your shelf will not comfortably cover that. Worth ordering ahead.`
          : `On ${e.quotations} quotation${e.quotations === 1 ? "" : "s"} — your strongest seller by value, and stock is holding.`,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

/** Which material categories this dealer can actually supply, for the graph. */
export async function dealerMaterialCategories(dealerId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db
    .select({ slug: t.categories.slug })
    .from(t.inventory)
    .innerJoin(t.products, eq(t.inventory.productId, t.products.id))
    .innerJoin(t.categories, eq(t.products.categoryId, t.categories.id))
    .where(and(eq(t.inventory.dealerId, dealerId), gt(t.inventory.litres, 0)));

  // Catalogue slugs map onto material-graph node ids. Interior and exterior are
  // both "paint" as far as the graph is concerned — the graph reasons about
  // material kinds, and the surface is already in its context.
  const map: Record<string, string> = {
    interior: "paint",
    exterior: "paint",
    waterproofing: "waterproofing",
    primer: "primer",
    putty: "putty",
    enamel: "enamel",
  };
  return new Set(rows.map((r) => map[r.slug]).filter(Boolean));
}
