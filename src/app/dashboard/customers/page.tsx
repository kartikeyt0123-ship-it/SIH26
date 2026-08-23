"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Ruler,
  Send,
  Share2,
} from "lucide-react";
import { CategoryChip, PageHead, Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import { LINE_BY_ID } from "@/lib/catalog";
import { buildQuote } from "@/lib/quote";
import type { CustomerSpec } from "@/lib/recommend";
import type { Measurements, SelectedScheme, SessionDTO } from "@/lib/session-types";
import { createQuotation, useDealerSessions } from "@/lib/store";
import { quotationMessage } from "@/lib/whatsapp";
import {
  downloadQuotation,
  sendQuotationTo,
  shareQuotation,
  type ShareOutcome,
} from "@/lib/pdf-share";
import { cn, inr } from "@/lib/utils";

/**
 * The dealer's queue (§21, §22).
 *
 * Designs arriving from customer links appear here without the dealer doing
 * anything — the list polls, so a submission made on a phone across town lands
 * on this screen within a few seconds.
 */
export default function CustomersPage() {
  const { sessions, ready } = useDealerSessions();

  const incoming = useMemo(
    () => sessions.filter((s) => s.project?.status === "SUBMITTED" || s.project?.status === "QUOTED"),
    [sessions],
  );

  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  // A design that arrives while the dealer is on this screen becomes the thing
  // he is looking at. That is the entire point of a queue.
  useEffect(() => {
    if (!ready || !incoming.length) return;
    // Re-point if the current selection has gone (revoked, or expired away).
    if (!selectedToken || !incoming.some((s) => s.token === selectedToken)) {
      setSelectedToken(incoming[0].token);
    }
  }, [ready, incoming, selectedToken]);

  const session = incoming.find((s) => s.token === selectedToken);
  const awaiting = incoming.filter((s) => s.project?.status === "SUBMITTED").length;

  return (
    <>
      <PageHead
        eyebrow="Customers"
        title="Designs waiting to become orders."
        lede={
          ready
            ? `${awaiting} awaiting a quotation, ${incoming.length - awaiting} already quoted. Each arrived with its surfaces already specified.`
            : "Loading your queue…"
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel pad={false} className="h-fit overflow-hidden">
            <div className="p-5 pb-0">
              <PanelHead
                title="Submitted designs"
                sub={ready ? `${incoming.length} received · live` : "Loading…"}
              />
            </div>
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {incoming.map((s) => {
                const on = selectedToken === s.token;
                const chosen = s.project?.savedDesigns.find((d) => d.isChosen)
                  ?.scheme as unknown as SelectedScheme | undefined;
                return (
                  <button
                    key={s.token}
                    onClick={() => setSelectedToken(s.token)}
                    className={cn(
                      "relative flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200",
                      on ? "bg-ink-700/70" : "hover:bg-ink-700/40",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1/2 left-0 h-8 w-[2px] -translate-y-1/2 rounded-full bg-pigment transition-transform duration-300",
                        on ? "scale-y-100" : "scale-y-0",
                      )}
                    />
                    <span className="flex shrink-0 gap-1">
                      {/* Keyed by role. A scheme routinely repeats a shade —
                          a ceiling matching the walls is a normal result — so
                          the shade code is not unique among these siblings. */}
                      {chosen
                        ? Object.entries(chosen.shades).map(([role, c]) => (
                            <span key={role} style={{ background: c.hex }} className="h-8 w-2 rounded-sm" />
                          ))
                        : <span className="h-8 w-8 rounded-sm bg-ink-700" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] text-paper-50">
                        {s.customerName}
                      </span>
                      <span className="data block truncate text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                        {s.token.slice(0, 5)} · {String(s.project?.spec?.roomType ?? "space")} ·{" "}
                        {s.project?.images.length ?? 0} photos
                      </span>
                    </span>
                    <Tag status={s.project?.status === "QUOTED" ? "quoted" : "new"}>
                      {s.project?.status === "QUOTED" ? "quoted" : "new"}
                    </Tag>
                  </button>
                );
              })}
              {ready && !incoming.length && (
                <p className="px-5 pb-5 text-[0.8125rem] leading-relaxed text-paper-400">
                  Nothing yet. Issue a code in{" "}
                  <span className="text-paper-200">Customer links</span>, open it on a phone,
                  and whatever the customer sends appears here on its own.
                </p>
              )}
            </div>
          </Panel>

        </div>

        <div className="flex flex-col gap-4">
          {session ? (
            <SessionDetail key={session.token} session={session} />
          ) : (
            <Panel>
              <p className="text-[0.9375rem] text-paper-50">No design selected.</p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-400">
                Designs land here the moment a customer submits from their phone.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------- design from a customer link ------------------------- */

function SessionDetail({ session }: { session: SessionDTO }) {
  const [discount, setDiscount] = useState(session.project?.quotation?.discountPct ?? 0);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [sent, setSent] = useState(session.project?.status === "QUOTED");
  // The id of the quotation that now exists, so the PDF and WhatsApp actions
  // can point at a real stored document rather than a recomputed estimate.
  const [quotationId, setQuotationId] = useState<string | null>(
    session.project?.quotation?.id ?? null,
  );

  const project = session.project;
  const scheme = project?.savedDesigns.find((d) => d.isChosen)?.scheme as
    | unknown as SelectedScheme
    | undefined;
  const spec = project?.spec as unknown as CustomerSpec | undefined;
  const measurements = project?.measurements as unknown as Measurements | undefined;

  const quote = useMemo(
    () => (spec && scheme && measurements ? buildQuote(spec, scheme, measurements) : null),
    [spec, scheme, measurements],
  );

  if (!project || !quote || !scheme || !measurements) {
    return (
      <Panel>
        <p className="text-[0.9375rem] text-paper-200">
          {session.customerName} has not finished their design yet.
        </p>
        <p className="mt-2 text-[0.8125rem] text-paper-400">
          Step {Math.min(project?.step ?? 0, 6) + 1} of 6 · {project?.images.length ?? 0} photos
          uploaded.
        </p>
      </Panel>
    );
  }

  const total = Math.round(quote.subtotal * (1 - discount / 100));
  const line = LINE_BY_ID.get(scheme.lineId);

  const send = async (override = false) => {
    setBusy(true);
    setBlocked([]);
    try {
      const r = await createQuotation({ token: session.token, discountPct: discount, override });
      setQuotationId(r.quotationId);
      setSent(true);
    } catch (e) {
      const err = e as { body?: { blocked?: string[] }; message: string };
      if (err.body?.blocked?.length) setBlocked(err.body.blocked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="display text-[1.75rem]">{session.customerName}</h2>
              <Tag status={sent ? "quoted" : "new"}>{sent ? "quoted" : "new"}</Tag>
            </div>
            <p className="data mt-1.5 text-[0.6875rem] tracking-[0.1em] text-paper-400 uppercase">
              {session.phone || "no number on file"} · code {session.token.slice(0, 5)} ·{" "}
              {String(spec?.roomType ?? "")} · {String(spec?.surface ?? "")}
            </p>
          </div>
          <div className="flex gap-1.5">
            {Object.entries(scheme.shades).map(([role, s]) => (
              <span key={role} className="text-center">
                <span
                  style={{ background: s.hex }}
                  className="block h-11 w-11 rounded-xl ring-1 ring-white/10"
                  title={`${s.name} · ${s.code}`}
                />
                <span className="data mt-1 block text-[0.5rem] tracking-[0.06em] text-paper-400 uppercase">
                  {role}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4">
          <span className="eyebrow">{scheme.title}</span>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-300">{scheme.rationale}</p>
          {line && (
            <p className="data mt-2 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
              {line.brand} {line.name} · {line.finish} · {line.budget}
            </p>
          )}
        </div>

        {project.savedDesigns.length > 1 && (
          <div className="mt-4">
            <span className="eyebrow">Also shortlisted</span>
            <div className="mt-2 flex flex-wrap gap-3">
              {project.savedDesigns
                .filter((d) => !d.isChosen)
                .map((d) => {
                  const sc = d.scheme as unknown as SelectedScheme;
                  return (
                    <span key={d.id} className="flex items-center gap-2">
                      <span className="flex gap-0.5">
                        {/* Keyed by ROLE, not by shade code. A scheme may put
                            the same shade on two surfaces — a ceiling matching
                            the walls is a normal outcome — and keying on the
                            code makes React see duplicate siblings. */}
                        {Object.entries(sc.shades).map(([role, s]) => (
                          <span key={role} style={{ background: s.hex }} className="h-5 w-2 rounded-sm" />
                        ))}
                      </span>
                      <span className="text-[0.75rem] text-paper-400">{d.label ?? sc.title}</span>
                    </span>
                  );
                })}
            </div>
          </div>
        )}

        {project.customerNote && (
          <p className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] px-4 py-3 text-[0.8125rem] text-paper-200">
            “{project.customerNote}”
          </p>
        )}

        <SurfaceSummary project={project} />
        <DNASummary project={project} />

        {project.images.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {project.images.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHead
          title="Measurements"
          sub="Entered by the customer. Nothing here is estimated from a photograph."
          right={<Ruler className="h-4 w-4 text-paper-400" strokeWidth={1.6} />}
        />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[0.8125rem] sm:grid-cols-4">
          {[
            ["Room", `${measurements.lengthM} × ${measurements.widthM} m`],
            ["Height", `${measurements.heightM} m`],
            ["Openings", `${measurements.doors} door · ${measurements.windows} window`],
            ["Coats", String(measurements.coats)],
            ["Wall area", `${quote.areas.netWallSqft} sq ft`],
            ["Feature wall", measurements.featureWall ? `${quote.areas.featureWallSqft} sq ft` : "none"],
            ["Ceiling", measurements.includeCeiling ? `${quote.areas.ceilingSqft} sq ft` : "not painted"],
            ["Perimeter", `${quote.areas.perimeterM} m`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-paper-400">{k}</dt>
              <dd className="data mt-0.5 text-paper-100">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel>
        <PanelHead
          title="Quotation"
          sub="Recomputed on the server from the customer's measurements and your prices."
          right={<FileText className="h-4 w-4 text-paper-400" strokeWidth={1.6} />}
        />

        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          {quote.lines.map((l, i) => (
            <div key={i} className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {l.shadeHex && (
                    <span
                      style={{ background: l.shadeHex }}
                      className="mt-0.5 h-7 w-7 shrink-0 rounded-md ring-1 ring-white/10"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[0.875rem] text-paper-50">
                      {l.role} · {l.brand} {l.product}
                      {l.shadeName ? ` · ${l.shadeName}` : ""}
                    </p>
                    <p className="data mt-1 text-[0.625rem] leading-relaxed text-paper-400">
                      {l.working}
                    </p>
                    {l.why && (
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-paper-300">{l.why}</p>
                    )}
                  </div>
                </div>
                <span className="data shrink-0 text-[0.9375rem] text-paper-50">{inr(l.amount)}</span>
              </div>
            </div>
          ))}
        </div>

        {blocked.length > 0 && (
          <div className="mt-4 flex gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_9%,transparent)] p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pigment-soft" strokeWidth={1.8} />
            <div className="text-[0.8125rem] leading-relaxed text-paper-200">
              <p className="text-paper-50">Some of this is no longer available.</p>
              <p className="mt-1">{blocked.join(", ")}</p>
              <button
                onClick={() => send(true)}
                className="mt-2 text-[0.8125rem] text-pigment-soft underline underline-offset-4"
              >
                Quote anyway — I can source it
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div>
            <label className="eyebrow">Discount</label>
            <div className="mt-3 flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-[var(--color-pigment)]"
              />
              <span className="data w-16 text-right text-[1.05rem] text-paper-50">
                {discount.toFixed(1)}%
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-1.5">
              {quote.notes.map((n) => (
                <li key={n} className="text-[0.75rem] leading-relaxed text-paper-400">
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl bg-[color-mix(in_oklab,var(--color-pigment)_9%,transparent)] p-4">
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-paper-300">Materials</span>
              <span className="data text-paper-100">{inr(quote.subtotal)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-paper-300">Discount</span>
              <span className="data text-paper-100">− {inr(quote.subtotal - total)}</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] pt-3">
              <span className="text-[0.8125rem] text-paper-200">Quotation total</span>
              <span className="data text-[1.2rem] text-paper-50">{inr(total)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => send(false)}
          disabled={busy}
          className={cn(
            "mt-5 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.9375rem] font-medium transition-all duration-200 disabled:opacity-50",
            sent
              ? "bg-[color-mix(in_oklab,var(--color-glaze)_28%,transparent)] text-[#7fd6c9]"
              : "bg-paper-50 text-ink-900 hover:-translate-y-px hover:bg-white",
          )}
        >
          {sent ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} /> Quotation sent
            </>
          ) : (
            <>
              <Send className="h-4 w-4" strokeWidth={1.8} />
              {busy ? "Checking stock…" : `Send quotation to ${session.customerName.split(" ")[0]}`}
            </>
          )}
        </button>

        {blocked.length > 0 && (
          <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-pigment)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_8%,transparent)] p-4">
            <p className="text-[0.875rem] text-paper-100">
              Out of stock right now: {blocked.join(", ")}.
            </p>
            <button
              onClick={() => send(true)}
              className="mt-3 text-[0.8125rem] text-pigment-soft underline underline-offset-4"
            >
              Quote anyway — I can source these
            </button>
          </div>
        )}

        {sent && quotationId && (
          <Delivery
            quotationId={quotationId}
            customerName={session.customerName}
            phone={session.phone}
            total={total}
            itemCount={quote.lines.length}
          />
        )}
      </Panel>
    </>
  );
}

/**
 * Getting the quotation to the customer.
 *
 * Two real actions. The PDF is the stored document, rendered server-side from
 * the saved quotation row. The WhatsApp button opens a pre-filled chat — it
 * does not send, and the label says so, because sending requires the WhatsApp
 * Business API and claiming otherwise would leave a dealer believing a customer
 * had been contacted when nobody had.
 */
function Delivery({
  quotationId,
  customerName,
  phone,
  total,
  itemCount,
}: {
  quotationId: string;
  customerName: string;
  phone: string | null;
  total: number;
  itemCount: number;
}) {
  const [busy, setBusy] = useState<"share" | "attach" | "download" | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | "opened" | "opened-nofile" | null>(null);

  // No PDF URL in the message. The file itself is what gets sent, so the
  // customer keeps a document that works long after this server has gone.
  const message = quotationMessage({ customerName, dealerName: "your dealer", total, itemCount });

  /**
   * Straight to this customer's chat.
   *
   * Downloads the PDF, then opens their conversation with the message written.
   * No contact search — the number is already in the link.
   */
  const onSend = async () => {
    setBusy("share");
    setOutcome(null);
    const r = await sendQuotationTo(quotationId, customerName, phone, message);
    setOutcome(r.outcome === "opened" ? (r.downloaded ? "opened" : "opened-nofile") : "failed");
    setBusy(null);
  };

  /** Attach the file through the share sheet, for phones that support it. */
  const onShareFile = async () => {
    setBusy("attach");
    setOutcome(null);
    setOutcome(await shareQuotation(quotationId, customerName, message));
    setBusy(null);
  };

  const onDownload = async () => {
    setBusy("download");
    const ok = await downloadQuotation(quotationId, customerName);
    setOutcome(ok ? "downloaded" : "failed");
    setBusy(null);
  };

  return (
    <div className="mt-5 border-t border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] pt-5">
      <p className="eyebrow mb-3">Send it to them</p>
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={onDownload}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-4 py-2.5 text-[0.8125rem] text-paper-100 transition-colors hover:border-pigment hover:text-paper-50 disabled:opacity-60"
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <Download className="h-4 w-4" strokeWidth={1.7} />
          )}
          Download PDF
        </button>

        {phone ? (
          <>
            <button
              onClick={onSend}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2.5 text-[0.8125rem] font-medium text-[#04310f] transition-transform hover:-translate-y-px disabled:opacity-60"
            >
              {busy === "share" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
              )}
              WhatsApp {customerName.split(" ")[0]}
            </button>
            <button
              onClick={onShareFile}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-4 py-2.5 text-[0.8125rem] text-paper-100 transition-colors hover:border-pigment disabled:opacity-60"
            >
              {busy === "attach" ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <Share2 className="h-4 w-4" strokeWidth={1.7} />
              )}
              Attach file…
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-4 py-2.5 text-[0.8125rem] text-paper-400">
            <MessageCircle className="h-4 w-4" strokeWidth={1.7} /> No mobile number on file
          </span>
        )}

        <a
          href={`/api/quotations/${quotationId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-[0.8125rem] text-paper-400 transition-colors hover:text-paper-100"
        >
          <FileText className="h-4 w-4" strokeWidth={1.7} /> Preview
        </a>
      </div>

      <p className="mt-2.5 text-[0.75rem] leading-relaxed text-paper-400">
        {outcome === "opened"
          ? `${customerName.split(" ")[0]}'s chat is open with the message written, and the PDF has downloaded to this device — tap the paperclip to attach it, then send.`
          : outcome === "opened-nofile"
            ? "Their chat is open, but the PDF did not download. Use Download PDF and attach it."
            : outcome === "shared"
              ? "Handed to the app you picked with the PDF attached. You press send there."
              : outcome === "downloaded"
                ? "The PDF is on this device, ready to attach."
                : outcome === "failed"
                  ? "Could not build the PDF. Try again, or use Preview."
                  : phone
                    ? `Opens ${customerName.split(" ")[0]}'s own chat directly — no searching for the contact — and downloads the PDF so you can attach it. The file works offline for ever, unlike a link. Nothing is sent until you press send.`
                    : "Ask the customer for a mobile number on their next visit and it will appear here."}
      </p>
    </div>
  );
}

/* ---------------------------- counter proposals ---------------------------- */

/* --------------------- Round 2: what the customer saw --------------------- */

/**
 * The customer's surface reading, shown to the dealer verbatim.
 *
 * Verbatim matters. The dealer and the customer have to be looking at the same
 * sentences when they talk at the counter, and a summarised or re-worded
 * version here is how a customer ends up saying "the app told me it was damp"
 * about something the app never said.
 */
function SurfaceSummary({ project }: { project: NonNullable<SessionDTO["project"]> }) {
  const surface = project.surface as {
    observations?: { label: string; severity: string; evidence: string }[];
    prep?: { order: number; title: string; triggered: boolean }[];
    severity?: string;
    engine?: string;
  } | null;
  if (!surface) return null;

  const flagged = (surface.observations ?? []).filter((o) => o.severity !== "ok");
  const needed = (surface.prep ?? []).filter((p) => p.triggered);

  return (
    <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Surface health</span>
        <Tag
          status={
            surface.severity === "significant"
              ? "critical"
              : surface.severity === "moderate"
                ? "low"
                : "healthy"
          }
        >
          {surface.severity ?? "none"}
        </Tag>
      </div>

      {flagged.length === 0 ? (
        <p className="mt-2 text-[0.8125rem] text-paper-300">
          Nothing stood out in the customer&rsquo;s photographs.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {flagged.map((o) => (
            <li key={o.label} className="text-[0.8125rem]">
              <span className="text-paper-100">⚠ {o.label}</span>
              <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-paper-400">
                {o.evidence}
              </span>
            </li>
          ))}
        </ul>
      )}

      {needed.length > 0 && (
        <p className="mt-3 text-[0.75rem] leading-relaxed text-paper-300">
          Preparation this job needs:{" "}
          <span className="text-paper-100">{needed.map((p) => p.title).join(" → ")}</span>. These are
          quotable lines — the customer has already been shown why each one is there.
        </p>
      )}

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-paper-400">
        Read from the customer&rsquo;s photographs by pixel statistics ({surface.engine}). Possible
        issues to check in person — not an inspection, and not confirmed damage.
      </p>
    </div>
  );
}

/**
 * The taste profile, narrowed for the dealer.
 *
 * Only style, palette, finish, budget and the colours. No note, no phone, no
 * interaction history — a dealer serves this customer better knowing they keep
 * choosing warm neutrals in matte, and needs nothing beyond that.
 */
function DNASummary({ project }: { project: NonNullable<SessionDTO["project"]> }) {
  const dna = project.dna as {
    style?: { value: string };
    palette?: { value: string };
    finish?: { value: string };
    budget?: { value: string };
    colours?: { hex: string; name: string }[];
    provisional?: boolean;
  } | null;
  if (!dna) return null;

  const rows = [
    ["Style", dna.style?.value],
    ["Palette", dna.palette?.value],
    ["Finish", dna.finish?.value],
    ["Budget", dna.budget?.value],
  ].filter(([, v]) => v && v !== "Not yet clear") as [string, string][];

  if (!rows.length && !dna.colours?.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Design DNA</span>
        {dna.provisional && (
          <span className="data text-[0.5625rem] tracking-[0.12em] text-paper-400 uppercase">
            still forming
          </span>
        )}
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="data text-[0.5625rem] tracking-[0.1em] text-paper-400 uppercase">{k}</dt>
            <dd className="mt-0.5 text-[0.8125rem] text-paper-100 capitalize">{v}</dd>
          </div>
        ))}
      </dl>

      {dna.colours && dna.colours.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {dna.colours.map((c) => (
            <span key={c.hex} className="flex items-center gap-1.5">
              <span
                style={{ background: c.hex }}
                className="h-4 w-4 rounded ring-1 ring-white/10"
                aria-hidden="true"
              />
              <span className="text-[0.6875rem] text-paper-400">{c.name}</span>
            </span>
          ))}
        </div>
      )}

      {project.variationCount > 0 && (
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-paper-400">
          Explored {project.variationCount} alternative direction
          {project.variationCount === 1 ? "" : "s"}
          {project.lastIntent ? `, most recently "${project.lastIntent}"` : ""}. Worth asking about.
        </p>
      )}

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-paper-400">
        Built from what this customer opened, saved and skipped, using fixed rules. Not machine
        learning, and not a prediction.
      </p>
    </div>
  );
}
