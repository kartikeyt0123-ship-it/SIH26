"use client";

import { Reveal } from "@/components/scroll/Reveal";
import { Button } from "@/components/ui/Button";
import { Pill, Rule, Section, SectionHead } from "@/components/ui/Primitives";
import { cn, inr } from "@/lib/utils";

const METER = [
  { label: "Whole-room baskets", value: "34 / 41", note: "jobs that took more than one category" },
  { label: "Uplift from multi-surface", value: inr(118000), note: "over single-item averages" },
  { label: "Quotations converted", value: "23 / 39", note: "59% · up from 44% last month" },
  { label: "Stockouts avoided", value: "4", note: "shortage alerts acted on" },
];

const TREND = [
  { week: "W22", v: 42 }, { week: "W23", v: 47 }, { week: "W24", v: 51 },
  { week: "W25", v: 44 }, { week: "W26", v: 63 }, { week: "W27", v: 71 },
  { week: "W28", v: 68 }, { week: "W29", v: 84 }, { week: "W30", v: 92 },
];

export function DealerConsole() {
  return (
    <Section id="dealer" className="plaster grain">
      <SectionHead
        eyebrow="Dealer intelligence"
        title={
          <>
            A dashboard that answers
            <br />
            “what should I do?”
          </>
        }
        lede="Not another screen that reports what already happened. Signals a dealer can act on this week — with the arithmetic shown, because a recommendation he cannot check is a recommendation he will not follow."
      />

      <Reveal className="mt-8" delay={40}>
        <Button href="/dashboard" variant="ghost">
          Open the live demo dashboard
        </Button>
      </Reveal>

      {/* value meter */}
      <Reveal className="mt-10" delay={60}>
        <div className="grid gap-px overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] bg-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] sm:grid-cols-2 lg:grid-cols-4">
          {METER.map((m) => (
            <div key={m.label} className="group bg-ink-900 p-6 transition-colors duration-300 hover:bg-ink-800">
              <p className="eyebrow">{m.label}</p>
              <p className="data mt-3 text-[clamp(1.5rem,2.4vw,2rem)] text-paper-50">{m.value}</p>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-paper-400">{m.note}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* reorder with visible arithmetic */}
        <Reveal delay={100} className="lg:col-span-2">
          <Card>
            <CardHead
              title="Reorder suggestion"
              right={<Pill tone="pigment">act within 4 days</Pill>}
            />
            <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
              <div>
                <p className="display text-[1.75rem]">Vitrified tile 600×600 · Bianco</p>
                <Rule className="my-4" />
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[0.8125rem]">
                  {[
                    ["Current stock", "182 sq ft"],
                    ["Avg weekly offtake", "156 sq ft (12-wk mean, +9%)"],
                    ["Forward orders", "3 schemes awaiting confirmation"],
                    ["Supplier lead time", "6 days"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-paper-400">{k}</dt>
                      <dd className="data mt-0.5 text-paper-100">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-[color-mix(in_oklab,var(--color-pigment)_9%,transparent)] px-4 py-3">
                  <span className="eyebrow">Suggested order</span>
                  <span className="data text-[1.25rem] text-paper-50">900 sq ft</span>
                  <span className="text-[0.75rem] text-paper-400">— override and we learn from it</span>
                </div>
              </div>

              {/* demand sparkline, drawn from tint events */}
              <div className="flex flex-col justify-between">
                <div>
                  <p className="eyebrow">Offtake / week</p>
                  <Sparkline data={TREND} />
                </div>
                <p className="mt-4 text-[0.75rem] leading-relaxed text-paper-400">
                  Forecast runs on what you actually reorder — a few dozen supply units — never
                  on thousands of finishes. That is what makes it checkable.
                </p>
              </div>
            </div>
          </Card>
        </Reveal>

        {/* alerts column */}
        <div className="flex flex-col gap-6">
          <Reveal delay={160}>
            <Card>
              <CardHead title="Blocking shortage" right={<Pill tone="pigment">blocking</Pill>} />
              <p className="text-[0.9375rem] text-paper-100">Yellow oxide colorant at 11%.</p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-400">
                Below threshold, <span className="text-paper-100">184 finishes</span> across your
                catalogue become unsupplyable — two of them sit on open quotations.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Terracotta 4188", "Sandstone 2201"].map((s) => (
                  <Pill key={s} tone="muted">{s}</Pill>
                ))}
              </div>
            </Card>
          </Reveal>

          <Reveal delay={220}>
            <Card>
              <CardHead title="Seasonal signal" right={<Pill tone="glaze">context</Pill>} />
              <p className="text-[0.9375rem] text-paper-100">Monsoon onset in ~3 weeks.</p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-400">
                Exterior coatings, waterproofing and anti-skid floor finishes rose 41% over the
                same window last year in your pincode. Moisture-blocking prep is your thinnest
                cover.
              </p>
              <p className="data mt-4 text-[0.625rem] tracking-[0.1em] text-paper-400 uppercase">
                Regional signal · shown only where data density allows
              </p>
            </Card>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "h-full rounded-3xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_70%,transparent)] p-6 backdrop-blur-sm sm:p-7",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <span className="eyebrow">{title}</span>
      {right}
    </div>
  );
}

function Sparkline({ data }: { data: { week: string; v: number }[] }) {
  const max = Math.max(...data.map((d) => d.v));
  return (
    <div className="mt-3 flex h-24 items-end gap-1.5" role="img" aria-label="Weekly tint events, rising trend">
      {data.map((d, i) => (
        <span key={d.week} className="relative flex h-full flex-1 items-end">
          <span
            style={{ height: `${(d.v / max) * 100}%`, transitionDelay: `${i * 40}ms` }}
            className={cn(
              "block w-full rounded-t-sm transition-[height] duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
              i >= data.length - 3 ? "bg-pigment" : "bg-paper-400/35",
            )}
          />
        </span>
      ))}
    </div>
  );
}
