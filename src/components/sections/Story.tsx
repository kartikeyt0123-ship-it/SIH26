"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BEATS, setInView, setProgress, useBeat } from "@/lib/story";
import { cn } from "@/lib/utils";

/**
 * The pinned narrative.
 *
 * Pinning is done with position: sticky inside a tall section rather than with
 * ScrollTrigger's pin. Sticky needs no spacer element, survives resize and font
 * load without a refresh, and cannot desynchronise from the scrollbar. GSAP is
 * used only to report progress into the shared story timeline, which the WebGL
 * scene reads.
 */
export function Story() {
  const section = useRef<HTMLElement>(null);
  const beat = useBeat();

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => setProgress(self.progress),
      onToggle: (self) => setInView(self.isActive),
    });

    return () => st.kill();
  }, []);

  return (
    <section
      id="story"
      ref={section}
      className="relative"
      style={{ height: `${BEATS.length * 100}vh` }}
    >
      <div className="sticky top-0 flex h-[100svh] items-end overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(8,9,11,0.92)_0%,rgba(8,9,11,0.1)_26%,rgba(8,9,11,0.1)_52%,rgba(8,9,11,0.94)_100%)]" />

        <div className="relative mx-auto w-full max-w-[78rem] px-6 pb-16 sm:px-10 lg:px-16 lg:pb-24">
          <div className="grid gap-10 lg:grid-cols-[7rem_minmax(0,34rem)] lg:items-end">
            {/* progress spine */}
            <ol className="flex gap-2 lg:flex-col lg:gap-3" aria-hidden="true">
              {BEATS.map((b, i) => (
                <li key={b.id} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "data text-[0.6875rem] transition-colors duration-500",
                      i === beat ? "text-pigment" : "text-paper-400/50",
                    )}
                  >
                    {b.index}
                  </span>
                  <span className="hidden h-px flex-1 overflow-hidden bg-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] lg:block">
                    <span
                      className={cn(
                        "block h-full origin-left bg-pigment transition-transform duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                        i <= beat ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                  </span>
                </li>
              ))}
            </ol>

            {/* the beat copy — crossfaded in place, stacked so nothing reflows */}
            <div className="relative min-h-[19rem] sm:min-h-[17rem]">
              {BEATS.map((b, i) => {
                const shown = i === beat;
                return (
                  <article
                    key={b.id}
                    aria-hidden={!shown}
                    className={cn(
                      "absolute inset-x-0 bottom-0 transition-all duration-[620ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
                      shown
                        ? "pointer-events-auto translate-y-0 opacity-100 blur-0"
                        : "pointer-events-none translate-y-4 opacity-0 blur-[2px]",
                    )}
                  >
                    <span className="eyebrow flex items-center gap-2.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-pigment" />
                      {b.tag}
                    </span>
                    <h3 className="display mt-4 text-[clamp(2rem,4.2vw,3.35rem)]">{b.title}</h3>
                    <p className="lede mt-4 max-w-xl">{b.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
