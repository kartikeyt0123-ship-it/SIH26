/**
 * The dealer's own stock and trading figures.
 *
 * WHY THIS EXISTS: Inventory and Performance used to render module-level
 * constants — one hardcoded shop's stock, revenue and closed deals — which
 * meant every dealer who signed in saw Sharma Interiors' numbers and customer
 * names on their own console. This reads the same figures from that dealer's
 * rows instead, so the pages become tenant-correct by construction rather than
 * by remembering to filter.
 *
 * EVERY FIGURE TRACES TO AN EVENT. Revenue comes from `sales`, best sellers
 * from quotation lines, cover from this dealer's own offtake. Nothing here is
 * modelled or projected, because the first invented number on a Performance
 * page makes every other number on it unverifiable.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";

/* --------------------------------- stock ---------------------------------- */

export type StockRow = {
  id: string;
  productId: string;
  product: string;
  brand: string;
  /** Catalogue category name, e.g. "Interior emulsion". */
  category: string;
  categorySlug: string;
  hex: string;
  litres: number;
  reorderLevel: number;
  weeklyOfftake: number;
  leadTimeDays: number;
  sellingPerLitre: number;
  /** Days of cover at this dealer's own rate of sale. */
  daysOfCover: number;
  status: "critical" | "low" | "healthy" | "overstocked";
  /** Litres worth ordering now, 0 when nothing is needed. */
  suggestedOrder: number;
  value: number;
};

/** A swatch per category, so stock reads as material rather than as a table. */
const CATEGORY_HEX: Record<string, string> = {
  interior: "#e7dbc4",
  exterior: "#c96f4a",
  waterproofing: "#5fa8a0",
  primer: "#cfd3c4",
  putty: "#efeae0",
  enamel: "#c79a45",
};

function statusOf(litres: number, reorder: number, cover: number, lead: number): StockRow["status"] {
  // Cover against lead time first: running out before a reorder can land is a
  // different and more urgent fact than sitting below a reorder line.
  if (cover <= lead) return "critical";
  if (litres <= reorder || cover <= lead * 2) return "low";
  if (cover > 120) return "overstocked";
  return "healthy";
}

export async function dealerStock(dealerId: string): Promise<StockRow[]> {
  const db = await getDb();

  const rows = await db
    .select({
      id: t.inventory.id,
      productId: t.inventory.productId,
      litres: t.inventory.litres,
      reorderLevel: t.inventory.reorderLevel,
      weeklyOfftake: t.inventory.weeklyOfftake,
      leadTimeDays: t.inventory.leadTimeDays,
      sellingPerLitre: t.inventory.sellingPerLitre,
      product: t.products.name,
      brand: t.brands.name,
      category: t.categories.name,
      categorySlug: t.categories.slug,
    })
    .from(t.inventory)
    .innerJoin(t.products, eq(t.inventory.productId, t.products.id))
    .innerJoin(t.brands, eq(t.products.brandId, t.brands.id))
    .innerJoin(t.categories, eq(t.products.categoryId, t.categories.id))
    .where(eq(t.inventory.dealerId, dealerId));

  return rows.map((r) => {
    const cover = r.weeklyOfftake > 0 ? Math.round((r.litres / r.weeklyOfftake) * 7) : 999;
    const status = statusOf(r.litres, r.reorderLevel, cover, r.leadTimeDays);
    // Enough to cover the lead time plus a fortnight, rounded to a 20 L pack —
    // which is how paint is actually bought.
    const target = r.weeklyOfftake * ((r.leadTimeDays + 14) / 7);
    const need = status === "healthy" || status === "overstocked"
      ? 0
      : Math.max(20, Math.ceil((target - r.litres) / 20) * 20);

    return {
      ...r,
      hex: CATEGORY_HEX[r.categorySlug] ?? "#b3aa9b",
      daysOfCover: cover,
      status,
      suggestedOrder: need,
      value: Math.round(r.litres * r.sellingPerLitre),
    };
  });
}

/* ------------------------------- performance ------------------------------ */

export type Performance = {
  month: {
    revenue: number;
    revenueDeltaPct: number | null;
    deals: number;
    quotations: number;
    avgBasket: number;
    /** Share of quotations carrying more than one product category. */
    multiCategoryShare: number;
  };
  revenueByWeek: { week: string; value: number }[];
  bestSellers: { product: string; brand: string; category: string; hex: string; litres: number; revenue: number }[];
  deals: { id: string; customer: string; closed: string; categories: string[]; value: number }[];
  /** True when this dealer has genuinely traded nothing yet. */
  empty: boolean;
};

