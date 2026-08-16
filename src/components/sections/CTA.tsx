"use client";

import { Reveal, RevealLines } from "@/components/scroll/Reveal";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Primitives";
import { Logo } from "@/components/brand/Logo";

export function CTA() {
  return (
    <Section id="cta" className="relative overflow-hidden bg-ink-900">
      {/* one warm bloom, low and centred, so the page ends where the mark is */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-1/2 h-[120%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-pigment)_20%,transparent),transparent)] blur-3xl" />

      <div className="relative flex flex-col items-center text-center">
        <Reveal>
          <span className="eyebrow">Rachna · रचना · composition</span>
        </Reveal>

        <RevealLines
          className="display mt-6 text-[clamp(2.6rem,7vw,5.5rem)]"
          step={90}
          lines={[<>Put it on your counter.</>, <>See what one visit converts.</>]}
        />

        <Reveal delay={440} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button href="/login">Dealer login</Button>
          <Button href="/dashboard" variant="ghost">
            Open the demo dashboard
          </Button>
        </Reveal>

        <Reveal delay={560} className="mt-20">
          <Logo className="text-[1.6rem] opacity-80" />
        </Reveal>
      </div>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)]">
      <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-16">
        <p className="data text-[0.6875rem] tracking-[0.1em] text-paper-400 uppercase">
          Rachna AI · building-material decision layer
        </p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["How it works", "#story"],
            ["Dealer console", "#dealer"],
            ["Materials", "#materials"],
            ["Dealer login", "/login"],
          ].map(([l, h]) => (
            <a
              key={h}
              href={h}
              className="text-[0.8125rem] text-paper-400 transition-colors hover:text-paper-50"
            >
              {l}
            </a>
          ))}
        </nav>
        <p className="data text-[0.6875rem] tracking-[0.1em] text-paper-400 uppercase">
          Prototype · all figures synthetic
        </p>
      </div>
    </footer>
  );
}
