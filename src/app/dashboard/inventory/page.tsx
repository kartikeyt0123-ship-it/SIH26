"use client";

import { useMemo, useState } from "react";
import { CloudRain, Loader2, MapPin, Sparkles } from "lucide-react";
import { Bar, PageHead, Panel, PanelHead, Stat, Tag } from "@/components/dashboard/ui";
import { TallyImport } from "@/components/dashboard/TallyImport";
import { STATUS_RANK, useWorkspace, type Signal, type StockRow as Row } from "@/lib/workspace-client";
import { cn, inr } from "@/lib/utils";

/**
 * Inventory — this dealer's own shelf.
 *
 * Reads `/api/workspace`, which is scoped by the sign-in cookie. It previously
 * rendered a module-level constant, which meant every dealer saw the same
 * hardcoded shop's stock, and a second account could read the first one's
 * holdings and prices simply by signing in.
 */

const KIND_ICON: Record<string, typeof CloudRain> = {
  weather: CloudRain,
  trend: Sparkles,
  local: MapPin,
};

type Sort = "urgency" | "value" | "name";

export default function InventoryPage() {
  const { data, ready, error } = useWorkspace();
  const [cat, setCat] = useState<string>("All");
  const [brand, setBrand] = useState<string>("All");
  const [sort, setSort] = useState<Sort>("urgency");

  const stock = useMemo(() => data?.stock ?? [], [data]);

  // Categories and brands come from what this dealer actually holds — a filter
  // offering a category they do not stock is a dead button.
  const categories = useMemo(
    () => ["All", ...Array.from(new Set(stock.map((s) => s.category))).sort()],
    [stock],
  );
  const brands = useMemo(
    () => ["All", ...Array.from(new Set(stock.map((s) => s.brand))).sort()],
    [stock],
  );

  const rows = useMemo(() => {
    const filtered = stock.filter(
      (s) => (cat === "All" || s.category === cat) && (brand === "All" || s.brand === brand),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "urgency") {
        const d = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        return d !== 0 ? d : a.daysOfCover - b.daysOfCover;
      }
      if (sort === "value") return b.value - a.value;
      return a.product.localeCompare(b.product);
    });
  }, [stock, cat, brand, sort]);

  const tied = stock.reduce((s, i) => s + i.value, 0);
  const needsAction = stock.filter((s) => s.status === "critical" || s.status === "low");
  const critical = stock.filter((s) => s.status === "critical");
  const boost = [...needsAction].sort((a, b) => a.daysOfCover - b.daysOfCover).slice(0, 4);

  return (
    <>
      <PageHead
        eyebrow="Inventory"
        title="What you hold, and what to boost."
        lede="Cover is measured in days at your own rate of sale, then read against supplier lead time. A number that is only a quantity tells you nothing about whether you will run out."
      />

      {!ready && (
        <Panel>
          <p className="flex items-center gap-2 text-[0.875rem] text-paper-300">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> Loading your shelf…
          </p>
        </Panel>
      )}

      {ready && error && (
        <Panel>
          <p className="text-[0.9375rem] text-paper-50">{error}</p>
        </Panel>
      )}

      {ready && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Panel>
              <Stat
                label="Stock value"
                value={inr(tied)}
                note={`across ${categories.length - 1} categories`}
              />
            </Panel>
            <Panel>
              <Stat
                label="Lines below reorder"
                value={String(needsAction.length)}
                note={`of ${stock.length} tracked`}
                tone={needsAction.length ? "down" : "neutral"}
              />
            </Panel>
            <Panel>
              <Stat
                label="Inside lead time"
                value={String(critical.length)}
                note="will run out before a reorder lands"
                tone={critical.length ? "down" : "neutral"}
              />
            </Panel>
            <Panel>
              <Stat
                label="Overstocked"
                value={String(stock.filter((s) => s.status === "overstocked").length)}
                note="capital sitting still"
              />
            </Panel>
          </div>

          <TallyImport onDone={() => window.location.reload()} />

          {/* ---------------- boost suggestions ---------------- */}
          <Panel className="mt-4">
            <PanelHead
              title="Boost these first"
              sub="Suggested order covers the supplier lead time plus two weeks of demand, less what you hold."
            />
            {boost.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-5 py-8 text-center text-[0.8125rem] text-paper-400">
                Every line has cover. Nothing needs ordering today.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {boost.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-2">
                          <span
                            style={{ background: s.hex }}
                            className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
                            aria-hidden="true"
                          />
                          <span className="text-[0.8125rem] text-paper-200">{s.category}</span>
                        </span>
                        <p className="mt-2 truncate text-[0.9375rem] text-paper-50">{s.product}</p>
                        <p className="data text-[0.6875rem] text-paper-400">{s.brand}</p>
                      </div>
                      <Tag status={s.status === "critical" ? "critical" : "low"}>
                        {s.daysOfCover > 900 ? "no offtake" : `${s.daysOfCover} d cover`}
                      </Tag>
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-3 text-[0.75rem]">
                      <div>
                        <dt className="text-paper-400">In stock</dt>
                        <dd className="data mt-0.5 text-paper-100">{s.litres} L</dd>
                      </div>
                      <div>
                        <dt className="text-paper-400">Weekly</dt>
                        <dd className="data mt-0.5 text-paper-100">{s.weeklyOfftake} L</dd>
                      </div>
                      <div>
                        <dt className="text-paper-400">Lead time</dt>
                        <dd className="data mt-0.5 text-paper-100">{s.leadTimeDays} d</dd>
                      </div>
                    </dl>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[color-mix(in_oklab,var(--color-pigment)_10%,transparent)] px-3 py-2.5">
                      <span className="eyebrow">Order</span>
                      <span className="data text-[1.05rem] text-paper-50">{s.suggestedOrder} L</span>
                      <span className="data text-[0.6875rem] text-paper-400">
                        ≈ {inr(s.suggestedOrder * s.sellingPerLitre)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ---------------- signals ---------------- */}
          {data.signals.length > 0 && (
            <Panel className="mt-4">
              <PanelHead
                title="Why these, and what is coming"
                sub="Weather, seasonal and local-taste signals, each with the evidence behind it."
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {data.signals.map((sig) => (
                  <SignalCard key={sig.id} sig={sig} />
                ))}
              </div>
            </Panel>
          )}

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
                    <option key={b} value={b}>
                      {b === "All" ? "All brands" : b}
                    </option>
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
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[0.75rem] transition-colors duration-200",
                    cat === c
                      ? "border-transparent bg-paper-50 text-ink-900"
                      : "border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] text-paper-300 hover:text-paper-50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {rows.map((s) => (
                <StockLine key={s.id} s={s} />
              ))}
              {rows.length === 0 && (
                <p className="p-6 text-[0.875rem] text-paper-400">Nothing in this filter.</p>
              )}
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function SignalCard({ sig }: { sig: Signal }) {
  const Icon = KIND_ICON[sig.kind] ?? Sparkles;
  return (
    <div className="flex gap-4 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4">
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
          {/* The source badge is not decoration. A seeded signal must never be
              mistaken for one counted from this dealer's own activity. */}
          <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.12em] text-paper-400 uppercase">
            {sig.source}
          </span>
        </div>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-200">{sig.action}</p>
        <p className="mt-2 text-[0.75rem] leading-relaxed text-paper-400">
          <span className="text-paper-300">Because:</span> {sig.reason}
        </p>
      </div>
    </div>
  );
}

function StockLine({ s }: { s: Row }) {
  const pct = Math.min(100, (s.litres / Math.max(s.reorderLevel * 2, 1)) * 100);
  const tone = s.status === "critical" ? "critical" : s.status === "low" ? "low" : "healthy";

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
          {s.brand} · {s.category} · ₹{s.sellingPerLitre}/L
        </p>
      </div>

      <div className="col-span-3 sm:col-span-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="data text-[0.75rem] text-paper-200">{s.litres} L</span>
          <span className="data text-[0.625rem] text-paper-400">reorder at {s.reorderLevel}</span>
        </div>
        <Bar pct={pct} tone={tone} className="mt-1.5" />
      </div>

      <span className="data hidden text-right text-[0.75rem] text-paper-300 sm:block">
        {s.daysOfCover > 900 ? "—" : `${s.daysOfCover} d`}
      </span>

      <Tag status={s.status}>{s.status === "critical" ? "act now" : s.status}</Tag>
    </div>
  );
}
