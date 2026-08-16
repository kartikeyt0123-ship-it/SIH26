import { cn } from "@/lib/utils";

export function Pill({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "pigment" | "glaze" | "muted";
}) {
  const tones = {
    neutral:
      "border-[color-mix(in_oklab,var(--color-paper-200)_20%,transparent)] text-paper-200",
    pigment:
      "border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] text-pigment-soft bg-[color-mix(in_oklab,var(--color-pigment)_10%,transparent)]",
    glaze:
      "border-[color-mix(in_oklab,var(--color-glaze)_50%,transparent)] text-[#5fbfb3] bg-[color-mix(in_oklab,var(--color-glaze)_12%,transparent)]",
    muted: "border-transparent bg-ink-700 text-paper-400",
  };
  return (
    <span
      className={cn(
        "data inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.6875rem] tracking-[0.1em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Rule({ className }: { className?: string }) {
  return (
    <hr
      className={cn(
        "h-px w-full border-0 bg-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)]",
        className,
      )}
    />
  );
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  align = "left",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-3xl flex-col gap-5",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      <span className="eyebrow flex items-center gap-2.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-pigment" />
        {eyebrow}
      </span>
      <h2 className="display text-[clamp(2.1rem,4.4vw,3.6rem)]">{title}</h2>
      {lede && <p className="lede max-w-2xl">{lede}</p>}
    </div>
  );
}

/** Frames a whole page section with consistent gutters and vertical rhythm. */
export function Section({
  id,
  children,
  className,
  tight = false,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  tight?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative w-full px-6 sm:px-10 lg:px-16",
        tight ? "py-20 sm:py-24" : "py-28 sm:py-36 lg:py-44",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[78rem]">{children}</div>
    </section>
  );
}
