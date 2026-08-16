"use client";

import { useMemo, useState } from "react";
import { CloudRain, Sparkles, MapPin } from "lucide-react";
import { Bar, CategoryChip, PageHead, Panel, PanelHead, Stat, Tag } from "@/components/dashboard/ui";
import { TallyImport } from "@/components/dashboard/TallyImport";
import {
  MATERIAL_TYPES,
  SIGNALS,
  STOCK,
  daysOfCover,
  stockStatus,
  suggestedOrder,
  type MaterialType,
  type StockItem,
} from "@/lib/demo";
import { cn, inr } from "@/lib/utils";

const KIND_ICON = { weather: CloudRain, trend: Sparkles, local: MapPin };

type Sort = "urgency" | "value" | "name";

export default function InventoryPage() {
  const [cat, setCat] = useState<MaterialType | "All">("All");
  const [brand, setBrand] = useState<string | "All">("All");
  const [sort, setSort] = useState<Sort>("urgency");

  const brands = useMemo(
    () => ["All", ...Array.from(new Set(STOCK.map((s) => s.brand))).sort()],
    [],
  );

  const rows = useMemo(() => {
    const filtered = STOCK.filter(
      (s) => (cat === "All" || s.type === cat) && (brand === "All" || s.brand === brand),
    );
    const rank = { critical: 0, low: 1, healthy: 2, overstocked: 3 };
    return filtered.sort((a, b) => {
      if (sort === "urgency") {
        const d = rank[stockStatus(a)] - rank[stockStatus(b)];
        return d !== 0 ? d : daysOfCover(a) - daysOfCover(b);
      }
      if (sort === "value") return b.qty * b.unitPrice - a.qty * a.unitPrice;
      return a.product.localeCompare(b.product);
    });
  }, [cat, brand, sort]);

  const tied = STOCK.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const needsAction = STOCK.filter((s) => stockStatus(s) !== "healthy" && stockStatus(s) !== "overstocked");
  const boost = [...needsAction].sort((a, b) => daysOfCover(a) - daysOfCover(b)).slice(0, 4);

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="What you hold, and what to boost."
        lede="Cover is measured in days at your own rate of sale, then read against supplier lead time. A number that is only a quantity tells you nothing about whether you will run out."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Stock value" value={inr(tied)} note="across 7 categories" /></Panel>
        <Panel><Stat label="Lines below reorder" value={String(needsAction.length)} note="of 18 tracked" tone="down" /></Panel>
        <Panel><Stat label="Blocking shortages" value="1" note="yellow oxide colorant" tone="down" /></Panel>
        <Panel><Stat label="Overstocked" value={String(STOCK.filter((s) => stockStatus(s) === "overstocked").length)} note="capital sitting still" /></Panel>
      </div>

      {/* ---------------- Tally import ---------------- */}
      <TallyImport onDone={() => window.location.reload()} />

      {/* ---------------- boost suggestions ---------------- */}
      <Panel className="mt-4">
        <PanelHead
          title="Boost these first"
          sub="Suggested order covers the supplier lead time plus two weeks of demand, less what you hold. Override anything — we learn from the override."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {boost.map((s) => {
            const cover = daysOfCover(s);
            const status = stockStatus(s);
            return (
              <div
                key={s.id}
                className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CategoryChip type={s.type} />
                    <p className="mt-2 truncate text-[0.9375rem] text-paper-50">{s.product}</p>
                    <p className="data text-[0.6875rem] text-paper-400">
                      {s.brand} · {s.variant}
                    </p>
                  </div>
                  <Tag status={status === "critical" ? "critical" : "low"}>
                    {cover} d cover
                  </Tag>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-[0.75rem]">
                  <div>
                    <dt className="text-paper-400">In stock</dt>
                    <dd className="data mt-0.5 text-paper-100">{s.qty} {s.unit}</dd>
                  </div>
                  <div>
                    <dt className="text-paper-400">Weekly</dt>
                    <dd className="data mt-0.5 text-paper-100">{s.weeklyOfftake} {s.unit}</dd>
                  </div>
                  <div>
                    <dt className="text-paper-400">Lead time</dt>
                    <dd className="data mt-0.5 text-paper-100">{s.leadTimeDays} d</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[color-mix(in_oklab,var(--color-pigment)_10%,transparent)] px-3 py-2.5">
                  <span className="eyebrow">Order</span>
                  <span className="data text-[1.05rem] text-paper-50">
                    {suggestedOrder(s)} {s.unit}
                  </span>
                  <span className="data text-[0.6875rem] text-paper-400">
                    ≈ {inr(suggestedOrder(s) * s.unitPrice)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ---------------- signals ---------------- */}
      <Panel className="mt-4">
        <PanelHead
          title="Why these, and what is coming"
          sub="Weather, seasonal and local-taste signals, each with the evidence behind it."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {SIGNALS.map((sig) => {
            const Icon = KIND_ICON[sig.kind];
            return (
              <div
                key={sig.id}
                className="flex gap-4 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    sig.kind === "weather"
                      ? "bg-[color-mix(in_oklab,var(--color-indigo)_22%,transparent)] text-[#93a5e8]"
                      : sig.kind === "trend"
                        ? "bg-[color-mix(in_oklab,var(--color-pigment)_16%,transparent)] text-pigment-soft"
                        : "bg-[color-mix(in_oklab,var(--color-glaze)_18%,transparent)] text-[#5fbfb3]",
                  )}
                >
                  <Icon className="h-[1.05rem] w-[1.05rem]" strokeWidth={1.6} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[0.9375rem] text-paper-50">{sig.headline}</p>
                    <span className="data text-[0.5625rem] tracking-[0.14em] text-paper-400 uppercase">
                      {sig.confidence}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-200">{sig.action}</p>
                  <p className="mt-2 text-[0.75rem] leading-relaxed text-paper-400">
                    <span className="text-paper-300">Because:</span> {sig.reason}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {sig.categories.map((c) => (
                      <CategoryChip key={c} type={c} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ---------------- full stock ---------------- */}
      <Panel className="mt-4" pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <h2 className="text-[0.9375rem] text-paper-50">All stock</h2>
            <p className="mt-1 text-[0.8125rem] text-paper-400">
              {rows.length} lines · filtered by category and brand
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-ink-800 px-3 py-1.5 text-[0.6875rem] text-paper-200 outline-none"
            >
              {brands.map((b) => (
                <option key={b} value={b}>{b === "All" ? "All brands" : b}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-ink-800 px-3 py-1.5 text-[0.6875rem] text-paper-200 outline-none"
            >
              <option value="urgency">Sort: urgency</option>
              <option value="value">Sort: stock value</option>
              <option value="name">Sort: name</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-y border-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)] px-5 py-3 sm:px-6">
          {(["All", ...MATERIAL_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setCat(t as MaterialType | "All")}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[0.75rem] transition-colors duration-200",
                cat === t
                  ? "border-transparent bg-paper-50 text-ink-900"
                  : "border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] text-paper-300 hover:text-paper-50",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          {rows.map((s) => (
            <StockRow key={s.id} s={s} />
          ))}
          {rows.length === 0 && (
            <p className="p-6 text-[0.875rem] text-paper-400">Nothing in this filter.</p>
          )}
        </div>
      </Panel>
    </>
  );
}

function StockRow({ s }: { s: StockItem }) {
  const status = stockStatus(s);
  const cover = daysOfCover(s);
  const pct = Math.min(100, (s.qty / Math.max(s.reorderLevel * 2, 1)) * 100);
  const tone = status === "critical" ? "critical" : status === "low" ? "low" : "healthy";

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-700/40 sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_auto_auto] sm:px-6">
      <span
        aria-hidden="true"
        style={{ background: s.hex }}
        className="h-9 w-9 rounded-lg ring-1 ring-white/10"
      />

      <div className="min-w-0">
        <p className="truncate text-[0.875rem] text-paper-50">{s.product}</p>
        <p className="data mt-0.5 truncate text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
          {s.brand} · {s.variant} · {s.type}
        </p>
      </div>

      <div className="col-span-3 sm:col-span-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="data text-[0.75rem] text-paper-200">
            {s.qty} {s.unit}
          </span>
          <span className="data text-[0.625rem] text-paper-400">
            reorder at {s.reorderLevel}
          </span>
        </div>
        <Bar pct={pct} tone={tone} className="mt-1.5" />
      </div>

      <span className="data hidden text-right text-[0.75rem] text-paper-300 sm:block">
        {cover > 900 ? "—" : `${cover} d`}
      </span>

      <Tag status={status}>
        {status === "critical" ? "act now" : status}
      </Tag>
    </div>
  );
}
