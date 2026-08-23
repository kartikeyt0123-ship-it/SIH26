"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthShell, Field, Notice, inputClass } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

/**
 * Dealer sign-up.
 *
 * Three steps, in the order that lets someone abandon cheaply: prove the number
 * first, then the shop details, then a password. Asking for a password before
 * the number is verified means anyone can burn a phone number they do not own.
 *
 * The city matters more than it looks. It is geocoded at sign-up and the
 * coordinates stored, which is what turns the weather panel from a table of
 * monthly averages into a live reading for this dealer's actual location — and
 * it is why the field asks for a city rather than a free-text address.
 */

type Step = "phone" | "code" | "details";

export default function SignupPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ channel: string; code?: string; message: string } | null>(null);

  const [shopName, setShopName] = useState("");
  const [owner, setOwner] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [password, setPassword] = useState("");

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

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      setSent(await post("/api/auth/otp", { phone, purpose: "signup" }));
      setStep("code");
    });

  // The code is not verified on its own request. It is checked once, inside
  // the sign-up call, so there is exactly one place a code can be consumed —
  // and a verified-then-abandoned code cannot be replayed.
  const goDetails = () => {
    if (code.length !== 6) {
      setError("Enter the six-digit code.");
      return;
    }
    setError(null);
    setStep("details");
  };

  const createAccount = () =>
    run(async () => {
      await post("/api/auth/signup", {
        phone,
        code,
        password,
        shopName,
        owner,
        city,
        pincode,
      });
      window.location.href = "/dashboard";
    });

  return (
    <AuthShell
      eyebrow="Create a dealer account"
      title="Open your counter."
      lede={
        step === "phone"
          ? "Start with the mobile number your shop runs on. It becomes your sign-in."
          : step === "code"
            ? "Enter the six-digit code to prove the number is yours."
            : "Tell us about the shop. The city sets your live weather and seasonal advice."
      }
      footer={
        <p className="mt-8 text-[0.8125rem] text-paper-400">
          Already registered?{" "}
          <Link href="/login" className="text-paper-100 underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <Steps step={step} />

      <div className="mt-6 flex flex-col gap-4">
        {step === "phone" && (
          <>
            <Field label="Shop mobile number">
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
            {error && <Notice tone="error">{error}</Notice>}
            <Button
              onClick={requestCode}
              className={cn("w-full", busy && "pointer-events-none opacity-70")}
            >
              {busy ? "Sending…" : "Send verification code"}
            </Button>
          </>
        )}

        {step === "code" && (
          <>
            <Field label="Verification code">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoFocus
                className="data w-full bg-transparent px-4 py-3.5 text-[1.1rem] tracking-[0.5em] text-paper-50 outline-none placeholder:tracking-[0.5em] placeholder:text-paper-400"
                placeholder="••••••"
              />
            </Field>

            {sent && (
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
            )}

            {error && <Notice tone="error">{error}</Notice>}

            <Button onClick={goDetails} className="w-full">
              Continue
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setSent(null);
                setError(null);
              }}
              className="text-[0.8125rem] text-paper-400 transition-colors hover:text-paper-50"
            >
              Change number
            </button>
          </>
        )}

        {step === "details" && (
          <>
            <Field label="Shop name">
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                autoFocus
                className={inputClass}
                placeholder="Sharma Interiors & Hardware"
              />
            </Field>

            <Field label="Owner's name">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className={inputClass}
                placeholder="Rakesh Sharma"
              />
            </Field>

            <Field
              label="City"
              hint="Used for live weather and seasonal product advice at your location."
            >
              <span className="pl-4 text-paper-400">
                <MapPin className="h-4 w-4" strokeWidth={1.7} />
              </span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-transparent py-3.5 pr-4 pl-2 text-[0.9375rem] text-paper-50 outline-none placeholder:text-paper-400"
                placeholder="Kanpur"
              />
            </Field>

            <Field label="Pincode (optional)">
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                className={cn(inputClass, "data")}
                placeholder="208011"
              />
            </Field>

            <Field label="Password" hint="At least six characters.">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
              />
            </Field>

            {error && <Notice tone="error">{error}</Notice>}

            <Button
              onClick={createAccount}
              className={cn("w-full", busy && "pointer-events-none opacity-70")}
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Creating your shop…
                </span>
              ) : (
                "Create account & open console"
              )}
            </Button>

            <p className="text-[0.75rem] leading-relaxed text-paper-400">
              Your shop opens with the standard paint catalogue at nominal stock levels so the
              console works from the first minute. Correct them on the Inventory screen, or import
              from Tally.
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function Steps({ step }: { step: Step }) {
  const order: Step[] = ["phone", "code", "details"];
  const labels: Record<Step, string> = { phone: "Number", code: "Verify", details: "Shop" };
  const at = order.indexOf(step);

  return (
    <div className="mt-8 flex items-center gap-2">
      {order.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "data flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] transition-colors",
              i < at
                ? "bg-[color-mix(in_oklab,var(--color-glaze)_20%,transparent)] text-[#5fbfb3]"
                : i === at
                  ? "bg-pigment text-white"
                  : "bg-ink-700 text-paper-400",
            )}
          >
            {i < at ? <Check className="h-3 w-3" strokeWidth={2.6} /> : i + 1}
          </span>
          <span
            className={cn(
              "text-[0.75rem]",
              i === at ? "text-paper-100" : "text-paper-400",
            )}
          >
            {labels[s]}
          </span>
          {i < order.length - 1 && (
            <span className="h-px flex-1 bg-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)]" />
          )}
        </div>
      ))}
    </div>
  );
}
