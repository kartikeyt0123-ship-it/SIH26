"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

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
  const [busy, setBusy] = useState(false);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length < 5) return setError("That code looks too short.");

    // Validated against the server, not against anything in this browser — the
    // customer's phone has never seen this dealer's data before.
    setBusy(true);
    try {
      const res = await fetch(`/api/sessions/${c}`, { cache: "no-store" });
      if (res.status === 410) {
        setError("That link has expired. Ask your dealer for a new one.");
        return;
      }
      if (!res.ok) {
        setError("We could not find that code. Check it with your dealer.");
        return;
      }
      router.push(`/c/${c}`);
    } catch {
      setError("Could not reach Rachna. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
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
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11));
            setError("");
          }}
          placeholder="7XK92A8FQ21"
          autoFocus
          className="data mt-7 w-full rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] bg-transparent px-5 py-4 text-center text-[1.35rem] tracking-[0.28em] text-paper-50 uppercase outline-none transition-colors placeholder:text-paper-400/50 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
        />

        {error && <p className="mt-3 text-[0.8125rem] text-pigment-soft">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-12 w-full rounded-full bg-paper-50 text-[0.9375rem] font-medium text-ink-900 transition-transform duration-200 hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? "Checking…" : "Open my session"}
        </button>
      </form>
    </main>
  );
}
