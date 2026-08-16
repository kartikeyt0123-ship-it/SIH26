import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  variant?: "primary" | "ghost" | "quiet";
  size?: "sm" | "md";
};

/**
 * Hover state moves 1px and 180ms. Anything larger on a button feels like the
 * page is unstable under the cursor; anything slower feels unresponsive.
 */
export function Button({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: Props) {
  const base = cn(
    "group relative inline-flex items-center justify-center gap-2 rounded-full",
    "font-medium tracking-[-0.01em] whitespace-nowrap",
    "transition-[transform,background-color,border-color,color] duration-[180ms] ease-[cubic-bezier(0.165,0.84,0.44,1)]",
    "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-pigment",
    "active:translate-y-px",
    size === "sm" ? "h-9 px-4 text-[0.8125rem]" : "h-11 px-5 text-[0.9375rem]",
  );

  const variants = {
    primary: "bg-paper-50 text-ink-900 hover:-translate-y-px hover:bg-white",
    ghost:
      "border border-[color-mix(in_oklab,var(--color-paper-200)_22%,transparent)] text-paper-50 hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--color-paper-200)_45%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-paper-50)_6%,transparent)]",
    quiet: "text-paper-300 hover:text-paper-50",
  };

  const cls = cn(base, variants[variant], className);

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
