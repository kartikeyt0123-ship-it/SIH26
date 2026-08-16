"use client";

import { LogoMark } from "@/components/brand/Logo";
import { cn, inr } from "@/lib/utils";

/* ------------------------------------------------------------------
   Interface mocks — drawn, not screenshotted, so they stay crisp at
   any size, theme with the design tokens and weigh nothing.
   Every figure is synthetic.
   ------------------------------------------------------------------ */

function Shell({
  title,
  sub,
  children,
  accent,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] px-4 py-3.5">
        <LogoMark className="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.75rem] text-paper-100">{title}</p>
          {sub && (
            <p className="data truncate text-[0.5625rem] tracking-[0.1em] text-paper-400 uppercase">
              {sub}
            </p>
          )}
        </div>
        {accent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pigment" />}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="data text-[0.5625rem] tracking-[0.16em] text-paper-400 uppercase">{children}</p>
  );
}

function Row({
  left,
  right,
  dim,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2 text-[0.6875rem]",
        dim ? "text-paper-400" : "text-paper-100",
      )}
    >
      <span className="truncate">{left}</span>
      <span className="data shrink-0">{right}</span>
    </div>
  );
}

/* ---------------------------- CUSTOMER ---------------------------- */

export function ScreenScan() {
  return (
    <Shell title="Sharma Interiors & Hardware" sub="Kanpur · counter link">
      <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
        <div className="relative overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] p-4">
          <QrArt />
          <span className="absolute inset-x-4 top-4 h-px animate-[qrscan_2.6s_cubic-bezier(0.83,0,0.17,1)_infinite] bg-pigment" />
        </div>
        <div>
          <p className="text-[0.8125rem] text-paper-50">Scan to design your space</p>
          <p className="mt-1 text-[0.6875rem] text-paper-400">
            No app, no account. Link expires in 72 hours.
          </p>
        </div>
        <div className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-3 py-1.5 text-[0.5625rem] tracking-[0.12em] text-paper-300 uppercase">
          rachna.ai/c/7XK92
        </div>
      </div>
      <style>{`@keyframes qrscan{0%{transform:translateY(0);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateY(104px);opacity:0}}`}</style>
    </Shell>
  );
}

