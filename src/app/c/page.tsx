"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getSession } from "@/lib/store";

/**
 * Code entry.
 *
 * The link the dealer sends goes straight to /c/CODE, so this page only exists
 * for the customer who has the code written on a slip and is typing it in.
 * The alphabet has no O/0 or I/1 precisely because of this screen.
 */
export default function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setError("That code looks too short.");
    const s = getSession(c);
    if (!s) return setError("We could not find that code. Check it with your dealer.");
    router.push(`/c/${c}`);
  };

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center px-6">
      <Link href="/" className="mb-12 text-[1.1rem]">
        <Logo />
      </Link>

      <form onSubmit={go} className="w-full max-w-sm">
        <span className="eyebrow">Your design session</span>
        <h1 className="display mt-3 text-[2.2rem]">Enter your code.</h1>
        <p className="mt-3 text-[0.9375rem] text-paper-400">
          Your dealer gave you a five-character code. It stays open for up to three days.
        </p>

        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 6));
            setError("");
          }}
          placeholder="7XK92"
          autoFocus
          className="data mt-7 w-full rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] bg-transparent px-5 py-4 text-center text-[1.6rem] tracking-[0.4em] text-paper-50 uppercase outline-none transition-colors placeholder:text-paper-400/50 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
        />

        {error && <p className="mt-3 text-[0.8125rem] text-pigment-soft">{error}</p>}

        <button
          type="submit"
          className="mt-5 h-12 w-full rounded-full bg-paper-50 text-[0.9375rem] font-medium text-ink-900 transition-transform duration-200 hover:-translate-y-px"
        >
          Open my session
        </button>
      </form>
    </main>
  );
}
