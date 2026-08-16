import { cn } from "@/lib/utils";

/**
 * The Rachna mark: two material swatches, overlapped.
 *
 * Why this mark — the product is about the overlap. What the customer wants
 * (one swatch) against what the dealer can actually produce today (the other).
 * The bright intersection is the recommendation. It is also, literally, a
 * picture of a ΔE colour comparison, which is the maths underneath.
 *
 * It survives 16px, survives one colour, and is not a gradient blob.
 */
export function LogoMark({
  className,
  monochrome = false,
}: {
  className?: string;
  monochrome?: boolean;
}) {
  const a = monochrome ? "currentColor" : "var(--color-pigment)";
  const b = monochrome ? "currentColor" : "var(--color-glaze)";
  const overlap = monochrome ? "var(--color-ink-900)" : "var(--color-paper-50)";

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-6 w-6", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask id="rachna-swatch-a">
          <rect x="2" y="2" width="13" height="13" rx="3.6" fill="#fff" />
        </mask>
      </defs>
      <rect x="2" y="2" width="13" height="13" rx="3.6" fill={a} opacity={monochrome ? 0.55 : 1} />
      <rect x="9" y="9" width="13" height="13" rx="3.6" fill={b} opacity={monochrome ? 0.8 : 1} />
      <g mask="url(#rachna-swatch-a)">
        <rect x="9" y="9" width="13" height="13" rx="3.6" fill={overlap} />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-baseline gap-[0.3em] leading-none", className)}>
      <span className="display text-[1.15em] tracking-[-0.03em]">Rachna</span>
      <span className="data text-[0.5em] tracking-[0.22em] text-paper-300 uppercase">AI</span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5 text-paper-50", className)}>
      <LogoMark className="h-[1.35em] w-[1.35em]" />
      <Wordmark />
    </span>
  );
}
