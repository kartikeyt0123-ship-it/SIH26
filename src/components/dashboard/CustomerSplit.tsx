"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock, FileText, MessageCircle, Send } from "lucide-react";
import { Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import type { SelectedScheme, SessionDTO } from "@/lib/session-types";
import { useDealerSessions } from "@/lib/store";
import { cn, inr } from "@/lib/utils";

/**
 * The customer list, split by whether a quotation has gone out.
 *
 * One combined list answers "who is here". A dealer standing at a counter needs
 * "who is waiting on me" — and those are almost entirely disjoint groups with
 * completely different next actions. Awaiting means price it; quoted means chase
 * it; still designing means leave them alone. Mixing the three into one column
 * sorted by time hides the only distinction that changes what the dealer does.
 */

type Bucket = "awaiting" | "quoted" | "designing";

const BUCKETS: { id: Bucket; label: string; blurb: string }[] = [
  { id: "awaiting", label: "Awaiting quotation", blurb: "Submitted and waiting on a price from you." },
  { id: "quoted", label: "Quotation sent", blurb: "Priced and sent. Worth a follow-up if it has gone quiet." },
  { id: "designing", label: "Still designing", blurb: "Their link is open and they have not submitted yet." },
];

function bucketOf(s: SessionDTO): Bucket | null {
  const status = s.project?.status;
  if (status === "SUBMITTED") return "awaiting";
  if (status === "QUOTED" || status === "CONVERTED") return "quoted";
  if (s.expired || s.status === "CLOSED") return null;
  return "designing";
}

export function CustomerSplit() {
  const { sessions, ready, origin } = useDealerSessions();
  const [tab, setTab] = useState<Bucket>("awaiting");

  const grouped = useMemo(() => {
    const out: Record<Bucket, SessionDTO[]> = { awaiting: [], quoted: [], designing: [] };
    for (const s of sessions) {
      const b = bucketOf(s);
      if (b) out[b].push(s);
    }
    return out;
  }, [sessions]);

  // Land on whichever bucket actually needs attention, rather than always
  // opening on an empty "awaiting" tab.
  const active = grouped[tab].length === 0 && grouped.awaiting.length === 0 && grouped.quoted.length > 0
    ? "quoted"
    : tab;

  const rows = grouped[active];
  const meta = BUCKETS.find((b) => b.id === active)!;

  return (
    <Panel className="mt-4">
      <PanelHead
        title="Your customers"
        sub={ready ? meta.blurb : "Loading…"}
        right={
          <Link
            href="/dashboard/customers"
            className="text-[0.8125rem] text-paper-300 hover:text-paper-50"
          >
            Open queue
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] p-1">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            onClick={() => setTab(b.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] whitespace-nowrap transition-colors",
              active === b.id ? "bg-ink-700 text-paper-50" : "text-paper-400 hover:text-paper-100",
            )}
          >
            {b.label}
            <span
              className={cn(
                "data rounded-full px-1.5 py-0.5 text-[0.625rem]",
                b.id === "awaiting" && grouped[b.id].length > 0
                  ? "bg-[color-mix(in_oklab,var(--color-pigment)_22%,transparent)] text-pigment-soft"
                  : "bg-ink-900 text-paper-400",
              )}
            >
              {grouped[b.id].length}
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-5 py-8 text-center text-[0.8125rem] leading-relaxed text-paper-400">
          {active === "awaiting"
            ? "Nothing waiting on a price right now."
            : active === "quoted"
              ? "No quotations sent yet."
              : "Nobody has a design open at the moment."}
        </p>
      ) : (
        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          {rows.slice(0, 8).map((s) => (
            <Row key={s.token} session={s} bucket={active} origin={origin} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Row({
  session,
  bucket,
  origin,
}: {
  session: SessionDTO;
  bucket: Bucket;
  origin: string;
}) {
  const chosen = session.project?.savedDesigns.find((d) => d.isChosen)?.scheme as
    | unknown as SelectedScheme
    | undefined;
  const quote = session.project?.quotation;

  const when = session.project?.submittedAt
    ? new Date(session.project.submittedAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : `${Math.round(session.hoursLeft)}h left on their link`;

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex shrink-0 gap-1">
        {chosen ? (
          Object.entries(chosen.shades).map(([role, c]) => (
            <span key={role} style={{ background: c.hex }} className="h-9 w-2.5 rounded-sm" />
          ))
        ) : (
          <span className="h-9 w-9 rounded-sm bg-ink-700" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] text-paper-50">{session.customerName}</span>
        <span className="data block truncate text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
          {String(session.project?.spec?.roomType ?? "space")} · {when}
        </span>
      </span>

      {quote && (
        <span className="data shrink-0 text-[0.8125rem] text-paper-100">{inr(quote.total)}</span>
      )}

      {bucket === "quoted" && quote ? (
        <span className="flex shrink-0 items-center gap-2">
          <a
            href={`/api/quotations/${quote.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            title="Open the quotation PDF"
            className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-3 py-1.5 text-[0.75rem] text-paper-200 transition-colors hover:border-pigment hover:text-paper-50"
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={1.7} /> PDF
          </a>
          <Tag status="quoted">sent</Tag>
        </span>
      ) : bucket === "awaiting" ? (
        <Link
          href="/dashboard/customers"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-paper-50 px-3 py-1.5 text-[0.75rem] font-medium text-ink-900"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={1.8} /> Quote
        </Link>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          <span className="data inline-flex items-center gap-1.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
            <Clock className="h-3 w-3" strokeWidth={1.8} /> step {Math.min(session.project?.step ?? 0, 6) + 1}/6
          </span>
          {session.phone && origin && (
            <a
              href={`https://wa.me/91${session.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(
                `Namaste ${session.customerName.split(" ")[0]}, your colour selection is still open here: ${origin}/c/${session.token}`,
              )}`}
              target="_blank"
              rel="noreferrer"
              title="Open WhatsApp with their link"
              className="inline-flex items-center rounded-full bg-[#25D366] p-1.5 text-[#04310f]"
            >
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Colours customers asked for that this dealer cannot mix.
 *
 * On the Overview because it is genuinely urgent commercial information: a
 * named customer wanting a named colour is a sale sitting one colorant away,
 * and it goes stale — their link expires. Buried on a secondary tab it would be
 * read after the customer had given up.
 *
 * Renders nothing when there are none. A permanent empty panel teaches people
 * to stop looking.
 */
export function ColourRequests() {
  const [rows, setRows] = useState<
    { id: string; shadeName: string; shadeHex: string; customerName: string | null; count: number; substituteName: string | null }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/intelligence", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => !cancelled && j && setRows(j.shadeRequests ?? []))
        .catch(() => undefined);
    load();
    // Slower than the submission poll: this aggregates every customer and
    // nothing on it changes meaningfully inside a minute.
    const id = setInterval(() => document.visibilityState === "visible" && load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!rows.length) return null;

  return (
    <Panel className="mt-4 border-[color-mix(in_oklab,var(--color-brass)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_7%,transparent)]">
      <PanelHead
        title="Colours you were asked for"
        sub="Customers wanted these and you cannot mix them today."
        right={
          <Link href="/dashboard/intelligence" className="text-[0.8125rem] text-paper-300 hover:text-paper-50">
            All requests
          </Link>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.slice(0, 6).map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] bg-ink-900/40 p-3"
          >
            <span
              style={{ background: r.shadeHex }}
              className="mt-0.5 h-9 w-9 shrink-0 rounded-lg ring-1 ring-white/10"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[0.875rem] text-paper-50">{r.shadeName}</span>
                {r.count > 1 && (
                  <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] px-1.5 py-0.5 text-[0.5625rem] tracking-[0.1em] text-pigment-soft uppercase">
                    x{r.count}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[0.6875rem] text-paper-400">
                {r.customerName ?? "A customer"}
                {r.substituteName && ` · offered ${r.substituteName}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
