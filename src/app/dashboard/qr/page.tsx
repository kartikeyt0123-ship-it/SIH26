"use client";

import { useMemo, useState } from "react";
import { Copy, Check, RefreshCw, Share2 } from "lucide-react";
import { Bar, PageHead, Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import { LINKS, type CustomerLink } from "@/lib/demo";
import { cn } from "@/lib/utils";

/**
 * Issue a customer link.
 *
 * One code, one customer, one short window. Short expiry is a feature, not a
 * limitation: it keeps the link tied to a conversation that actually happened
 * at the counter, and it stops old codes circulating on WhatsApp months later
 * against prices that have moved.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, no I/1 — read aloud at a counter

function makeCode(seed: number) {
  let out = "";
  let n = seed;
  for (let i = 0; i < 5; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    out += ALPHABET[n % ALPHABET.length];
  }
  return out;
}

export default function QrPage() {
  const [name, setName] = useState("");
  const [hours, setHours] = useState(72);
  const [seed, setSeed] = useState(20240816);
  const [copied, setCopied] = useState(false);
  const [issued, setIssued] = useState<CustomerLink[]>([]);

  const code = useMemo(() => makeCode(seed), [seed]);
  const url = `rachna.ai/c/${code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the URL is on screen anyway */
    }
  };

  const issue = () => {
    setIssued((prev) => [
      {
        id: `new-${seed}`,
        code,
        issuedTo: name.trim() || "Walk-in · counter",
        issuedOn: "Just now",
        expiresIn: `${hours} h`,
        hoursLeft: hours,
        validityHours: hours,
        status: "active",
        opens: 0,
        designs: 0,
      },
      ...prev,
    ]);
    setSeed((s) => s + 7919);
    setName("");
  };

  const all = [...issued, ...LINKS];

  return (
    <>
      <PageHead
        eyebrow="Customer links"
        title="Hand them a code. Get back a design."
        lede="The customer scans, uploads their room, tries combinations across every category you stock, and sends the scheme back to this console. No app, no account, no password."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* issue */}
        <Panel>
          <PanelHead title="Issue a new link" />

          <div className="flex flex-col items-center gap-5">
            <div className="relative rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] bg-ink-900 p-5">
              <QrPreview code={code} />
              <span className="absolute inset-x-5 top-5 h-px animate-[qrsweep_2.8s_cubic-bezier(0.83,0,0.17,1)_infinite] bg-pigment" />
            </div>

            <div className="text-center">
              <p className="data text-[1.35rem] tracking-[0.28em] text-paper-50">{code}</p>
              <p className="data mt-1.5 text-[0.6875rem] tracking-[0.08em] text-paper-400">{url}</p>
            </div>

            <div className="flex w-full gap-2">
              <button
                onClick={copy}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-[0.8125rem] text-paper-100 transition-colors hover:border-[color-mix(in_oklab,var(--color-paper-200)_40%,transparent)]"
              >
                {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.7} />}
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                onClick={() => setSeed((s) => s + 104729)}
                aria-label="Regenerate code"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] text-paper-300 transition-colors hover:text-paper-50"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.7} />
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <label className="block">
              <span className="eyebrow">Issue to (optional)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                className="mt-2 w-full rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_16%,transparent)] bg-transparent px-4 py-3 text-[0.9375rem] text-paper-50 outline-none transition-colors placeholder:text-paper-400 focus:border-[color-mix(in_oklab,var(--color-pigment)_60%,transparent)]"
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
              Each code is unique to one customer and dies on expiry. The graphic above is a
              preview — the scannable QR is generated when the link is issued.
            </p>
          </div>

          <style>{`@keyframes qrsweep{0%{transform:translateY(0);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:translateY(140px);opacity:0}}`}</style>
        </Panel>

        <div className="flex flex-col gap-4">
          {/* what they see */}
          <Panel>
            <PanelHead
              title="What the customer gets"
              sub="Four steps, on their own phone, on their own room."
            />
            <ol className="grid gap-3 sm:grid-cols-2">
              {[
                ["Scan", "Opens instantly. No install, no sign-up."],
                ["Upload", "Photos of the room, or a plan if they have one."],
                ["Compose", "Walls, floor, feature surfaces and fittings, swapped as whole schemes."],
                ["Send", "The scheme lands in your Customers tab, priced against your stock."],
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

          {/* issued */}
          <Panel pad={false}>
            <div className="p-5 sm:p-6">
              <PanelHead
                title="Issued links"
                sub={`${all.filter((l) => l.status === "active").length} active · expiry shown against the window you set`}
              />
            </div>
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {all.map((l) => {
                const pct = (l.hoursLeft / l.validityHours) * 100;
                const tone = pct < 25 ? "critical" : pct < 50 ? "low" : "healthy";
                return (
                  <div
                    key={l.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[6rem_minmax(0,1fr)_9rem_auto_auto] sm:px-6"
                  >
                    <span className="data text-[0.8125rem] tracking-[0.16em] text-paper-50">
                      {l.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.875rem] text-paper-100">{l.issuedTo}</p>
                      <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                        {l.issuedOn} · {l.opens} opens · {l.designs} designs
                      </p>
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <div className="flex items-baseline justify-between">
                        <span className="data text-[0.625rem] text-paper-400">expires</span>
                        <span className="data text-[0.6875rem] text-paper-200">{l.expiresIn}</span>
                      </div>
                      <Bar pct={pct} tone={tone} className="mt-1.5" />
                    </div>
                    <span className="data hidden text-[0.6875rem] text-paper-400 sm:block">
                      {l.validityHours} h window
                    </span>
                    <Tag status={l.status} />
                  </div>
                );
              })}
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
    const seedNum = [...code].reduce((a, c, i) => a + c.charCodeAt(0) * (i + 7), 0);
    return Array.from({ length: 169 }, (_, i) => {
      const x = i % 13;
      const y = Math.floor(i / 13);
      const finder = (x < 3 && y < 3) || (x > 9 && y < 3) || (x < 3 && y > 9);
      const quiet = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
      if (finder) return true;
      if (quiet) return false;
      const v = Math.sin(x * 12.9898 + y * 78.233 + seedNum) * 43758.5453;
      return v - Math.floor(v) > 0.47;
    });
  }, [code]);

  return (
    <div className="grid grid-cols-13 gap-[2px]" style={{ gridTemplateColumns: "repeat(13, 1fr)" }} aria-hidden="true">
      {cells.map((on, i) => (
        <span
          key={i}
          className={cn("h-2 w-2 rounded-[1px]", on ? "bg-paper-50" : "bg-transparent")}
        />
      ))}
    </div>
  );
}
