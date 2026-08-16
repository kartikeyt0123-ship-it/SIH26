"use client";

import { useMemo, useState } from "react";
import { Check, FileText, Send } from "lucide-react";
import { CategoryChip, PageHead, Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import { PROPOSALS, proposalTotal, type Proposal } from "@/lib/demo";
import { cn, inr } from "@/lib/utils";

/**
 * Customers who have already told you what they want.
 *
 * The whole point of this screen is that the specification arrives finished —
 * surfaces, quantities and finishes — so quoting is a pricing decision, not a
 * data-entry job. Discount is the only field the dealer actually has to think
 * about, so it is the only control on the page.
 */
export default function CustomersPage() {
  const [selected, setSelected] = useState(PROPOSALS[0].id);
  const [discount, setDiscount] = useState(0);
  const [sent, setSent] = useState<string[]>([]);

  const p = useMemo(() => PROPOSALS.find((x) => x.id === selected)!, [selected]);
  const subtotal = proposalTotal(p);
  const total = Math.round(subtotal * (1 - discount / 100));
  const isSent = sent.includes(p.id);

  const counts = {
    new: PROPOSALS.filter((x) => x.status === "new").length,
    quoted: PROPOSALS.filter((x) => x.status === "quoted").length,
    won: PROPOSALS.filter((x) => x.status === "won").length,
  };

  return (
    <>
      <PageHead
        eyebrow="Customers"
        title="Designs waiting to become orders."
        lede={`${counts.new} new, ${counts.quoted} quoted and not yet confirmed, ${counts.won} won this month. Each one arrived with its surfaces already specified.`}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        {/* list */}
        <Panel pad={false} className="h-fit overflow-hidden">
          <PanelHead title="Submitted designs" />
          <div className="-mt-5 divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
            {PROPOSALS.map((x) => {
              const on = x.id === selected;
              return (
                <button
                  key={x.id}
                  onClick={() => {
                    setSelected(x.id);
                    setDiscount(0);
                  }}
                  className={cn(
                    "relative flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200",
                    on ? "bg-ink-700/70" : "hover:bg-ink-700/40",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 left-0 h-8 w-[2px] -translate-y-1/2 rounded-full bg-pigment transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      on ? "scale-y-100" : "scale-y-0",
                    )}
                  />
                  <span className="flex shrink-0 gap-1">
                    {x.palette.slice(0, 4).map((c) => (
                      <span key={c} style={{ background: c }} className="h-8 w-2 rounded-sm" />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] text-paper-50">{x.customer}</span>
                    <span className="data block truncate text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                      {x.space} · {x.sqft} sq ft · {x.submitted}
                    </span>
                  </span>
                  <Tag status={x.status} />
                </button>
              );
            })}
          </div>
        </Panel>

        {/* detail */}
        <div className="flex flex-col gap-4">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="display text-[1.75rem]">{p.customer}</h2>
                  <Tag status={p.status} />
                </div>
                <p className="data mt-1.5 text-[0.6875rem] tracking-[0.1em] text-paper-400 uppercase">
                  {p.phone} · {p.locality} · {p.space} · {p.sqft} sq ft
                </p>
              </div>
              <div className="flex gap-1.5">
                {p.palette.map((c) => (
                  <span
                    key={c}
                    style={{ background: c }}
                    className="h-11 w-11 rounded-xl ring-1 ring-white/10"
                    title={c}
                  />
                ))}
              </div>
            </div>

            {p.note && (
              <p className="mt-5 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] px-4 py-3 text-[0.8125rem] text-paper-200">
                {p.note}
              </p>
            )}
          </Panel>

          <Panel>
            <PanelHead
              title="Specification"
              sub="Sent by the customer from their own room. Nothing retyped."
            />
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {p.surfaces.map((l, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_6rem_auto]">
                  <span className="data text-[0.625rem] tracking-[0.12em] text-paper-400 uppercase">
                    {l.surface}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.875rem] text-paper-100">{l.spec}</span>
                    <CategoryChip type={l.category} className="mt-1 sm:hidden" />
                  </span>
                  <span className="data hidden text-[0.75rem] text-paper-400 sm:block">{l.qty}</span>
                  <span className="data text-right text-[0.875rem] text-paper-50">{inr(l.amount)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead
              title="Quotation"
              sub="Your pricing, your margin. The customer sees the same arithmetic you do."
              right={<FileText className="h-4 w-4 text-paper-400" strokeWidth={1.6} />}
            />

            <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
              <div>
                <label className="eyebrow">Discount</label>
                <div className="mt-3 flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={0.5}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-[var(--color-pigment)]"
                  />
                  <span className="data w-16 text-right text-[1.05rem] text-paper-50">
                    {discount.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-3 text-[0.75rem] leading-relaxed text-paper-400">
                  Every line stays visible to the customer, including anything unavailable and its
                  alternative. Lines are never silently dropped.
                </p>
              </div>

              <div className="rounded-xl bg-[color-mix(in_oklab,var(--color-pigment)_9%,transparent)] p-4">
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-paper-300">Materials</span>
                  <span className="data text-paper-100">{inr(subtotal)}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-paper-300">Discount</span>
                  <span className="data text-paper-100">− {inr(subtotal - total)}</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] pt-3">
                  <span className="text-[0.8125rem] text-paper-200">Quotation total</span>
                  <span className="data text-[1.2rem] text-paper-50">{inr(total)}</span>
                </div>
                <p className="mt-2 text-[0.625rem] text-paper-400">
                  Materials only. Labour and taxes are handled in your billing system.
                </p>
              </div>
            </div>

            <button
              onClick={() => setSent((s) => (s.includes(p.id) ? s : [...s, p.id]))}
              className={cn(
                "mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.9375rem] font-medium transition-all duration-200 ease-[cubic-bezier(0.165,0.84,0.44,1)]",
                isSent
                  ? "bg-[color-mix(in_oklab,var(--color-glaze)_28%,transparent)] text-[#7fd6c9]"
                  : "bg-paper-50 text-ink-900 hover:-translate-y-px hover:bg-white",
              )}
            >
              {isSent ? (
                <>
                  <Check className="h-4 w-4" strokeWidth={2} /> Sent to {p.customer.split(" ")[0]}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" strokeWidth={1.8} /> Generate & send quotation
                </>
              )}
            </button>
          </Panel>
        </div>
      </div>
    </>
  );
}
