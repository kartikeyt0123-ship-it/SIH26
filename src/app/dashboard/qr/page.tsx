"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Copy, Check, Download, ExternalLink, Share2, Trash2 } from "lucide-react";
import { Bar, PageHead, Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import {
  formatRemaining,
  issueSession,
  revokeSession,
  useDealerSessions,
  type IssuedSession,
} from "@/lib/store";
import { SESSION_LABEL } from "@/lib/session-types";
import { cn } from "@/lib/utils";

/**
 * Issue a customer link (§5).
 *
 * The QR is generated on the server against NEXT_PUBLIC_APP_URL and is a real,
 * scannable symbol — not a decorative block. If that origin is not publicly
 * reachable the screen says so loudly, because the failure mode otherwise is a
 * dealer printing a code that dies the moment a customer scans it on mobile
 * data.
 */
export default function QrPage() {
  const { sessions, ready, origin, publicReachable, refresh } = useDealerSessions();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState(72);
  const [issued, setIssued] = useState<IssuedSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is on screen anyway */
    }
  };

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await issueSession({ customerName: name, phone, validityHours: hours });
      setIssued(r);
      setName("");
      setPhone("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    await revokeSession(token);
    if (issued?.session.token === token) setIssued(null);
    refresh();
  };

  const live = sessions.filter((s) => !s.expired).length;

  return (
    <>
      <PageHead
        eyebrow="Customer links"
        title="Hand them a code. Get back a design."
        lede="The customer scans, answers a few questions, photographs the room, sees it rebuilt in 3D and picks a combination you can actually supply. The finished scheme lands in your Customers tab."
      />

      {!publicReachable && ready && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--color-brass)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_9%,transparent)] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#e0bd72]" strokeWidth={1.8} />
          <div className="text-[0.8125rem] leading-relaxed text-paper-200">
            <p className="text-paper-50">This QR will only work on this machine.</p>
            <p className="mt-1">
              Codes are being generated against{" "}
              <span className="data text-paper-100">{origin}</span>, which a customer&rsquo;s phone
              cannot reach. Start a tunnel and set{" "}
              <span className="data text-paper-100">NEXT_PUBLIC_APP_URL</span> in{" "}
              <span className="data text-paper-100">.env.local</span> before handing a code to
              anyone.
            </p>
            <p className="data mt-2 text-[0.6875rem] text-paper-400">npm run tunnel</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Panel>
          <PanelHead title="Issue a new link" />

          {issued ? (
            <div className="flex flex-col items-center gap-5">
              <div className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] bg-paper-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={issued.qr} alt={`QR code for ${issued.url}`} className="h-52 w-52" />
              </div>

              <div className="text-center">
                <p className="data text-[1.35rem] tracking-[0.24em] text-paper-50">
                  {issued.session.token}
                </p>
                <p className="mt-1.5 text-[0.8125rem] text-paper-200">
                  {issued.session.customerName}
                </p>
                <p className="data mt-1 break-all text-[0.625rem] tracking-[0.04em] text-paper-400">
                  {issued.url}
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
                <a
                  href={issued.qr}
                  download={`rachna-${issued.session.token}.png`}
                  className="flex h-10 items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-4 text-[0.8125rem] text-paper-100"
                >
                  <Download className="h-4 w-4" strokeWidth={1.7} />
                </a>
                <Link
                  href={`/c/${issued.session.token}`}
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
                disabled={busy}
                className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-paper-50 text-[0.9375rem] font-medium text-ink-900 transition-transform duration-200 hover:-translate-y-px disabled:opacity-50"
              >
                <Share2 className="h-4 w-4" strokeWidth={1.8} />
                {busy ? "Creating…" : "Issue link"}
              </button>

              {error && <p className="text-[0.8125rem] text-pigment-soft">{error}</p>}

              <p className="text-[0.75rem] leading-relaxed text-paper-400">
                Each code is unique to one customer, belongs to this shop only, and stops
                working when it expires.
              </p>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHead
              title="What the customer gets"
              sub="Five steps, on their own phone, on their own room."
            />
            <ol className="grid gap-3 sm:grid-cols-2">
              {[
                ["Answer", "Paint type, damp, budget, brand — all drawn from your catalogue."],
                ["Photograph", "Two or three pictures of the room, uploaded to your account."],
                ["Rebuild", "The room comes back as 3D geometry they can look around."],
                ["Compose", "Combinations built from your live stock. Nothing you cannot supply."],
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
                sub={ready ? `${live} live · updates as customers work` : "Loading…"}
              />
            </div>
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {sessions.map((s) => {
                const total = (new Date(s.expiresAt).getTime() - new Date(s.createdAt).getTime()) / 3_600_000;
                const pct = (s.hoursLeft / total) * 100;
                const tone = pct < 25 ? "critical" : pct < 50 ? "low" : "healthy";
                const tag =
                  s.status === "SUBMITTED" ? "won" : s.expired ? "expired" : s.status === "IN_PROGRESS" ? "used" : "active";
                return (
                  <div
                    key={s.token}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[7rem_minmax(0,1fr)_9rem_auto_auto] sm:px-6"
                  >
                    <Link
                      href={`/c/${s.token}`}
                      target="_blank"
                      className="data truncate text-[0.75rem] tracking-[0.12em] text-paper-50 underline-offset-4 hover:underline"
                    >
                      {s.token}
                    </Link>
                    <div className="min-w-0">
                      <p className="truncate text-[0.875rem] text-paper-100">{s.customerName}</p>
                      <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                        {s.opens} opens · step {Math.min((s.project?.step ?? 0) + 1, 6)} of 6 ·{" "}
                        {s.project?.images.length ?? 0} photos ·{" "}
                        {s.project?.savedDesigns.length ?? 0} saved
                      </p>
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <div className="flex items-baseline justify-between">
                        <span className="data text-[0.625rem] text-paper-400">expires</span>
                        <span className="data text-[0.6875rem] text-paper-200">
                          {formatRemaining(s.hoursLeft)}
                        </span>
                      </div>
                      <Bar pct={pct} tone={tone} className="mt-1.5" />
                    </div>
                    <button
                      onClick={() => revoke(s.token)}
                      aria-label={`Revoke ${s.token}`}
                      className="hidden text-paper-400 transition-colors hover:text-pigment-soft sm:block"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                    </button>
                    <Tag status={tag as "active" | "used" | "expired" | "won"}>
                      {SESSION_LABEL[s.status] ?? s.status}
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
