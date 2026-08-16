"use client";

import { useState } from "react";
import { Reveal } from "@/components/scroll/Reveal";
import { Pill, Section, SectionHead } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";

type Material = {
  id: string;
  name: string;
  unit: string;
  note: string;
  /** Drawn in CSS — no image assets to download, licence or colour-manage. */
  swatch: string;
};

const MATERIALS: Material[] = [
  {
    id: "tile",
    name: "Tiles & stone",
    unit: "sq ft · lot",
    note: "Lot and shade variation make “what is actually in the godown” a real question.",
    swatch:
      "conic-gradient(from 0deg, #cfc7b8 0 25%, #b3aa9b 25% 50%, #cfc7b8 50% 75%, #b3aa9b 75%)",
  },
  {
    id: "coatings",
    name: "Paint & coatings",
    unit: "base + colorant",
    note: "Tinted at the counter, so availability is a formula question, not a shelf question.",
    swatch: "radial-gradient(120% 90% at 30% 20%, #e2542a, #a9543c 45%, #6d3527 100%)",
  },
  {
    id: "wallpaper",
    name: "Wallpaper",
    unit: "roll · repeat",
    note: "Pattern repeat and roll count are exactly the arithmetic customers get wrong.",
    swatch:
      "repeating-conic-gradient(from 45deg at 50% 50%, #2f4f4a 0deg 20deg, #46685f 20deg 40deg)",
  },
  {
    id: "mica",
    name: "Mica & laminates",
    unit: "sheet · finish",
    note: "Catalogue-heavy, visually decided, and you hold a fraction of the book.",
    swatch:
      "repeating-linear-gradient(102deg, #8a6a45 0 3px, #a07d54 3px 6px, #7a5c3c 6px 11px)",
  },
  {
    id: "plywood",
    name: "Plywood & panels",
    unit: "sheet · grade",
    note: "Grade substitution is where dealer trust is won or lost.",
    swatch:
      "repeating-linear-gradient(88deg, #b98a57 0 8px, #c9a97b 8px 12px, #a87e4f 12px 22px)",
  },
  {
    id: "sanitary",
    name: "Sanitaryware",
    unit: "SKU · finish",
    note: "Sold as a set — combination matters more than any single item.",
    swatch: "radial-gradient(90% 80% at 35% 25%, #f2f0ea, #d5d3cc 55%, #a9a7a1 100%)",
  },
  {
    id: "hardware",
    name: "Architectural hardware",
    unit: "finish family",
    note: "Finish families have to carry across every other material they picked.",
    swatch:
      "linear-gradient(135deg, #6b5a33 0%, #c79a45 38%, #f0dca8 52%, #b3893c 68%, #5e4e2c 100%)",
  },
];

export function Materials() {
  const [active, setActive] = useState(0);
  const m = MATERIALS[active];

  return (
    <Section id="materials" className="bg-ink-900">
      <SectionHead
        eyebrow="Your whole shop"
        title={
          <>
            One workflow.
            <br />
            Every surface you sell.
          </>
        }
        lede="Requirement, understanding, specification, availability, quotation — the loop does not change when the material does. Only the unit of availability changes, and that is a data problem, not a different product."
      />

      <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-16">
        <Reveal className="order-2 lg:order-1">
          <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)]">
            {MATERIALS.map((mat, i) => (
              <span
                key={mat.id}
                aria-hidden="true"
                style={{ background: mat.swatch }}
                className={cn(
                  "absolute inset-0 transition-opacity duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                  i === active ? "opacity-100" : "opacity-0",
                )}
              />
            ))}
            <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(8,9,11,0.9))]" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <Pill>{m.unit}</Pill>
              <p className="display mt-3 text-[1.75rem]">{m.name}</p>
              <p className="mt-2 max-w-sm text-[0.875rem] leading-relaxed text-paper-200">
                {m.note}
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120} className="order-1 lg:order-2">
          <ul>
            {MATERIALS.map((mat, i) => {
              const on = i === active;
              return (
                <li key={mat.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    className={cn(
                      "group flex w-full items-center gap-5 border-b border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] py-5 text-left transition-colors duration-300",
                      i === 0 && "border-t",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      style={{ background: mat.swatch }}
                      className={cn(
                        "h-9 w-9 shrink-0 rounded-lg transition-all duration-[500ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                        on ? "scale-110 rounded-xl" : "opacity-55 grayscale",
                      )}
                    />
                    <span
                      className={cn(
                        "display flex-1 text-[clamp(1.35rem,2.6vw,2.1rem)] transition-all duration-[500ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                        on ? "translate-x-1 text-paper-50" : "text-paper-400",
                      )}
                    >
                      {mat.name}
                    </span>
                    <span
                      className={cn(
                        "data hidden text-[0.625rem] tracking-[0.14em] uppercase transition-colors sm:block",
                        on ? "text-pigment" : "text-paper-400/60",
                      )}
                    >
                      {mat.unit}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}
