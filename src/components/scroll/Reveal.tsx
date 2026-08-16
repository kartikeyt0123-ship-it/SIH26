"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Enter choreography, via IntersectionObserver rather than a ScrollTrigger per
 * element. Hundreds of ScrollTriggers is hundreds of layout reads on refresh;
 * IO costs nothing and this is a one-shot reveal, not a scrubbed animation.
 *
 * The animated properties live in CSS (see [data-reveal] in globals.css) so a
 * no-JS or reduced-motion render still shows finished content.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  amount = 0.25,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  amount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-shown", "true");
          io.disconnect();
        }
      },
      { threshold: amount, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount]);

  return (
    <div
      ref={ref}
      data-reveal=""
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      className={cn(className)}
    >
      {children}
    </div>
  );
}

/**
 * A headline that reveals line by line from behind a mask. Lines are authored
 * explicitly rather than measured at runtime — runtime line-splitting reflows
 * on font load and causes the exact jump it is trying to look smooth about.
 */
export function RevealLines({
  lines,
  className,
  lineClassName,
  delay = 0,
  step = 90,
}: {
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  step?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-shown", "true");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn(className)}>
      {lines.map((line, i) => (
        <span key={i} className={cn("split-line", lineClassName)}>
          <span style={{ "--reveal-delay": `${delay + i * step}ms` } as React.CSSProperties}>
            {line}
          </span>
        </span>
      ))}
    </div>
  );
}
