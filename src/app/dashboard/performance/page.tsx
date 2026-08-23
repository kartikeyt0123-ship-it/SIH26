"use client";

import { Loader2 } from "lucide-react";
import { PageHead, Panel, PanelHead, Stat } from "@/components/dashboard/ui";
import { useWorkspace } from "@/lib/workspace-client";
import { inr } from "@/lib/utils";

/**
 * Performance is the renewal conversation.
 *
 * Every figure here traces to an event this dealer's own account produced — a
 * quotation, a recorded sale. No modelled numbers and no projections, because
 * the first fabricated figure poisons everything else on the screen.
 *
 * It used to render shared constants, so two dealers saw identical revenue and
 * the same closed deals under different shop names. Now it reads
 * `/api/workspace`, which is scoped by the sign-in cookie.
 */
export default function PerformancePage() {
  const { data, ready, error } = useWorkspace();

  return (
    <>
      <PageHead
        eyebrow="Performance"
        title="What closed, and what is carrying it."
        lede="Computed from your own platform events only. If a number is here, there is a quotation or a sale behind it."
      />

      {!ready && (
        <Panel>
          <p className="flex items-center gap-2 text-[0.875rem] text-paper-300">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.7} /> Loading your figures…
          </p>
        </Panel>
      )}

      {ready && error && (
        <Panel>
          <p className="text-[0.9375rem] text-paper-50">{error}</p>
        </Panel>
      )}

      {ready && data && <Body perf={data.performance} />}
    </>
  );
}

function Body({ perf }: { perf: NonNullable<ReturnType<typeof useWorkspace>["data"]>["performance"] }) {
  const { month, revenueByWeek, bestSellers, deals } = perf;

  if (perf.empty) {
    return (
      <Panel>
        <p className="text-[0.9375rem] text-paper-50">Nothing has closed yet.</p>
        <p className="mt-2 max-w-lg text-[0.8125rem] leading-relaxed text-paper-400">
          This page fills in from your own quotations and sales. Send a quotation from the Customers
          tab and it will start showing here — we would rather leave it blank than put a number on
          it that did not happen.
        </p>
      </Panel>
    );
  }

  const max = Math.max(1, ...revenueByWeek.map((r) => r.value));
  const maxRev = Math.max(1, ...bestSellers.map((b) => b.revenue));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <Stat
            label="Revenue this month"
            value={inr(month.revenue)}
            // Null when there is no previous month to compare against. "+0%"
            // would be a claim about a comparison that was never made.
            note={
              month.revenueDeltaPct === null
                ? "no previous month to compare"
                : `${month.revenueDeltaPct >= 0 ? "+" : ""}${month.revenueDeltaPct}% on last month`
            }
            tone={month.revenueDeltaPct !== null && month.revenueDeltaPct >= 0 ? "up" : "neutral"}
          />
        </Panel>
        <Panel>
          <Stat
            label="Deals closed"
            value={String(month.deals)}
            note={`of ${month.quotations} quotations sent`}
          />
        </Panel>
        <Panel>
          <Stat label="Average basket" value={inr(month.avgBasket)} note="per closed deal" />
        </Panel>
        <Panel>
          <Stat
            label="Multi-category quotes"
            value={`${Math.round(month.multiCategoryShare * 100)}%`}
            note="more than one material per quotation"
            tone={month.multiCategoryShare > 0.5 ? "up" : "neutral"}
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel>
          <PanelHead title="Revenue by week" sub="Last eight weeks, from recorded sales." />
          <div className="flex h-56 items-end gap-2 sm:gap-3">
            {revenueByWeek.map((r, i) => (
              <div key={r.week} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="data text-[0.5625rem] text-paper-400">
                  {r.value > 0 ? `${Math.round(r.value / 1000)}k` : "—"}
                </span>
                <span
                  // A quiet week keeps a visible sliver rather than vanishing,
                  // so the gap in trading is legible instead of invisible.
                  style={{ height: `${Math.max(r.value > 0 ? 4 : 1.5, (r.value / max) * 100)}%` }}
                  className={`w-full rounded-t-md ${
                    i >= revenueByWeek.length - 2 ? "bg-pigment" : "bg-paper-400/30"
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
          <PanelHead title="Best selling" sub="By value across the quotations you have sent." />
          {bestSellers.length === 0 ? (
            <p className="text-[0.8125rem] text-paper-400">No quotations yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {bestSellers.map((b) => (
                <div key={b.product}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[0.875rem] text-paper-100">
                      {b.product}
                    </span>
                    <span className="data shrink-0 text-[0.8125rem] text-paper-50">
                      {inr(b.revenue)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                      <span
                        style={{ width: `${(b.revenue / maxRev) * 100}%` }}
                        className="block h-full rounded-full bg-[#5fbfb3]"
                      />
                    </span>
                    <span className="data shrink-0 text-[0.625rem] text-paper-400">{b.litres} L</span>
                  </div>
                  <span className="mt-2 inline-flex items-center gap-2">
                    <span
                      style={{ background: b.hex }}
                      className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
                      aria-hidden="true"
                    />
                    <span className="text-[0.8125rem] text-paper-200">{b.category}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" pad={false}>
        <div className="p-5 sm:p-6">
          <PanelHead title="Recent deals" sub="Closed orders, with the categories each one pulled in." />
        </div>
        {deals.length === 0 ? (
          <p className="px-5 pb-6 text-[0.8125rem] text-paper-400 sm:px-6">
            No sales recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
            {deals.map((d) => (
              <div
                key={d.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-700/40 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem] sm:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] text-paper-50">{d.customer}</p>
                  <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                    closed {d.closed}
                  </p>
                </div>
                <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1">
                  {d.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-2 py-0.5 text-[0.6875rem] text-paper-300"
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <span className="data text-right text-[0.9375rem] text-paper-50">{inr(d.value)}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
