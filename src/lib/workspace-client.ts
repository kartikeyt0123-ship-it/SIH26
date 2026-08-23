"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The signed-in dealer's stock and trading figures.
 *
 * A hook rather than a prop drilled from a server component, because the pages
 * that need it are already client components (they filter, sort and poll). It
 * caches nothing across dealers on purpose: the response is scoped by cookie,
 * so signing out and back in as someone else re-fetches rather than showing the
 * previous dealer's shelf for a frame.
 */

export type StockRow = {
  id: string;
  productId: string;
  product: string;
  brand: string;
  category: string;
  categorySlug: string;
  hex: string;
  litres: number;
  reorderLevel: number;
  weeklyOfftake: number;
  leadTimeDays: number;
  sellingPerLitre: number;
  daysOfCover: number;
  status: "critical" | "low" | "healthy" | "overstocked";
  suggestedOrder: number;
  value: number;
};

export type Performance = {
  month: {
    revenue: number;
    revenueDeltaPct: number | null;
    deals: number;
    quotations: number;
    avgBasket: number;
    multiCategoryShare: number;
  };
  revenueByWeek: { week: string; value: number }[];
  bestSellers: { product: string; brand: string; category: string; hex: string; litres: number; revenue: number }[];
  deals: { id: string; customer: string; closed: string; categories: string[]; value: number }[];
  empty: boolean;
};

export type Signal = {
  id: string;
  kind: string;
  headline: string;
  reason: string;
  action: string;
  categories: string[];
  confidence: string;
  source: string;
};

export type Workspace = {
  stock: StockRow[];
  performance: Performance;
  signals: Signal[];
};

export function useWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace", { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load your shop (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, ready, error, reload: load };
}

export const STATUS_RANK: Record<StockRow["status"], number> = {
  critical: 0,
  low: 1,
  healthy: 2,
  overstocked: 3,
};
