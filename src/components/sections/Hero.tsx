"use client";

import { Button } from "@/components/ui/Button";
import { Reveal, RevealLines } from "@/components/scroll/Reveal";

/**
 * The hero says one thing.
 *
 * A dealer scrolling past gets a tagline, a single sentence of proof and a way
 * in. Everything that used to be here — the fact grid, the category list, the
 * positioning line — moved further down the page or into the scene, because a
 * dealer who has to read three paragraphs to understand the pitch has already
 * decided it is not for him.
 */
export function Hero() {
  return (
    <section id="top" className="relative flex min-h-[100svh] flex-col justify-end">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,11,0.72)_0%,rgba(8,9,11,0.18)_32%,rgba(8,9,11,0.42)_66%,rgba(8,9,11,0.97)_100%)]" />

      <div className="relative mx-auto w-full max-w-[78rem] px-6 pb-16 sm:px-10 lg:px-16 lg:pb-24">
        <RevealLines
          className="display text-[clamp(3.2rem,10vw,9rem)]"
          delay={140}
          step={100}
          lines={[
            <>Show the whole room.</>,
            <>
              Sell the <em className="text-pigment not-italic">whole room.</em>
            </>,
          ]}
        />

        <div className="mt-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <Reveal delay={520}>
            <p className="max-w-lg text-[clamp(1.05rem,1.1vw,1.25rem)] leading-relaxed text-paper-200">
              A walk-in with a photo leaves with a costed, in-stock scheme —
              every surface, one visit, your prices.
            </p>
          </Reveal>

          <Reveal delay={620} className="flex flex-wrap items-center gap-3">
            <Button href="/login">Dealer login</Button>
            <Button href="#story" variant="ghost">
              See it work
            </Button>
          </Reveal>
        </div>

        <Reveal delay={780} className="mt-12 flex items-center gap-3">
          <span className="relative flex h-8 w-5 items-start justify-center rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_25%,transparent)] p-1">
            <span className="h-1.5 w-1 animate-[scrollcue_1.8s_cubic-bezier(0.83,0,0.17,1)_infinite] rounded-full bg-pigment" />
          </span>
          <span className="eyebrow">Scroll</span>
        </Reveal>
      </div>

      <style>{`
        @keyframes scrollcue {
          0%   { transform: translateY(0);    opacity: 0; }
          25%  { opacity: 1; }
          75%  { transform: translateY(11px); opacity: 1; }
          100% { transform: translateY(13px); opacity: 0; }
        }
      `}</style>
    </section>
  );
}
