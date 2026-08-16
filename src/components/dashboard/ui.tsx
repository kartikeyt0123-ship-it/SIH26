import { CATEGORY_SWATCH, type MaterialType } from "@/lib/demo";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)] bg-ink-800/60",
        pad && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[0.9375rem] text-paper-50">{title}</h2>
        {sub && <p className="mt-1 text-[0.8125rem] text-paper-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "up" | "down";
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="data mt-2 text-[clamp(1.4rem,2.4vw,1.9rem)] text-paper-50">{value}</p>
      {note && (
        <p
          className={cn(
            "mt-1.5 text-[0.75rem]",
            tone === "up" && "text-[#5fbfb3]",
            tone === "down" && "text-pigment-soft",
            tone === "neutral" && "text-paper-400",
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

/** Category identity is carried by its swatch everywhere it appears. */
export function CategoryChip({
  type,
  className,
  showLabel = true,
}: {
  type: MaterialType;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        style={{ background: CATEGORY_SWATCH[type] }}
        className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
      />
      {showLabel && <span className="text-[0.8125rem] text-paper-200">{type}</span>}
    </span>
  );
}

const STATUS_STYLE = {
  critical: "border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft",
  low: "border-[color-mix(in_oklab,var(--color-brass)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_12%,transparent)] text-[#e0bd72]",
  healthy: "border-[color-mix(in_oklab,var(--color-glaze)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-glaze)_12%,transparent)] text-[#5fbfb3]",
  overstocked: "border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-paper-300",
  new: "border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft",
  quoted: "border-[color-mix(in_oklab,var(--color-brass)_40%,transparent)] text-[#e0bd72]",
  won: "border-[color-mix(in_oklab,var(--color-glaze)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-glaze)_12%,transparent)] text-[#5fbfb3]",
  lost: "border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] text-paper-400",
  active: "border-[color-mix(in_oklab,var(--color-glaze)_45%,transparent)] text-[#5fbfb3]",
  used: "border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-paper-200",
  expired: "border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] text-paper-400",
} as const;

export function Tag({
  status,
  children,
}: {
  status: keyof typeof STATUS_STYLE;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "data inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.625rem] tracking-[0.12em] uppercase",
        STATUS_STYLE[status],
      )}
    >
      {children ?? status}
    </span>
  );
}

export function Bar({
  pct,
  tone = "healthy",
  className,
}: {
  pct: number;
  tone?: "critical" | "low" | "healthy";
  className?: string;
}) {
  const colour =
    tone === "critical" ? "bg-pigment" : tone === "low" ? "bg-brass" : "bg-[#5fbfb3]";
  return (
    <span className={cn("block h-1.5 overflow-hidden rounded-full bg-ink-700", className)}>
      <span
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        className={cn(
          "block h-full rounded-full transition-[width] duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
          colour,
        )}
      />
    </span>
  );
}

export function PageHead({
  eyebrow,
  title,
  lede,
  right,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <span className="eyebrow flex items-center gap-2.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-pigment" />
          {eyebrow}
        </span>
        <h1 className="display mt-3 text-[clamp(1.9rem,3.4vw,2.8rem)]">{title}</h1>
        {lede && <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-paper-400">{lede}</p>}
      </div>
      {right}
    </header>
  );
}
