"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Check, ExternalLink, Share2, Trash2 } from "lucide-react";
import { Bar, PageHead, Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import {
  createSession,
  deleteSession,
  formatRemaining,
  hoursLeft,
  useSessions,
  type CustomerSession,
} from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Issue a customer link.
 *
 * One code, one customer, one short window. Short expiry is a feature: it keeps
 * the link tied to a conversation that actually happened at the counter, and it
 * stops old codes circulating on WhatsApp months later against prices and stock
 * that have moved.
 *
 * The code created here is the same record the customer's phone opens and the
 * same record their finished design comes back on — see `lib/store.ts`.
 */
export default function QrPage() {
  const { sessions, ready } = useSessions();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState(72);
  const [issued, setIssued] = useState<CustomerSession | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://rachna.ai";
  const url = issued ? `${origin}/c/${issued.code}` : "";

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is on screen anyway */
    }
  };

  const issue = () => {
    const s = createSession({ customerName: name, phone, validityHours: hours });
    setIssued(s);
    setName("");
    setPhone("");
  };

  const live = sessions.filter((s) => s.status !== "expired").length;

  return (
    <>
      <PageHead
        eyebrow="Customer links"
        title="Hand them a code. Get back a design."
        lede="The customer scans, answers a few questions, photographs the room, sees it rebuilt in 3D and picks a combination you can actually supply. The finished scheme lands in your Customers tab."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Panel>
          <PanelHead title="Issue a new link" />

          {issued ? (
            <div className="flex flex-col items-center gap-5">
              <div className="relative rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] bg-ink-900 p-5">
                <QrPreview code={issued.code} />
                <span className="absolute inset-x-5 top-5 h-px animate-[qrsweep_2.8s_cubic-bezier(0.83,0,0.17,1)_infinite] bg-pigment" />
              </div>

              <div className="text-center">
                <p className="data text-[1.5rem] tracking-[0.3em] text-paper-50">{issued.code}</p>
                <p className="mt-1.5 text-[0.8125rem] text-paper-200">{issued.customerName}</p>
                <p className="data mt-1 text-[0.625rem] tracking-[0.08em] text-paper-400">
                  valid {issued.validityHours} h · {formatRemaining(issued)} left
                </p>
              </div>

              <div className="flex w-full gap-2">
                <button
                  onClick={copy}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-[0.8125rem] text-paper-100 transition-colors hover:border-[color-mix(in_oklab,var(--color-paper-200)_40%,transparent)]"
                >
                  {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.7} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
                <Link
                  href={`/c/${issued.code}`}
                  target="_blank"
                  className="flex h-10 items-center justify-center gap-2 rounded-full bg-paper-50 px-4 text-[0.8125rem] font-medium text-ink-900"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.8} /> Open
                </Link>
              </div>

              <button
                onClick={() => setIssued(null)}
                className="text-[0.8125rem] text-paper-400 transition-colors hover:text-paper-50"
              >
                Issue another
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="eyebrow">Customer name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Meena Verma"
                  className="mt-2 w-full rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent px-4 py-3 text-[0.9375rem] text-paper-50 outline-none transition-colors placeholder:text-paper-400 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
                />
              </label>

              <label className="block">
                <span className="eyebrow">Mobile (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  className="data mt-2 w-full rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent px-4 py-3 text-[0.9375rem] text-paper-50 outline-none transition-colors placeholder:text-paper-400 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
                />
              </label>

              <div>
                <span className="eyebrow">Valid for</span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[48, 60, 72].map((h) => (
                    <button
                      key={h}
                      onClick={() => setHours(h)}
                      className={cn(
                        "rounded-xl border py-2.5 text-[0.8125rem] transition-colors duration-200",
                        hours === h
                          ? "border-transparent bg-paper-50 text-ink-900"
                          : "border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] text-paper-300 hover:text-paper-50",
                      )}
                    >
                      {h} hours
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={issue}
                className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-paper-50 text-[0.9375rem] font-medium text-ink-900 transition-transform duration-200 hover:-translate-y-px"
              >
                <Share2 className="h-4 w-4" strokeWidth={1.8} /> Issue link
              </button>

              <p className="text-[0.75rem] leading-relaxed text-paper-400">
                Each code is unique and dies on expiry. The block shown after issuing is a
                preview — the scannable QR symbol is generated with the real token.
              </p>
            </div>
          )}

          <style>{`@keyframes qrsweep{0%{transform:translateY(0);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateY(140px);opacity:0}}`}</style>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHead
              title="What the customer gets"
              sub="Five steps, on their own phone, on their own room."
            />
            <ol className="grid gap-3 sm:grid-cols-2">
              {[
                ["Answer", "Type of paint, damp, budget, brand, the feeling they want."],
                ["Photograph", "Two or three pictures of the room."],
                ["Rebuild", "The room comes back as 3D geometry they can look around."],
                ["Compose", "Combinations built from your stock — nothing you cannot produce."],
                ["Send", "The scheme and their measurements land in Customers, priced."],
              ].map(([t, b], i) => (
                <li
                  key={t}
                  className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
                >
                  <span className="data text-[0.625rem] tracking-[0.14em] text-pigment">
                    0{i + 1}
                  </span>
                  <p className="mt-2 text-[0.9375rem] text-paper-50">{t}</p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-paper-400">{b}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel pad={false}>
            <div className="p-5 sm:p-6">
              <PanelHead
                title="Issued links"
                sub={ready ? `${live} live · expiry runs against the window you set` : "Loading…"}
              />
            </div>
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {sessions.map((s) => {
                const pct = (hoursLeft(s) / s.validityHours) * 100;
                const tone = pct < 25 ? "critical" : pct < 50 ? "low" : "healthy";
                const tag =
                  s.status === "submitted" || s.status === "quoted"
                    ? "won"
                    : s.status === "expired"
                      ? "expired"
                      : s.status === "in_progress"
                        ? "used"
                        : "active";
                return (
                  <div
                    key={s.code}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[5rem_minmax(0,1fr)_9rem_auto_auto] sm:px-6"
                  >
                    <Link
                      href={`/c/${s.code}`}
                      target="_blank"
                      className="data text-[0.8125rem] tracking-[0.16em] text-paper-50 underline-offset-4 hover:underline"
                    >
                      {s.code}
                    </Link>
                    <div className="min-w-0">
                      <p className="truncate text-[0.875rem] text-paper-100">{s.customerName}</p>
                      <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                        {s.opens} opens · step {Math.min(s.step + 1, 6)} of 6
                        {s.status === "submitted" ? " · design received" : ""}
                      </p>
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <div className="flex items-baseline justify-between">
                        <span className="data text-[0.625rem] text-paper-400">expires</span>
                        <span className="data text-[0.6875rem] text-paper-200">
                          {formatRemaining(s)}
                        </span>
                      </div>
                      <Bar pct={pct} tone={tone} className="mt-1.5" />
                    </div>
                    <button
                      onClick={() => deleteSession(s.code)}
                      aria-label={`Revoke ${s.code}`}
                      className="hidden text-paper-400 transition-colors hover:text-pigment-soft sm:block"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                    <Tag status={tag as "active" | "used" | "expired" | "won"}>
                      {s.status === "submitted" ? "received" : s.status.replace("_", " ")}
                    </Tag>
                  </div>
                );
              })}
              {ready && sessions.length === 0 && (
                <p className="p-6 text-[0.875rem] text-paper-400">
                  No links issued yet. Create one on the left.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * A stylised code block derived from the link code — deterministic, so the same
 * code always draws the same pattern. Labelled as a preview in the UI because it
 * is not a scannable QR symbol; that gets generated with the real token.
 */
function QrPreview({ code }: { code: string }) {
  const cells = useMemo(() => {
    const seed = [...code].reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
    return Array.from({ length: 169 }, (_, i) => {
      const x = i % 13;
      const y = Math.floor(i / 13);
      const finder = (x < 3 && y < 3) || (x > 9 && y < 3) || (x < 3 && y > 9);
      const quiet = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
      if (finder) return true;
      if (quiet) return false;
      const v = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return v - Math.floor(v) > 0.47;
    });
  }, [code]);

  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, 1fr)" }} aria-hidden="true">
      {cells.map((on, i) => (
        <span key={i} className={cn("h-2 w-2 rounded-[1px]", on ? "bg-paper-50" : "bg-transparent")} />
      ))}
    </div>
  );
}
