"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { AuthShell, Field, Notice, inputClass } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

/**
 * Dealer sign-in — password, or a one-time code for anyone who has forgotten it.
 *
 * Both routes are real: they post to `/api/auth/login`, which checks a scrypt
 * hash or a hashed OTP and sets a signed, httpOnly cookie. Nothing here decides
 * whether the dealer is admitted; the server does, and this screen only reports
 * what it said.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Middleware sends the intended path along, so signing in lands the dealer
  // where they were going rather than dumping them on the overview.
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<"password" | "otp">("password");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ channel: string; code?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message ?? "Something went wrong.");
    return json;
  };

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await post("/api/auth/otp", { phone, purpose: "login" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/login", {
        phone,
        mode,
        ...(mode === "password" ? { password } : { code }),
      });
      // A full navigation, not router.push: the console reads the new cookie
      // on the server, and a client-side transition can render against the
      // pre-login cache.
      window.location.href = next;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Dealer sign in"
      title="Welcome back."
      lede={
        mode === "password"
          ? "Your shop's registered mobile number and password."
          : "We will send a one-time code to your registered number."
      }
      footer={
        <p className="mt-8 text-[0.8125rem] text-paper-400">
          New to Rachna?{" "}
          <Link href="/signup" className="text-paper-100 underline underline-offset-4">
            Create a dealer account
          </Link>
        </p>
      }
    >
      <div className="mt-8 flex gap-1 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] p-1">
        {(["password", "otp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              "flex-1 rounded-lg py-2 text-[0.8125rem] transition-colors",
              mode === m ? "bg-ink-700 text-paper-50" : "text-paper-400 hover:text-paper-100",
            )}
          >
            {m === "password" ? "Password" : "One-time code"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
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

        {mode === "password" ? (
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </Field>
        ) : (
          <>
            {!sent ? (
              <Button
                type="button"
                onClick={requestCode}
                className={cn("w-full", busy && "pointer-events-none opacity-70")}
              >
                {busy ? "Sending…" : "Send me a code"}
              </Button>
            ) : (
              <>
                <Field label="One-time code">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoFocus
                    className="data w-full bg-transparent px-4 py-3.5 text-[1.1rem] tracking-[0.5em] text-paper-50 outline-none placeholder:tracking-[0.5em] placeholder:text-paper-400"
                    placeholder="••••••"
                  />
                </Field>
                {/* When no SMS gateway is configured the code is shown here and
                    said to be undelivered — never "sent to your phone". */}
                <Notice tone="info">
                  {sent.message}
                  {sent.code && (
                    <>
                      {" "}
                      <span className="data text-[1rem] tracking-[0.3em] text-paper-50">
                        {sent.code}
                      </span>
                    </>
                  )}
                </Notice>
              </>
            )}
          </>
        )}

        {error && <Notice tone="error">{error}</Notice>}

        {(mode === "password" || sent) && (
          <Button type="submit" className={cn("mt-1 w-full", busy && "pointer-events-none opacity-70")}>
            {busy ? "Signing in…" : "Enter console"}
          </Button>
        )}
      </form>

      <div className="mt-9 rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-4">
        <p className="eyebrow">Demo account</p>
        <p className="mt-2 text-[0.875rem] text-paper-200">
          Sharma Interiors &amp; Hardware · Kanpur
        </p>
        <p className="data mt-2 text-[0.8125rem] text-paper-100">
          98765 43210 · rachna123
        </p>
        <button
          type="button"
          onClick={() => {
            setMode("password");
            setPhone("9876543210");
            setPassword("rachna123");
          }}
          className="mt-3 text-[0.75rem] text-paper-400 underline underline-offset-4 transition-colors hover:text-paper-100"
        >
          Fill these in
        </button>
      </div>
    </AuthShell>
  );
}
