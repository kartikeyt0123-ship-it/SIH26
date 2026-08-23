"use client";

/**
 * The customer-facing intelligence panels.
 *
 * Kept out of `CustomerApp.tsx` because that file is already the wizard, and
 * because these four panels share one discipline that is easier to hold in one
 * place: every claim on screen carries how it was produced. A surface reading
 * says it came from pixel statistics, a climate figure says whether it is live,
 * a material pairing says it is a convention rather than a tested property.
 *
 * The customer's phone is the constraint throughout. These are collapsible,
 * they render nothing until asked, and none of them blocks the wizard — a
 * customer who ignores all four still gets the complete Round 1 journey.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDashed,
  CloudSun,
  Info,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { SurfaceReport } from "@/lib/surface";
import type { DesignDNA } from "@/lib/dna";
import type { MaterialsResponse } from "@/lib/store";
import { PLACEMENT_LABEL, BASIS_LABEL } from "@/lib/materials";
import { OPTIONS, type Intent } from "@/lib/whatif";
import { SEASON_LABEL } from "@/lib/climate";
import { cn } from "@/lib/utils";

/* --------------------------------- shell ---------------------------------- */

export function Card({
  icon: Icon,
  title,
  sub,
  children,
  defaultOpen = true,
  accent = "pigment",
}: {
  icon: typeof Sparkles;
  title: string;
  sub?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: "pigment" | "glaze" | "brass";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const tint =
    accent === "glaze"
      ? "bg-[color-mix(in_oklab,var(--color-glaze)_14%,transparent)] text-[#5fbfb3]"
      : accent === "brass"
        ? "bg-[color-mix(in_oklab,var(--color-brass)_14%,transparent)] text-[#e0bd72]"
        : "bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft";

  return (
    <section className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)] bg-ink-800/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-700/40"
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tint)}>
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] text-paper-50">{title}</span>
          {sub && <span className="mt-0.5 block text-[0.75rem] text-paper-400">{sub}</span>}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-paper-400 transition-transform duration-300",
            open && "rotate-180",
          )}
          strokeWidth={1.6}
        />
      </button>
      {open && <div className="border-t border-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)] px-4 py-4">{children}</div>}
    </section>
  );
}

/** The provenance line. Present under every panel, never optional. */
export function Basis({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-paper-400">
      <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.7} />
      <span>{children}</span>
    </p>
  );
}

/* --------------------------- 1. surface health ---------------------------- */

