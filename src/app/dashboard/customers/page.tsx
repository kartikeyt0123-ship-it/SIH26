"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileText, Ruler, Send } from "lucide-react";
import { CategoryChip, PageHead, Panel, PanelHead, Tag } from "@/components/dashboard/ui";
import { LINE_BY_ID } from "@/lib/catalog";
import { PROPOSALS, proposalTotal, type Proposal } from "@/lib/demo";
import { buildQuote } from "@/lib/quote";
import type { CustomerSpec } from "@/lib/recommend";
import type { Measurements, SelectedScheme, SessionDTO } from "@/lib/session-types";
import { createQuotation, useDealerSessions } from "@/lib/store";
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

  const [selected, setSelected] = useState<{ kind: "session" | "proposal"; id: string }>({
    kind: "proposal",
    id: PROPOSALS[0].id,
  });

  // A design that arrives while the dealer is on this screen becomes the thing
  // he is looking at. That is the entire point of a queue.
  useEffect(() => {
    if (
      ready &&
      incoming.length &&
      selected.kind === "proposal" &&
      selected.id === PROPOSALS[0].id
    ) {
      setSelected({ kind: "session", id: incoming[0].token });
    }
  }, [ready, incoming, selected]);

  const session = incoming.find((s) => s.token === selected.id);
  const proposal = PROPOSALS.find((p) => p.id === selected.id);
  const awaiting = incoming.filter((s) => s.project?.status === "SUBMITTED").length;

  return (
    <>
      <PageHead
        eyebrow="Customers"
        title="Designs waiting to become orders."
        lede={`${awaiting} from customer links, ${PROPOSALS.filter((p) => p.status === "new").length} from the counter. Each arrived with its surfaces already specified.`}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel pad={false} className="h-fit overflow-hidden">
            <div className="p-5 pb-0">
              <PanelHead
                title="From customer links"
                sub={ready ? `${incoming.length} received · live` : "Loading…"}
              />
            </div>
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {incoming.map((s) => {
                const on = selected.kind === "session" && selected.id === s.token;
                const chosen = s.project?.savedDesigns.find((d) => d.isChosen)
                  ?.scheme as unknown as SelectedScheme | undefined;
                return (
                  <button
                    key={s.token}
                    onClick={() => setSelected({ kind: "session", id: s.token })}
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
                      {chosen
                        ? Object.values(chosen.shades).map((c) => (
                            <span key={c.code} style={{ background: c.hex }} className="h-8 w-2 rounded-sm" />
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

          <Panel pad={false} className="h-fit overflow-hidden">
            <div className="p-5 pb-0">
              <PanelHead title="From the counter" sub={`${PROPOSALS.length} earlier designs`} />
            </div>
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {PROPOSALS.map((x) => {
                const on = selected.kind === "proposal" && selected.id === x.id;
                return (
                  <button
                    key={x.id}
                    onClick={() => setSelected({ kind: "proposal", id: x.id })}
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
                      {x.palette.slice(0, 4).map((c) => (
                        <span key={c} style={{ background: c }} className="h-8 w-2 rounded-sm" />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] text-paper-50">{x.customer}</span>
                      <span className="data block truncate text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                        {x.space} · {x.sqft} sq ft · {x.submitted}
                      </span>
                    </span>
                    <Tag status={x.status} />
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {selected.kind === "session" && session ? (
            <SessionDetail key={session.token} session={session} />
          ) : proposal ? (
            <ProposalDetail p={proposal} />
          ) : null}
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
      await createQuotation({ token: session.token, discountPct: discount, override });
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
                        {Object.values(sc.shades).map((s) => (
                          <span key={s.code} style={{ background: s.hex }} className="h-5 w-2 rounded-sm" />
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
      </Panel>
    </>
  );
}

/* ---------------------------- counter proposals ---------------------------- */

function ProposalDetail({ p }: { p: Proposal }) {
  const [discount, setDiscount] = useState(0);
  const subtotal = proposalTotal(p);
  const total = Math.round(subtotal * (1 - discount / 100));

  return (
    <>
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="display text-[1.75rem]">{p.customer}</h2>
              <Tag status={p.status} />
            </div>
            <p className="data mt-1.5 text-[0.6875rem] tracking-[0.1em] text-paper-400 uppercase">
              {p.phone} · {p.locality} · {p.space} · {p.sqft} sq ft
            </p>
          </div>
          <div className="flex gap-1.5">
            {p.palette.map((c) => (
              <span key={c} style={{ background: c }} className="h-11 w-11 rounded-xl ring-1 ring-white/10" />
            ))}
          </div>
        </div>
        {p.note && (
          <p className="mt-5 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] px-4 py-3 text-[0.8125rem] text-paper-200">
            {p.note}
          </p>
        )}
      </Panel>

      <Panel>
        <PanelHead title="Specification" sub="Captured at the counter." />
        <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
          {p.surfaces.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_6rem_auto]"
            >
              <span className="data text-[0.625rem] tracking-[0.12em] text-paper-400 uppercase">
                {l.surface}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.875rem] text-paper-100">{l.spec}</span>
                <CategoryChip type={l.category} className="mt-1 sm:hidden" />
              </span>
              <span className="data hidden text-[0.75rem] text-paper-400 sm:block">{l.qty}</span>
              <span className="data text-right text-[0.875rem] text-paper-50">{inr(l.amount)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Quotation" sub="Your pricing, your margin." />
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
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
          </div>
          <div className="rounded-xl bg-[color-mix(in_oklab,var(--color-pigment)_9%,transparent)] p-4">
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-paper-300">Materials</span>
              <span className="data text-paper-100">{inr(subtotal)}</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] pt-3">
              <span className="text-[0.8125rem] text-paper-200">Quotation total</span>
              <span className="data text-[1.2rem] text-paper-50">{inr(total)}</span>
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