const WEEK = 7 * 86_400_000;

export async function dealerPerformance(dealerId: string): Promise<Performance> {
  const db = await getDb();
  const now = new Date();

  const [sales, quotes, products] = await Promise.all([
    db.query.sales.findMany({
      where: eq(t.sales.dealerId, dealerId),
      orderBy: desc(t.sales.soldAt),
    }),
    db.query.quotations.findMany({
      where: eq(t.quotations.dealerId, dealerId),
      orderBy: desc(t.quotations.createdAt),
    }),
    db
      .select({
        id: t.products.id,
        name: t.products.name,
        brand: t.brands.name,
        category: t.categories.name,
        slug: t.categories.slug,
      })
      .from(t.products)
      .innerJoin(t.brands, eq(t.products.brandId, t.brands.id))
      .innerJoin(t.categories, eq(t.products.categoryId, t.categories.id)),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const sessions = await db.query.customerSessions.findMany({
    where: eq(t.customerSessions.dealerId, dealerId),
  });
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  /* ------------------------------ this month ----------------------------- */
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const inMonth = sales.filter((s) => s.soldAt >= monthStart);
  const inPrev = sales.filter((s) => s.soldAt >= prevStart && s.soldAt < monthStart);

  const revenue = inMonth.reduce((s, x) => s + x.amount, 0);
  const prevRevenue = inPrev.reduce((s, x) => s + x.amount, 0);

  const monthQuotes = quotes.filter((q) => q.createdAt >= monthStart);
  const multi = monthQuotes.filter((q) => {
    const lines = (q.lines ?? []) as { productId?: string }[];
    const cats = new Set(
      lines.map((l) => (l.productId ? productById.get(l.productId)?.slug : undefined)).filter(Boolean),
    );
    return cats.size > 1;
  }).length;

  /* ---------------------------- revenue by week --------------------------- */
  // Eight buckets ending this week. Weeks with no trade show as zero rather
  // than being dropped, so the shape of a quiet fortnight stays visible.
  const revenueByWeek: { week: string; value: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const end = now.getTime() - i * WEEK;
    const start = end - WEEK;
    const value = sales
      .filter((s) => s.soldAt.getTime() > start && s.soldAt.getTime() <= end)
      .reduce((s, x) => s + x.amount, 0);
    revenueByWeek.push({
      week: new Date(end).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      value,
    });
  }

  /* ----------------------------- best sellers ----------------------------- */
  const agg = new Map<string, { litres: number; revenue: number }>();
  for (const q of quotes) {
    const lines = (q.lines ?? []) as { productId?: string; billedLitres?: number; amount?: number }[];
    for (const l of lines) {
      if (!l.productId) continue;
      const e = agg.get(l.productId) ?? { litres: 0, revenue: 0 };
      e.litres += l.billedLitres ?? 0;
      e.revenue += l.amount ?? 0;
      agg.set(l.productId, e);
    }
  }

  const bestSellers = [...agg.entries()]
    .map(([id, e]) => {
      const p = productById.get(id);
      return {
        product: p?.name ?? id,
        brand: p?.brand ?? "",
        category: p?.category ?? "",
        hex: CATEGORY_HEX[p?.slug ?? ""] ?? "#b3aa9b",
        litres: Math.round(e.litres),
        revenue: Math.round(e.revenue),
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  /* -------------------------------- deals --------------------------------- */
  const deals = sales.slice(0, 8).map((s) => {
    const quote = quotes.find((q) => q.id === s.quotationId);
    const session = quote ? sessionById.get(quote.sessionId) : undefined;
    const lines = (quote?.lines ?? []) as { productId?: string }[];
    const categories = [
      ...new Set(
        lines
          .map((l) => (l.productId ? productById.get(l.productId)?.category : undefined))
          .filter((c): c is string => Boolean(c)),
      ),
    ];
    return {
      id: s.id,
      customer: session?.customerName ?? "Counter sale",
      closed: s.soldAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      categories,
      value: s.amount,
    };
  });

  return {
    month: {
      revenue,
      // Null rather than zero when there is no previous month to compare
      // against — "+0%" is a claim, and an absent comparison is not.
      revenueDeltaPct:
        prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null,
      deals: inMonth.length,
      quotations: monthQuotes.length,
      avgBasket: inMonth.length ? Math.round(revenue / inMonth.length) : 0,
      multiCategoryShare: monthQuotes.length ? multi / monthQuotes.length : 0,
    },
    revenueByWeek,
    bestSellers,
    deals,
    empty: sales.length === 0 && quotes.length === 0,
  };
}
