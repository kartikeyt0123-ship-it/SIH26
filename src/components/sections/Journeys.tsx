"use client";

import { useState } from "react";
import { Reveal } from "@/components/scroll/Reveal";
import { Pill, Section, SectionHead } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";
import {
  ScreenScan,
  ScreenDescribe,
  ScreenVisualise,
  ScreenQuote,
  ScreenImport,
  ScreenLead,
  ScreenAvailability,
  ScreenConvert,
} from "@/components/mocks/Screens";

type Step = { title: string; body: string; screen: React.ReactNode };

const CUSTOMER: Step[] = [
  {
    title: "Scan, don’t install",
    body: "Your QR opens a link that expires. No app, no account, no queue at the counter.",
    screen: <ScreenScan />,
  },
  {
    title: "Describe it badly",
    body: "Voice or text, Hindi or English. Whatever they don’t say stays unknown, never invented.",
    screen: <ScreenDescribe />,
  },
  {
    title: "See their own room",
    body: "Walls, floor and a feature surface — swapped as one scheme, not one product at a time.",
    screen: <ScreenVisualise />,
  },
  {
    title: "Understand the price",
    body: "Surface area in, itemised estimate out, with the arithmetic on every line.",
    screen: <ScreenQuote />,
  },
];

const DEALER: Step[] = [
  {
    title: "Bring your own catalogue",
    body: "CSV from your ERP, mapped column by column, with a dry run before anything commits.",
    screen: <ScreenImport />,
  },
  {
    title: "Designs land on your counter",
    body: "A saved scheme arrives as a lead — space, surfaces, quantities and who sent it.",
    screen: <ScreenLead />,
  },
  {
    title: "Availability, honestly",
    body: "Checked per material at the moment of quoting, in the unit each one is actually supplied in.",
    screen: <ScreenAvailability />,
  },
  {
    title: "Quote and convert",
    body: "Your pricing, your margins, your letterhead — and the outcome feeds tomorrow’s stocking.",
    screen: <ScreenConvert />,
  },
];

export function Journeys() {
  // Dealer first: this page has to convince the person who pays.
  const [track, setTrack] = useState<"customer" | "dealer">("dealer");
  const [step, setStep] = useState(0);
  const steps = track === "customer" ? CUSTOMER : DEALER;

  const switchTrack = (t: "customer" | "dealer") => {
    setTrack(t);
    setStep(0);
  };

  return (
    <Section id="flow" className="bg-ink-900">
      <SectionHead
        eyebrow="Two users, one loop"
        title={
          <>
            The customer decides.
            <br />
            The dealer supplies. Same session.
          </>
        }
        lede="One workflow, two front doors — and whatever happens at either door becomes stock data you can act on."
      />

      <Reveal className="mt-12" delay={80}>
        <div
          role="tablist"
          aria-label="Journey"
          className="inline-flex rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] p-1"
        >
          {(["customer", "dealer"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={track === t}
              onClick={() => switchTrack(t)}
              className={cn(
                "relative rounded-full px-5 py-2 text-[0.875rem] transition-colors duration-300",
                track === t ? "text-ink-900" : "text-paper-300 hover:text-paper-50",
              )}
            >
              {track === t && (
                <span className="absolute inset-0 rounded-full bg-paper-50 transition-transform" />
              )}
              <span className="relative capitalize">{t}</span>
            </button>
          ))}
        </div>
      </Reveal>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,30rem)_1fr] lg:gap-16">
        {/* step list */}
        <Reveal delay={140}>
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const on = i === step;
              return (
                <li key={s.title}>
                  <button
                    onClick={() => setStep(i)}
                    onMouseEnter={() => setStep(i)}
                    aria-current={on}
                    className={cn(
                      "group relative w-full border-t border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] py-5 text-left transition-colors duration-300",
                      i === steps.length - 1 &&
                        "border-b border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)]",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0 left-0 h-px origin-left bg-pigment transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                        on ? "w-full scale-x-100" : "w-full scale-x-0",
                      )}
                    />
                    <span className="flex items-baseline gap-4">
                      <span
                        className={cn(
                          "data text-[0.6875rem] transition-colors",
                          on ? "text-pigment" : "text-paper-400",
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1">
                        <span
                          className={cn(
                            "block text-[1.0625rem] transition-colors duration-300",
                            on ? "text-paper-50" : "text-paper-300",
                          )}
                        >
                          {s.title}
                        </span>
                        <span
                          className={cn(
                            "grid transition-[grid-template-rows,opacity] duration-[520ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                            on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <span className="min-h-0 overflow-hidden">
                            <span className="mt-2 block max-w-md text-[0.9375rem] leading-relaxed text-paper-300">
                              {s.body}
                            </span>
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Reveal>

        {/* device */}
        <Reveal delay={220} className="lg:sticky lg:top-28 lg:self-start">
          <div className="relative mx-auto w-full max-w-[26rem]">
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-pigment)_16%,transparent),transparent)] blur-2xl" />
            <div className="relative aspect-[9/17] overflow-hidden rounded-[2.4rem] border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-ink-800 p-3 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
              <div className="relative h-full w-full overflow-hidden rounded-[1.8rem] bg-ink-900">
                {steps.map((s, i) => (
                  <div
                    key={s.title}
                    aria-hidden={i !== step}
                    className={cn(
                      "absolute inset-0 transition-all duration-[560ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                      i === step
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-3 opacity-0",
                    )}
                  >
                    {s.screen}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Pill tone="muted">
                {track === "customer" ? "Customer link" : "Dealer console"} · step{" "}
                {step + 1}/{steps.length}
              </Pill>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={120} className="mt-12">
        <p className="data text-[0.6875rem] tracking-[0.08em] text-paper-400/70">
          Illustrative interface · all figures synthetic
        </p>
      </Reveal>
    </Section>
  );
}
