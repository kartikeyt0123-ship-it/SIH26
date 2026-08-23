"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Shared frame for sign-in and sign-up.
 *
 * The left half is the product's subject matter: a live mosaic of finishes that
 * recomposes itself every few seconds. It is the only decoration on either
 * page, and it is decoration that means something — this is what the dealer
 * sells. Cheap by construction: one cluster changes at a time, the transition
 * is CSS, and the whole thing stops under prefers-reduced-motion.
 */

const PALETTE = [
  "#efe7d8", "#e7dbc4", "#dcc9a6", "#c9a97b", "#b98a57", "#9c6a45",
  "#8d5138", "#a9543c", "#c96f4a", "#e2542a", "#d98f6a", "#efc9a8",
  "#cfd3c4", "#b3bda9", "#8f9c86", "#6f8071", "#4f6a63", "#1a736a",
  "#7f8fa6", "#5e7391", "#3b4f9e", "#2b3550", "#4a4a52", "#c79a45",
];

const COLS = 6;
const ROWS = 9;

export function AuthShell({
  eyebrow,
  title,
  lede,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [tiles, setTiles] = useState<number[]>(() =>
    Array.from({ length: COLS * ROWS }, (_, i) => (i * 7) % PALETTE.length),
  );

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setTiles((prev) => {
        const next = [...prev];
        // A cluster, not a lone tile: one changing square reads as a glitch,
        // a cluster reads as a scheme.
        const seed = Math.floor(Math.random() * next.length);
        for (const off of [0, 1, COLS, COLS + 1]) {
          next[(seed + off) % next.length] = Math.floor(Math.random() * PALETTE.length);
        }
        return next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const accent = useMemo(() => PALETTE[tiles[Math.floor(tiles.length / 2)]], [tiles]);

  return (
    <main className="grid min-h-[100svh] lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink-800 lg:block">
        <div
          className="absolute inset-0 grid gap-1.5 p-1.5"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          }}
          aria-hidden="true"
        >
          {tiles.map((t, i) => (
            <span
              key={i}
              style={{ background: PALETTE[t], transitionDelay: `${(i % COLS) * 24}ms` }}
              className="rounded-lg transition-colors duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(8,9,11,0.1),rgba(8,9,11,0.82))]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/" className="w-fit text-[1.1rem]">
            <Logo />
          </Link>
          <div>
            <p className="display max-w-md text-[clamp(2.2rem,3.2vw,3.2rem)]">
              Every finish you stock, on their walls, before they leave.
            </p>
            <p className="data mt-6 text-[0.6875rem] tracking-[0.16em] text-paper-300 uppercase">
              Rachna AI · dealer console
            </p>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col justify-center px-6 py-14 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block text-[1.05rem] lg:hidden">
            <Logo />
          </Link>

          <span className="eyebrow flex items-center gap-2.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full transition-colors duration-700"
              style={{ background: accent }}
            />
            {eyebrow}
          </span>
          <h1 className="display mt-4 text-[2.4rem]">{title}</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-paper-400">{lede}</p>

          {children}

          {footer}
        </div>
      </div>
    </main>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-2 flex items-center rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] transition-colors duration-200 focus-within:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]">
        {children}
      </span>
      {hint && <span className="mt-1.5 block text-[0.75rem] text-paper-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full bg-transparent px-4 py-3.5 text-[0.9375rem] text-paper-50 outline-none placeholder:text-paper-400";

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "info";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed",
        tone === "error"
          ? "border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_8%,transparent)] text-paper-100"
          : "border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] text-[#e0bd72]",
      )}
    >
      {children}
    </p>
  );
}