export function SurfaceHealthCard({
  report,
  disclosure,
  progress,
  busy,
}: {
  report: SurfaceReport;
  disclosure: string;
  progress?: { done: number; total: number } | null;
  busy?: boolean;
}) {
  const flagged = report.observations.filter((o) => o.severity !== "ok");
  const clean = report.observations.filter((o) => o.severity === "ok");

  return (
    <Card
      icon={AlertTriangle}
      title="Surface health report"
      sub={`${flagged.length ? `${flagged.length} thing${flagged.length === 1 ? "" : "s"} to look at` : "Nothing stood out"} · read from ${report.imageCount} photo${report.imageCount === 1 ? "" : "s"}`}
      accent={flagged.length ? "brass" : "glaze"}
    >
      {busy && progress && (
        <p className="mb-3 flex items-center gap-2 text-[0.8125rem] text-paper-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.7} />
          Analysing image {progress.done} of {progress.total}…
        </p>
      )}

      <ul className="flex flex-col gap-2.5">
        {flagged.map((o) => (
          <li key={o.code} className="flex items-start gap-2.5">
            <span className="mt-[3px] shrink-0 text-[0.8125rem] text-[#e0bd72]">⚠</span>
            <span className="min-w-0">
              <span className="block text-[0.875rem] text-paper-100">{o.label}</span>
              <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-paper-400">
                {o.evidence}
              </span>
            </span>
          </li>
        ))}
        {clean.map((o) => (
          <li key={o.code} className="flex items-start gap-2.5">
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#5fbfb3]" strokeWidth={2} />
            <span className="text-[0.875rem] text-paper-300">{o.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)] pt-4">
        <p className="eyebrow mb-3">Suggested preparation</p>
        <ol className="flex flex-col gap-2.5">
          {report.prep.map((s) => (
            <li key={s.order} className="flex items-start gap-3">
              <span
                className={cn(
                  "data mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem]",
                  s.triggered
                    ? "bg-[color-mix(in_oklab,var(--color-pigment)_18%,transparent)] text-pigment-soft"
                    : "bg-ink-700 text-paper-400",
                )}
              >
                {s.order}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.875rem] text-paper-100">{s.title}</span>
                  {s.triggered && (
                    <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-pigment)_40%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] text-pigment-soft uppercase">
                      needed here
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-paper-400">
                  {s.why}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[0.75rem] leading-relaxed text-paper-400">
          Your dealer stocks the preparation products for these steps — they are priced into the
          quotation alongside the paint.
        </p>
      </div>

      <Basis>
        {disclosure} These are possible issues to check in person, not confirmed damage.
      </Basis>
    </Card>
  );
}

/* ------------------- 1b. prep products the customer accepts ---------------- */

export type PrepChoice = {
  id: string;
  name: string;
  brand: string;
  category: string;
  required: boolean;
  why: string;
  pricePerLitre: number;
};

/**
 * The preparation the customer agrees to buy.
 *
 * Prescribed steps arrive ticked, and the customer can untick them. That is a
 * deliberate choice over locking them: a quotation the customer did not agree
 * to is one they argue with at the counter, and a dealer would rather know now
 * that someone intends to skip the primer than discover it when the paint
 * lifts. Everything that was prescribed says so, and stays saying so when
 * unticked.
 */
export function PrepPicker({
  options,
  selected,
  onChange,
}: {
  options: PrepChoice[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (!options.length) return null;

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const declinedRequired = options.filter((o) => o.required && !selected.includes(o.id));

  return (
    <Card
      icon={Layers}
      title="Add preparation to your quotation"
      sub={`${selected.length} of ${options.length} selected`}
      accent="brass"
    >
      <div className="flex flex-col gap-2.5">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              aria-pressed={on}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                on
                  ? "border-[color-mix(in_oklab,var(--color-pigment)_50%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_7%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                  on
                    ? "border-pigment bg-pigment text-white"
                    : "border-[color-mix(in_oklab,var(--color-paper-200)_30%,transparent)]",
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.875rem] text-paper-50">{o.name}</span>
                  {o.required && (
                    <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] text-pigment-soft uppercase">
                      recommended for your wall
                    </span>
                  )}
                </span>
                <span className="data mt-0.5 block text-[0.5625rem] tracking-[0.08em] text-paper-400 uppercase">
                  {o.brand} · {o.category} · ₹{o.pricePerLitre}/L
                </span>
                <span className="mt-1 block text-[0.75rem] leading-relaxed text-paper-400">
                  {o.why}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {declinedRequired.length > 0 && (
        <p className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] px-3 py-2.5 text-[0.75rem] leading-relaxed text-[#e0bd72]">
          You have left out {declinedRequired.map((o) => o.name).join(" and ")}, which your wall
          looks like it needs. That is your call — your dealer will see it on the quotation and can
          talk it through.
        </p>
      )}

      <Basis>
        Quantities are worked out from your own measurements and appear as separate lines on the
        quotation, priced at your dealer&apos;s own rates.
      </Basis>
    </Card>
  );
}

/* ------------------ 1c. a colour the dealer cannot mix today --------------- */

export type SubstituteInfo = {
  available: boolean;
  wanted: { code: string; name: string; hex: string };
  headline: string;
  substitutes: {
    shade: { code: string; name: string; hex: string };
    deltaE: number;
    closeness: string;
    why: string;
  }[];
};

/**
 * What happens when the customer wants a colour that is out of reach.
 *
 * Both halves matter. The alternatives keep the sale alive today; the request
 * button turns a dead end into a named, actionable piece of demand on the
 * dealer's Overview. Neither is a consolation prize — a dealer who learns that
 * four customers wanted the same unavailable colour has learnt something no
 * forecast would have told them.
 */
export function UnavailableShade({
  info,
  onUse,
  onRequest,
  requested,
  requesting,
}: {
  info: SubstituteInfo;
  onUse: (code: string) => void;
  onRequest: () => void;
  requested: boolean;
  requesting: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_6%,transparent)] p-4">
      <div className="flex items-start gap-3">
        <span
          style={{ background: info.wanted.hex }}
          className="mt-0.5 h-10 w-10 shrink-0 rounded-lg opacity-50 ring-1 ring-white/10"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] text-paper-50">{info.wanted.name}</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-paper-300">{info.headline}</p>
        </div>
      </div>

      {info.substitutes.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-2.5">Closest your dealer can mix today</p>
          <div className="flex flex-col gap-2">
            {info.substitutes.map((s) => (
              <button
                key={s.shade.code}
                type="button"
                onClick={() => onUse(s.shade.code)}
                className="flex items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-2.5 text-left transition-colors hover:border-pigment"
              >
                <span
                  style={{ background: s.shade.hex }}
                  className="h-9 w-9 shrink-0 rounded-lg ring-1 ring-white/10"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[0.875rem] text-paper-50">{s.shade.name}</span>
                    <span className="data text-[0.5625rem] tracking-[0.1em] text-[#5fbfb3] uppercase">
                      {s.closeness}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-paper-400">
                    {s.why}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onRequest}
        disabled={requested || requesting}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[0.875rem] transition-colors",
          requested
            ? "bg-[color-mix(in_oklab,var(--color-glaze)_18%,transparent)] text-[#7fd6c9]"
            : "border border-[color-mix(in_oklab,var(--color-paper-200)_20%,transparent)] text-paper-100 hover:border-pigment",
        )}
      >
        {requesting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />}
        {requested ? (
          <>
            <Check className="h-4 w-4" strokeWidth={2.4} /> Your dealer has been told
          </>
        ) : (
          `Ask my dealer to stock ${info.wanted.name}`
        )}
      </button>
      <p className="mt-2 text-[0.6875rem] leading-relaxed text-paper-400">
        {requested
          ? "It now appears on their dashboard with your name against it. They will let you know if they can arrange it."
          : "This puts the colour on your dealer's dashboard with your name against it, so they can decide whether to stock it."}
      </p>
    </div>
  );
}

/* ------------------------------ 2. design DNA ----------------------------- */

function FacetRow({
  label,
  value,
  confidence,
  because,
}: {
  label: string;
  value: string;
  confidence: number;
  because: string;
}) {
  // Below 0.4 the profile has not earned the right to assert anything, so the
  // value is shown greyed with the confidence stated rather than hidden.
  const weak = confidence < 0.4;
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={cn("mt-1 text-[0.9375rem]", weak ? "text-paper-400" : "text-paper-50")}>
        {value}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
          <span
            style={{ width: `${Math.max(4, confidence * 100)}%` }}
            className={cn(
              "block h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
              weak ? "bg-paper-400/40" : "bg-pigment",
            )}
          />
        </span>
        <span className="data shrink-0 text-[0.5625rem] tracking-[0.08em] text-paper-400 uppercase">
          {Math.round(confidence * 100)}%
        </span>
      </div>
      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-paper-400">{because}</p>
    </div>
  );
}

export function DesignDNACard({
  dna,
  disclosure,
}: {
  dna: DesignDNA;
  disclosure: string;
}) {
  if (dna.signalCount === 0) {
    return (
      <Card
        icon={CircleDashed}
        title="Rachna Design DNA"
        sub="Builds as you choose"
        defaultOpen={false}
        accent="glaze"
      >
        <p className="text-[0.8125rem] leading-relaxed text-paper-300">
          Open a few schemes and save the ones you like. Your taste profile builds from what you
          actually pick — nothing here is guessed before you have picked anything.
        </p>
        <Basis>{disclosure}</Basis>
      </Card>
    );
  }

  return (
    <Card
      icon={Sparkles}
      title="Rachna Design DNA"
      sub={
        dna.provisional
          ? "Still forming — save a few more to sharpen it"
          : `${dna.style.value} · ${dna.palette.value}`
      }
      accent="glaze"
      defaultOpen={!dna.provisional}
    >
      {dna.provisional && (
        <p className="mb-4 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] px-3 py-2.5 text-[0.75rem] leading-relaxed text-[#e0bd72]">
          This is a first read from {dna.signalCount} action{dna.signalCount === 1 ? "" : "s"}. Save
          or skip a few more schemes and it will settle.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-5 gap-y-5">
        <FacetRow label="Style" {...dna.style} />
        <FacetRow label="Palette" {...dna.palette} />
        <FacetRow label="Finish" {...dna.finish} />
        <FacetRow label="Budget" {...dna.budget} />
      </div>

      {dna.colours.length > 0 && (
        <div className="mt-5 border-t border-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)] pt-4">
          <p className="eyebrow mb-3">Colours you keep coming back to</p>
          <div className="flex flex-wrap gap-2.5">
            {dna.colours.map((c) => (
              <span key={c.hex} className="flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] py-1 pr-3 pl-1">
                <span
                  style={{ background: c.hex }}
                  className="h-5 w-5 rounded-full ring-1 ring-white/10"
                  aria-hidden="true"
                />
                <span className="text-[0.75rem] text-paper-200">{c.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <Basis>{disclosure}</Basis>
    </Card>
  );
}

/* ------------------------------- 3. what-if ------------------------------- */

export function WhatIfPanel({
  onAsk,
  busyIntent,
  result,
  onPreview,
  onSave,
  activeSchemeId,
  savedIds,
}: {
  onAsk: (intent: Intent) => void;
  busyIntent: Intent | null;
  result: { intent: Intent; prompt: string; schemes: SchemeLike[]; changed: string[] } | null;
  onPreview: (s: SchemeLike) => void;
  onSave: (s: SchemeLike) => void;
  activeSchemeId: string | null;
  savedIds: Set<string>;
}) {
  return (
    <Card icon={Sparkles} title="What if…" sub="Explore a different direction" defaultOpen={false}>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const on = result?.intent === o.intent;
          const loading = busyIntent === o.intent;
          return (
            <button
              key={o.intent}
              type="button"
              onClick={() => onAsk(o.intent)}
              disabled={busyIntent !== null}
              title={o.effect}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors disabled:opacity-50",
                on
                  ? "border-pigment bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-paper-50"
                  : "border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] text-paper-200 hover:border-pigment hover:text-paper-50",
              )}
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />}
              {o.prompt}
            </button>
          );
        })}
      </div>

      {busyIntent && (
        <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-paper-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.7} />
          Checking dealer inventory for that direction…
        </p>
      )}

      {result && !busyIntent && (
        <div className="mt-5">
          <p className="text-[0.8125rem] text-paper-200">
            <span className="text-paper-50">{result.prompt}</span> —{" "}
            {result.changed.join("; ")}.
          </p>

          {result.schemes.length === 0 ? (
            /* An honest empty state. Inventing options here would break the one
               promise the product rests on: everything shown can be supplied. */
            <p className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] px-3 py-2.5 text-[0.75rem] leading-relaxed text-[#e0bd72]">
              Your dealer has nothing in stock that matches that direction right now. Try another,
              or ask at the counter about ordering it in.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {result.schemes.map((s) => (
                <SchemeRow
                  key={s.id}
                  scheme={s}
                  active={s.id === activeSchemeId}
                  saved={savedIds.has(s.id)}
                  onPreview={() => onPreview(s)}
                  onSave={() => onSave(s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Basis>
        Your request changes the brief, then the same recommender runs again against your dealer&apos;s
        live stock. Anything shown here can be quoted exactly like the others.
      </Basis>
    </Card>
  );
}

export type SchemeLike = {
  id: string;
  title: string;
  rationale: string;
  shades: Record<"main" | "feature" | "ceiling" | "trim", { code: string; name: string; hex: string }>;
  line: { id: string; brand: string; name: string; finish: string };
  trimLine?: { id: string } | null;
};

function SchemeRow({
  scheme,
  active,
  saved,
  onPreview,
  onSave,
}: {
  scheme: SchemeLike;
  active: boolean;
  saved: boolean;
  onPreview: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        active
          ? "border-pigment bg-[color-mix(in_oklab,var(--color-pigment)_8%,transparent)]"
          : "border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)]",
      )}
    >
      <div className="flex items-center gap-3">
        <span className="flex shrink-0 gap-1">
          {(["main", "feature", "ceiling"] as const).map((r) => (
            <span
              key={r}
              style={{ background: scheme.shades[r].hex }}
              className="h-8 w-3 rounded-sm ring-1 ring-white/10"
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.875rem] text-paper-50">{scheme.title}</span>
          <span className="data block text-[0.5625rem] tracking-[0.08em] text-paper-400 uppercase">
            {scheme.line.brand} · {scheme.line.finish}
          </span>
        </span>
      </div>
      <p className="mt-2 text-[0.75rem] leading-relaxed text-paper-400">{scheme.rationale}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onPreview}
          className="flex-1 rounded-lg border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] py-1.5 text-[0.75rem] text-paper-200 transition-colors hover:border-pigment hover:text-paper-50"
        >
          {active ? "Showing in your room" : "See it in your room"}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saved}
          className="flex-1 rounded-lg border border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_12%,transparent)] py-1.5 text-[0.75rem] text-pigment-soft transition-colors disabled:opacity-60"
        >
          {saved ? "Shortlisted" : "Shortlist this"}
        </button>
      </div>
    </div>
  );
}

/* -------------------- 4. materials + climate (combined) -------------------- */

export function MaterialsCard({ data }: { data: MaterialsResponse }) {
  const { materials, climate } = data;

  return (
    <>
      <Card
        icon={Layers}
        title="What else this job needs"
        sub="Companion materials for the scheme you chose"
        defaultOpen={false}
      >
        {materials.groups.length === 0 ? (
          <p className="text-[0.8125rem] text-paper-300">
            Nothing beyond the paint and its preparation for this surface.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {materials.groups.map((g) => (
              <div key={g.placement}>
                <p className="eyebrow mb-2.5">{PLACEMENT_LABEL[g.placement]}</p>
                <div className="flex flex-col gap-2.5">
                  {g.items.map((m) => (
                    <div key={`${m.category}_${m.placement}`} className="flex items-start gap-3">
                      <span
                        style={{ background: m.hex }}
                        className="mt-0.5 h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/10"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[0.875rem] text-paper-100">{m.label}</span>
                          <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] text-paper-400 uppercase">
                            {BASIS_LABEL[m.basis]}
                          </span>
                          {m.available && (
                            <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-glaze)_45%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] text-[#5fbfb3] uppercase">
                              in stock
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[0.8125rem] text-paper-200">{m.suggestion}</p>
                        <p className="mt-1 text-[0.6875rem] leading-relaxed text-paper-400">
                          {m.why} {m.availabilityNote}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <Basis>{materials.disclosure}</Basis>
      </Card>

      {climate.advice.length > 0 && (
        <Card
          icon={CloudSun}
          title="Because of where this wall is"
          sub={`${climate.context.city} · ${SEASON_LABEL[climate.context.season]}`}
          accent="brass"
          defaultOpen={false}
        >
          <div className="flex flex-col gap-3.5">
            {climate.advice.map((a) => (
              <div key={a.headline}>
                <p
                  className={cn(
                    "text-[0.875rem]",
                    a.weight === "important" ? "text-paper-50" : "text-paper-200",
                  )}
                >
                  {a.headline}
                </p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-paper-400">{a.because}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {a.wants.map((w) => (
                    <span
                      key={w}
                      className="rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-2 py-0.5 text-[0.6875rem] text-paper-300"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Not a footnote. If this figure is simulated the customer is told
              so at the same size as the figure itself. */}
          <p
            className={cn(
              "mt-4 rounded-xl border px-3 py-2.5 text-[0.75rem] leading-relaxed",
              climate.live
                ? "border-[color-mix(in_oklab,var(--color-glaze)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-glaze)_8%,transparent)] text-[#5fbfb3]"
                : "border-[color-mix(in_oklab,var(--color-brass)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] text-[#e0bd72]",
            )}
          >
            {climate.disclosure}
          </p>
        </Card>
      )}
    </>
  );
}
