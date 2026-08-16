import { CategoryChip, PageHead, Panel, PanelHead, Stat } from "@/components/dashboard/ui";
import { BEST_SELLERS, DEALS, MONTH, REVENUE_BY_WEEK } from "@/lib/demo";
import { inr } from "@/lib/utils";

/**
 * Performance is the renewal conversation.
 *
 * Every figure on this page has to trace to an event the dealer can point at —
 * a quotation, a dispatch, a closed deal. No modelled numbers, no projections,
 * because the first fabricated figure here poisons everything else on screen.
 */
export default function PerformancePage() {
  const max = Math.max(...REVENUE_BY_WEEK.map((r) => r.value));
  const maxRev = Math.max(...BEST_SELLERS.map((b) => b.revenue));

  return (
    <>
      <PageHead
        eyebrow="Performance"
        title="What closed, and what is carrying it."
        lede="Computed from platform events only. If a number is here, there is a quotation or a dispatch behind it."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <Stat label="Revenue this month" value={inr(MONTH.revenue)} note={`+${MONTH.revenueDeltaPct}% on last month`} tone="up" />
        </Panel>
        <Panel>
          <Stat label="Deals closed" value={String(MONTH.deals)} note={`of ${MONTH.quotations} quotations sent`} />
        </Panel>
        <Panel>
          <Stat label="Average basket" value={inr(MONTH.avgBasket)} note="single-category average was lower" tone="up" />
        </Panel>
        <Panel>
          <Stat label="Multi-category deals" value={`${Math.round(MONTH.multiCategoryShare * 100)}%`} note="more than one material per order" tone="up" />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel>
          <PanelHead
            title="Revenue by week"
            sub="Last eight weeks, from confirmed orders."
          />
          <div className="flex h-56 items-end gap-2 sm:gap-3">
            {REVENUE_BY_WEEK.map((r, i) => (
              <div key={r.week} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="data text-[0.5625rem] text-paper-400">
                  {Math.round(r.value / 1000)}k
                </span>
                <span
                  style={{ height: `${(r.value / max) * 100}%` }}
                  className={`w-full rounded-t-md ${
                    i >= REVENUE_BY_WEEK.length - 2 ? "bg-pigment" : "bg-paper-400/30"
                  }`}
                />
                <span className="data text-[0.5625rem] tracking-[0.08em] text-paper-400 uppercase">
                  {r.week}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Best selling" sub="By revenue contribution this month." />
          <div className="flex flex-col gap-4">
            {BEST_SELLERS.map((b) => (
              <div key={b.product}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[0.875rem] text-paper-100">{b.product}</span>
                  <span className="data shrink-0 text-[0.8125rem] text-paper-50">{inr(b.revenue)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                    <span
                      style={{ width: `${(b.revenue / maxRev) * 100}%` }}
                      className="block h-full rounded-full bg-[#5fbfb3]"
                    />
                  </span>
                  <span className="data shrink-0 text-[0.625rem] text-paper-400">{b.units}</span>
                </div>
                <CategoryChip type={b.type} className="mt-2" />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="mt-4" pad={false}>
        <div className="p-5 sm:p-6">
          <PanelHead
            title="Recent deals"
            sub="Closed orders, with the categories each one pulled in."
          />
        </div>
        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          {DEALS.map((d) => (
            <div
              key={d.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-700/40 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_7rem] sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] text-paper-50">{d.customer}</p>
                <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                  closed {d.closed}
                </p>
              </div>
              <div className="col-span-2 flex flex-wrap gap-3 sm:col-span-1">
                {d.categories.map((c) => (
                  <CategoryChip key={c} type={c} showLabel={false} />
                ))}
                <span className="data text-[0.6875rem] text-paper-400">
                  {d.categories.length} categories
                </span>
              </div>
              <span className="data hidden text-[0.75rem] text-paper-300 sm:block">
                {Math.round(d.margin * 100)}% margin
              </span>
              <span className="data text-right text-[0.9375rem] text-paper-50">{inr(d.value)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