function QrArt() {
  const cells = Array.from({ length: 144 }, (_, i) => {
    const x = i % 12;
    const y = Math.floor(i / 12);
    const corner = (x < 3 && y < 3) || (x > 8 && y < 3) || (x < 3 && y > 8);
    const on = corner || (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 > 0.45;
    return { i, on };
  });
  return (
    <div className="grid grid-cols-12 gap-[2px]" aria-hidden="true">
      {cells.map((c) => (
        <span
          key={c.i}
          className={cn("h-[7px] w-[7px] rounded-[1px]", c.on ? "bg-paper-100" : "bg-transparent")}
        />
      ))}
    </div>
  );
}

export function ScreenDescribe() {
  return (
    <Shell title="Tell us about the space" sub="voice or text · हिंदी / English" accent>
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-2xl rounded-tl-md bg-ink-700 p-3">
          <p className="text-[0.75rem] leading-relaxed text-paper-100">
            “Drawing room hai. Warm feel chahiye, floor thoda light. Ek wall alag dikhni
            chahiye.”
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-1 w-1 animate-pulse rounded-full bg-pigment" />
            <span className="data text-[0.5625rem] tracking-[0.12em] text-paper-400 uppercase">
              transcribed · 0:07
            </span>
          </div>
        </div>

        <Label>Understood as</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ["space", "living room"],
            ["mood", "warm"],
            ["floor", "light tone"],
            ["feature wall", "yes"],
            ["budget", "unknown"],
            ["timeline", "unknown"],
          ].map(([k, v]) => (
            <div
              key={k}
              className={cn(
                "rounded-lg border px-2.5 py-2",
                v === "unknown"
                  ? "border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--color-glaze)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-glaze)_10%,transparent)]",
              )}
            >
              <p className="data text-[0.5rem] tracking-[0.14em] text-paper-400 uppercase">{k}</p>
              <p
                className={cn(
                  "mt-0.5 text-[0.6875rem]",
                  v === "unknown" ? "text-paper-400 italic" : "text-paper-50",
                )}
              >
                {v}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-auto text-[0.625rem] leading-relaxed text-paper-400">
          What they did not say stays <span className="italic">unknown</span> and gets asked —
          never guessed.
        </p>
      </div>
    </Shell>
  );
}

export function ScreenVisualise() {
  return (
    <Shell title="Their room, three schemes" sub="tap to swap any surface">
      <div className="flex h-full flex-col gap-3">
        <div className="relative flex-1 overflow-hidden rounded-2xl">
          {/* stylised interior: back wall, feature wall, floor, window */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#d9c4a0_0%,#cbb28a_58%,#c0a67e_62%,#c0a67e_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-[34%] bg-[repeating-linear-gradient(92deg,#cfc7b8_0_16px,#bdb4a4_16px_18px)]" />
          <div className="absolute top-0 right-0 h-[66%] w-[34%] bg-[repeating-conic-gradient(from_45deg_at_50%_50%,#2f4f4a_0deg_18deg,#456760_18deg_36deg)]" />
          <div className="absolute top-[16%] left-[10%] h-[32%] w-[26%] rounded-[2px] border border-white/30 bg-[linear-gradient(140deg,rgba(255,255,255,0.5),rgba(255,255,255,0.08))]" />
          <div className="absolute bottom-[34%] left-[8%] h-[14%] w-[42%] rounded-sm bg-[#6f6558]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgba(8,9,11,0.5))]" />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            ["Walls", "#d9c4a0"],
            ["Feature", "#2f4f4a"],
            ["Floor", "#cfc7b8"],
          ].map(([label, c]) => (
            <div
              key={label}
              className="rounded-lg border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-2"
            >
              <span style={{ background: c }} className="block h-5 w-full rounded-sm" />
              <p className="data mt-1.5 text-[0.5rem] tracking-[0.12em] text-paper-400 uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-2.5">
          <Row left="Scheme 2 of 3 · all in stock" right="ΔE 1.4" />
          <p className="text-[0.625rem] text-paper-400">
            Closest available finish. Perceptible only on close inspection.
          </p>
        </div>
      </div>
    </Shell>
  );
}

export function ScreenQuote() {
  return (
    <Shell title="Estimate" sub="itemised · synthetic figures" accent>
      <div className="flex h-full flex-col gap-3">
        <Label>Living room · 1,240 sq ft of surface</Label>
        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          <Row left="Wall coating · 20 L × 2" right={inr(11800)} />
          <Row left="Surface prep + primer" right={inr(5440)} />
          <Row left="Floor tile 600×600 · 420 sq ft" right={inr(23940)} />
          <Row left="Feature wallpaper · 4 rolls" right={inr(6800)} />
          <Row left="Skirting & trims" right={inr(2270)} />
        </div>
        <div className="mt-1 rounded-xl bg-[color-mix(in_oklab,var(--color-pigment)_10%,transparent)] p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.6875rem] text-paper-200">Materials total</span>
            <span className="data text-[0.9375rem] text-paper-50">{inr(50250)}</span>
          </div>
          <p className="mt-1.5 text-[0.625rem] leading-relaxed text-paper-300">
            Quantities from measured surfaces and published coverage rates. The arithmetic is
            shown on every line.
          </p>
        </div>
        <button className="mt-auto h-9 rounded-full bg-paper-50 text-[0.75rem] font-medium text-ink-900">
          Send to Sharma Interiors
        </button>
      </div>
    </Shell>
  );
}

/* ----------------------------- DEALER ----------------------------- */

export function ScreenImport() {
  return (
    <Shell title="Import stock" sub="CSV · dry run">
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] p-3">
          <p className="data text-[0.625rem] text-paper-200">tally_stock_16aug.csv</p>
          <p className="mt-0.5 text-[0.625rem] text-paper-400">318 rows · 6 columns</p>
        </div>
        <Label>Column mapping</Label>
        <div className="flex flex-col gap-1.5">
          {[
            ["ITEM NAME", "product", true],
            ["CATEGORY", "material_type", true],
            ["BRAND", "brand", true],
            ["UNIT", "unit_of_supply", true],
            ["QTY", "quantity", true],
            ["GODOWN", "— ignored", false],
          ].map(([from, to, ok]) => (
            <div key={String(from)} className="flex items-center gap-2 text-[0.625rem]">
              <span className="data w-[5.5rem] shrink-0 truncate text-paper-400">{from}</span>
              <span className="text-paper-400">→</span>
              <span
                className={cn("data flex-1 truncate", ok ? "text-paper-50" : "text-paper-400 italic")}
              >
                {to}
              </span>
              <span
                className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-[#5fbfb3]" : "bg-paper-400/40")}
              />
            </div>
          ))}
        </div>
        <div className="mt-auto rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-2.5">
          <p className="text-[0.625rem] text-paper-200">312 rows will be created, 6 skipped.</p>
          <p className="mt-1 text-[0.5625rem] text-paper-400">
            Nothing is written until you confirm. Your ERP stays the system of record.
          </p>
        </div>
      </div>
    </Shell>
  );
}

export function ScreenLead() {
  return (
    <Shell title="New design received" sub="today · 4:12 pm" accent>
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[0.8125rem] text-paper-50">Meena Verma</p>
              <p className="data text-[0.5625rem] tracking-[0.12em] text-paper-400 uppercase">
                Kidwai Nagar · living room · 1,240 sq ft
              </p>
            </div>
            <span className="data rounded-full bg-[color-mix(in_oklab,var(--color-pigment)_16%,transparent)] px-2 py-0.5 text-[0.5rem] tracking-[0.12em] text-pigment-soft uppercase">
              new
            </span>
          </div>
          <div className="mt-3 flex gap-1.5">
            {["#d9c4a0", "#2f4f4a", "#cfc7b8", "#a97c4c"].map((c) => (
              <span key={c} style={{ background: c }} className="h-6 flex-1 rounded-md" />
            ))}
          </div>
        </div>

        <Label>Flagged automatically</Label>
        <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] p-2.5">
          <p className="text-[0.6875rem] text-paper-100">Damp near the window · confidence 0.81</p>
          <p className="mt-1 text-[0.625rem] text-paper-300">
            Moisture-blocking prep added to the specification.
          </p>
        </div>

        <Label>Pipeline</Label>
        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          <Row left="Awaiting quotation" right="4" />
          <Row left="Quoted, not confirmed" right="7" />
          <Row left="Confirmed this week" right="9" />
        </div>
      </div>
    </Shell>
  );
}

export function ScreenAvailability() {
  const lines = [
    { m: "Wall coating · Ivory Warm", pct: 82, ok: true },
    { m: "Floor tile 600×600 · Bianco", pct: 64, ok: true },
    { m: "Feature wallpaper · Emerald", pct: 11, ok: false },
    { m: "Skirting & trims", pct: 46, ok: true },
  ];
  return (
    <Shell title="Can you supply this scheme?" sub="checked at the moment of quoting">
      <div className="flex h-full flex-col gap-3">
        <Label>Cover against this order</Label>
        <div className="flex flex-col gap-2.5">
          {lines.map((l) => (
            <div key={l.m}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[0.625rem] text-paper-200">{l.m}</span>
                <span className="data shrink-0 text-[0.5625rem] text-paper-400">{l.pct}%</span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-700">
                <span
                  style={{ width: `${l.pct}%` }}
                  className={cn("block h-full rounded-full", l.ok ? "bg-[#5fbfb3]" : "bg-pigment")}
                />
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[color-mix(in_oklab,var(--color-pigment)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_8%,transparent)] p-2.5">
          <p className="text-[0.6875rem] text-paper-50">Short by 3 rolls · Emerald</p>
          <p className="mt-1 text-[0.625rem] text-paper-300">
            Nearest producible alternative is ΔE 1.9 — offered as an alternative, never as a
            match. The line is never silently dropped.
          </p>
        </div>

        <p className="mt-auto text-[0.5625rem] leading-relaxed text-paper-400">
          Coatings are checked at base and colorant level, tile by lot, wallpaper by roll and
          repeat. Same question, different unit.
        </p>
      </div>
    </Shell>
  );
}

export function ScreenConvert() {
  return (
    <Shell title="This month" sub="computed from platform events" accent>
      <div className="flex h-full flex-col gap-3">
        <div className="rounded-2xl bg-[color-mix(in_oklab,var(--color-glaze)_12%,transparent)] p-3">
          <Label>Quotations converted</Label>
          <p className="data mt-1 text-[1.5rem] text-paper-50">
            23<span className="text-[0.875rem] text-paper-400"> / 39</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
            <span className="block h-full w-[59%] rounded-full bg-[#5fbfb3]" />
          </div>
        </div>
        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          <Row left="Multi-surface schemes" right="34 / 41 jobs" />
          <Row left="Uplift from whole-room baskets" right={inr(118000)} />
          <Row left="Stranded stock cleared" right={inr(42000)} />
          <Row left="Stockouts avoided" right="4" />
        </div>
        <div className="mt-auto rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-2.5">
          <p className="text-[0.625rem] leading-relaxed text-paper-300">
            Every figure traces to a real event — a quotation, a dispatch, a sale. No estimates
            on this screen.
          </p>
        </div>
      </div>
    </Shell>
  );
}
