"use client";

import { Reveal } from "@/components/scroll/Reveal";
import { Section } from "@/components/ui/Primitives";

/**
 * Three claims, no paragraphs.
 *
 * Deliberately no percentages: an unvalidated "+38% order value" is the fastest
 * way to lose a dealer who has heard it before. These are statements about
 * behaviour at the counter, which he can check against his own day.
 */
const CLAIMS = [
  {
    k: "One visit",
    h: "Requirement to quotation, before they walk out",
    p: "No second appointment, no “I’ll think about it”, no quotation typed up after closing.",
  },
  {
    k: "Every surface",
    h: "One scheme instead of one product",
    p: "Walls, floors, panelling and fittings decided together — so the basket is the room, not an item.",
  },
  {
    k: "Only your stock",
    h: "Nothing shown that you cannot deliver",
    p: "The customer never falls in love with a finish that is four weeks out.",
  },
];

export function Proof() {
  return (
    <Section className="plaster grain" tight>
      <div className="grid gap-px overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] bg-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] md:grid-cols-3">
        {CLAIMS.map((c, i) => (
          <Reveal key={c.k} delay={i * 90}>
            <div className="group h-full bg-ink-900 p-7 transition-colors duration-300 hover:bg-ink-800 sm:p-9">
              <span className="eyebrow flex items-center gap-2.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-pigment" />
                {c.k}
              </span>
              <p className="display mt-5 text-[clamp(1.35rem,2vw,1.8rem)]">{c.h}</p>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-paper-400">{c.p}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
