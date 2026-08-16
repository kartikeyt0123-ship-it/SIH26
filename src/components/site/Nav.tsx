"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "How it works", href: "#story" },
  { label: "Dealer console", href: "#dealer" },
  { label: "Materials", href: "#materials" },
  { label: "Dashboard demo", href: "/dashboard" },
];

export function Nav() {
  const [condensed, setCondensed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        condensed ? "py-2.5" : "py-5",
      )}
    >
      <div className="mx-auto w-full max-w-[78rem] px-6 sm:px-10 lg:px-16">
        <div
          className={cn(
            "flex items-center justify-between gap-6 rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            condensed
              ? "border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_72%,transparent)] px-4 py-2 backdrop-blur-xl"
              : "border border-transparent px-0 py-1",
          )}
        >
          <a href="#top" className="text-[1.05rem]">
            <Logo />
            <span className="sr-only">Rachna AI — home</span>
          </a>

          <nav className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="group relative text-[0.875rem] text-paper-300 transition-colors duration-200 hover:text-paper-50"
              >
                {l.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-pigment transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button href="/login" size="sm" className="hidden sm:inline-flex">
              Dealer login
            </Button>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Menu"
              aria-expanded={open}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] md:hidden"
            >
              <span className="relative block h-2.5 w-4">
                <span
                  className={cn(
                    "absolute left-0 h-px w-full bg-paper-50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    open ? "top-1/2 rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 h-px w-full bg-paper-50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    open ? "top-1/2 -rotate-45" : "top-full",
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        {/* mobile sheet — height transition only, no layout thrash */}
        <div
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden",
            open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0">
            <div className="flex flex-col gap-1 rounded-3xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_88%,transparent)] p-3 backdrop-blur-xl">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-4 py-3 text-[0.95rem] text-paper-200 transition-colors hover:bg-ink-700 hover:text-paper-50"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
