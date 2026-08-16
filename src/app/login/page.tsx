"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { DEALER } from "@/lib/demo";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Colour-centric sign-in.
 *
 * The left half is the product's subject matter: a live mosaic of finishes that
 * recomposes itself every few seconds. It is the only decoration on the page,
 * and it is decoration that means something — this is what the dealer sells.
 *
 * Cheap by construction: one tile changes at a time, the transition is CSS, and
 * the whole thing stops under prefers-reduced-motion.
 */

const PALETTE = [
  "#efe7d8", "#e7dbc4", "#dcc9a6", "#c9a97b", "#b98a57", "#9c6a45",
  "#8d5138", "#a9543c", "#c96f4a", "#e2542a", "#d98f6a", "#efc9a8",
  "#cfd3c4", "#b3bda9", "#8f9c86", "#6f8071", "#4f6a63", "#1a736a",
  "#7f8fa6", "#5e7391", "#3b4f9e", "#2b3550", "#4a4a52", "#c79a45",
];

const COLS = 6;
const ROWS = 9;

export default function LoginPage() {
  const router = useRouter();
  const [tiles, setTiles] = useState<number[]>(() =>
    Array.from({ length: COLS * ROWS }, (_, i) => (i * 7) % PALETTE.length),
  );
  const [phone, setPhone] = useState("98765 43210");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => {
      setTiles((prev) => {
        const next = [...prev];
        // Recompose a small cluster rather than one lone tile — a single
        // changing square reads as a glitch, a cluster reads as a scheme.
        const seed = Math.floor(Math.random() * next.length);
        for (const off of [0, 1, COLS, COLS + 1]) {
          const i = (seed + off) % next.length;
          next[i] = Math.floor(Math.random() * PALETTE.length);
        }
        return next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const accent = useMemo(() => PALETTE[tiles[Math.floor(tiles.length / 2)]], [tiles]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stage === "phone") {
      setStage("otp");
      setOtp("");
      return;
    }
    setBusy(true);
    // Demo build: no auth service is wired up. This is where the Supabase
    // phone-OTP verification call belongs.
    setTimeout(() => router.push("/dashboard"), 550);
  };

  return (
    <main className="grid min-h-[100svh] lg:grid-cols-[1.05fr_1fr]">
      {/* ---------------- colour half ---------------- */}
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

      {/* ---------------- form half ---------------- */}
      <div className="relative flex flex-col justify-center px-6 py-14 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-12 inline-block text-[1.05rem] lg:hidden">
            <Logo />
          </Link>

          <span className="eyebrow flex items-center gap-2.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full transition-colors duration-700"
              style={{ background: accent }}
            />
            Dealer sign in
          </span>
          <h1 className="display mt-4 text-[2.4rem]">Welcome back.</h1>
          <p className="mt-3 text-[0.9375rem] text-paper-400">
            {stage === "phone"
              ? "We send a one-time code to the number registered to your shop."
              : `Code sent to +91 ${phone}. Any six digits work in this demo.`}
          </p>

          <form onSubmit={submit} className="mt-9 flex flex-col gap-4">
            {stage === "phone" ? (
              <Field label="Registered mobile">
                <span className="data pl-4 text-[0.9375rem] text-paper-400">+91</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoFocus
                  className="data w-full bg-transparent py-3.5 pr-4 pl-2 text-[0.9375rem] text-paper-50 outline-none placeholder:text-paper-400"
                  placeholder="98765 43210"
                />
              </Field>
            ) : (
              <Field label="One-time code">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                  className="data w-full bg-transparent px-4 py-3.5 text-[1.1rem] tracking-[0.5em] text-paper-50 outline-none placeholder:tracking-[0.5em] placeholder:text-paper-400"
                  placeholder="••••••"
                />
              </Field>
            )}

            <Button
              type="submit"
              className={cn("mt-2 w-full", busy && "pointer-events-none opacity-70")}
            >
              {busy ? "Signing in…" : stage === "phone" ? "Send code" : "Enter console"}
            </Button>

            {stage === "otp" && (
              <button
                type="button"
                onClick={() => setStage("phone")}
                className="text-[0.8125rem] text-paper-400 transition-colors hover:text-paper-50"
              >
                Change number
              </button>
            )}
          </form>

          <div className="mt-10 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-4">
            <p className="eyebrow">Demo account</p>
            <p className="mt-2 text-[0.875rem] text-paper-200">
              {DEALER.name} · {DEALER.city}
            </p>
            <p className="mt-1 text-[0.75rem] text-paper-400">
              No credentials are checked. Any number and any code open the console.
            </p>
          </div>

          <p className="mt-8 text-[0.75rem] text-paper-400">
            Not a dealer yet?{" "}
            <Link href="/#cta" className="text-paper-100 underline underline-offset-4">
              Ask for a counter walkthrough
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-2 flex items-center rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] transition-colors duration-200 focus-within:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]">
        {children}
      </span>
    </label>
  );
}
