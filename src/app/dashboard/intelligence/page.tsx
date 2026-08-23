"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  CloudSun,
  Info,
  MessageCircle,
  PackageSearch,
  Palette,
  Radar,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { PageHead, Panel, PanelHead, Stat, Tag } from "@/components/dashboard/ui";
import { DIRECTION_GLYPH } from "@/lib/demand";
import { SEASON_LABEL } from "@/lib/climate";
import { followUpMessage, waLink } from "@/lib/whatsapp";
import { inr } from "@/lib/utils";
import type { DealerIntelligence } from "@/server/intelligence";
import type { ClimateContext } from "@/lib/climate";
import type { ProviderStatus } from "@/lib/ai";

/**
 * Rachna Intelligence.
 *
 * Kept off the Overview and out of Performance deliberately. Performance is the
 * ledger — every figure there traces to a quotation or a dispatch. This page is
 * inference: it counts shortlists, reads stock against lead times and says what
 * to do about it. Mixing the two would make the reliable numbers look like the
 * inferred ones, and it is the reliable ones that carry the renewal.
 *
 * Every panel here states its basis. "Based on your customer activity" is not
 * decoration — it is the difference between this being useful and this being a
 * dashboard that once told a dealer to buy stock on a trend that did not exist.
 */

type Payload = DealerIntelligence & {
  climate: ClimateContext;
  dealer: { name: string; city: string } | null;
  providers: ProviderStatus;
};

export default function IntelligencePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence", { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load intelligence (${res.status})`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    load();
    // Slower than the five-second submission poll: this page aggregates every
    // customer, and nothing on it changes meaningfully inside half a minute.
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <>
      <PageHead
        eyebrow="Rachna Intelligence"
        title="What your customers are telling you."
        lede="Counted from your own customers' activity and your own stock. Nothing here is an external market trend."
        right={
          data ? (
            <ClimateBadge climate={data.climate} />
          ) : null
        }
      />

      {!ready && <Skeleton />}

      {ready && error && (
        <Panel>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-pigment-soft" strokeWidth={1.6} />
            <div>
              <p className="text-[0.9375rem] text-paper-50">{error}</p>
              <button
                onClick={() => {
                  setReady(false);
                  load();
                }}
                className="mt-3 rounded-lg border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-3 py-1.5 text-[0.8125rem] text-paper-200 transition-colors hover:border-pigment hover:text-paper-50"
              >
                Try again
              </button>
            </div>
          </div>
        </Panel>
      )}

      {ready && data && <Content data={data} />}
    </>
  );
}

/* --------------------------------- content -------------------------------- */

function Content({ data }: { data: Payload }) {
  const { insights, radar, surfaceAlerts, actions } = data;
  // Built client-side: the follow-up message embeds the customer link, and the
  // server does not know which host the dealer is looking at this through.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <Stat
            label="Active projects"
            value={String(insights.activeProjects)}
            note={`${insights.submittedProjects} submitted`}
          />
        </Panel>
        <Panel>
          <Stat
            label="Popular style"
            value={insights.popularStyle?.value ?? "—"}
            note={
              insights.popularStyle
                ? `${insights.popularStyle.count} of ${insights.profileCount} profiles`
                : "No profile is settled yet"
            }
          />
        </Panel>
        <Panel>
          <Stat
            label="Popular palette"
            value={insights.popularPalette?.value ?? "—"}
            note={
              insights.popularPalette
                ? `${insights.popularPalette.count} of ${insights.profileCount} profiles`
                : "Needs more customer activity"
            }
          />
        </Panel>
        <Panel>
          <Stat
            label="Preferred finish"
            value={insights.popularFinish?.value ?? "—"}
            note={
              insights.provisionalProfiles
                ? `${insights.provisionalProfiles} profile${insights.provisionalProfiles === 1 ? "" : "s"} still forming`
                : "Across settled profiles"
            }
          />
        </Panel>
      </div>

      {/* Recommended action sits first: it is the only panel that asks for
          something to be done, and burying it under charts defeats the point. */}
      <Panel className="mt-4">
        <PanelHead
          title="Recommended action"
          sub="Assembled from what is true right now. Each one says why."
          right={<Basis>{data.providers.demand.disclosure}</Basis>}
        />
        {actions.length === 0 ? (
          <Empty
            icon={CircleCheck}
            title="Nothing needs you right now"
            body="No stock is inside its lead time, every submitted design has been quoted, and no link is sitting unopened."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {actions.map((a) => (
              <Link
                key={a.id}
                href={a.href}
                className="group flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4 transition-colors hover:border-[color-mix(in_oklab,var(--color-pigment)_40%,transparent)] hover:bg-ink-700/40"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] text-paper-50">{a.label}</span>
                  <span className="mt-1 block text-[0.8125rem] leading-relaxed text-paper-400">
                    {a.detail}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 h-4 w-4 shrink-0 text-paper-400 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-paper-50"
                  strokeWidth={1.6}
                />
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        {/* ------------------------------ radar ------------------------------ */}
        <Panel>
          <PanelHead
            title="Demand Radar"
            sub={`Shades your customers shortlisted, chose or submitted in the last ${radar.windowDays} days.`}
            right={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft">
                <Radar className="h-4 w-4" strokeWidth={1.6} />
              </span>
            }
          />
          {radar.trends.length === 0 ? (
            <Empty
              icon={Radar}
              title="No customer activity yet"
              body="Issue a customer link and save a design — trends appear here as soon as there is something real to count."
            />
          ) : (
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {radar.trends.map((tr) => (
                <div key={tr.code} className="flex items-center gap-3.5 py-3">
                  <span
                    style={{ background: tr.hex }}
                    className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/10"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] text-paper-100">{tr.name}</p>
                    <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                      {tr.touches} {tr.touches === 1 ? "design" : "designs"} · based on your customer activity
                    </p>
                  </div>
                  <span
                    className={`data shrink-0 text-[0.875rem] ${
                      tr.direction === "up"
                        ? "text-[#5fbfb3]"
                        : tr.direction === "down"
                          ? "text-pigment-soft"
                          : "text-paper-300"
                    }`}
                  >
                    {DIRECTION_GLYPH[tr.direction]}
                    {/* No prior fortnight means no percentage. An arrow with a
                        made-up number beside it is worse than no number. */}
                    {tr.changePct !== null && (
                      <span className="ml-1.5">{Math.abs(tr.changePct)}%</span>
                    )}
                  </span>
                </div>
              ))}
              <p className="pt-3 text-[0.75rem] leading-relaxed text-paper-400">
                A direction is only shown when there is an earlier fortnight to compare against.
                Shades seen for the first time read as flat.
              </p>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          {/* ---------------------------- low stock --------------------------- */}
          <Panel>
            <PanelHead
              title="Low stock"
              sub="Days of cover against your own offtake and lead time."
            />
            {radar.alerts.length === 0 ? (
              <Empty
                icon={PackageSearch}
                title="Every line has cover"
                body="Nothing is inside its reorder point or its lead-time window."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {radar.alerts.map((a) => (
                  <div
                    key={a.productId}
                    className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[0.875rem] text-paper-100">{a.product}</p>
                        <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                          {a.brand} · {a.litres} L left
                          {a.demandTouches > 0 &&
                            ` · ${a.demandTouches} recent design${a.demandTouches === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <Tag status={a.severity === "critical" ? "critical" : "low"}>
                        {a.severity === "critical" ? "act now" : "low"}
                      </Tag>
                    </div>
                    <p className="mt-2 text-[0.75rem] leading-relaxed text-paper-400">{a.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* --------------------------- restock ------------------------------ */}
          <Panel>
            <PanelHead title="Restock recommendation" sub="Enough to cover the lead time and a fortnight." />
            {radar.restock.length === 0 ? (
              <Empty
                icon={CircleCheck}
                title="No reorder needed"
                body="Nothing is close enough to running out to justify an order today."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {radar.restock.map((r) => (
                  <div key={r.productId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[0.875rem] text-paper-100">
                        {r.product}
                      </span>
                      <span className="data shrink-0 text-[0.8125rem] text-paper-50">
                        {r.suggestLitres} L
                      </span>
                    </div>
                    <p className="mt-1 text-[0.75rem] leading-relaxed text-paper-400">{r.reason}</p>
                    <p className="data mt-1 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                      approx {inr(r.approxCost)} at your selling rate
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ------------------- your customers this month ------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel>
          <PanelHead
            title="Your customers this month"
            sub="How their taste splits, from the profiles that have settled."
            right={<Basis>{data.providers.preference.disclosure}</Basis>}
          />
          {data.paletteMix.total === 0 ? (
            <Empty
              icon={Palette}
              title="No settled profiles yet"
              body={
                data.paletteMix.forming > 0
                  ? `${data.paletteMix.forming} profile${data.paletteMix.forming === 1 ? " is" : "s are"} still forming. They appear here once a customer has saved or skipped enough schemes to show a preference.`
                  : "Once customers start saving designs, their palette preferences are counted here."
              }
            />
          ) : (
            <>
              {/* One bar, split proportionally — four separate bars invite
                  comparison against the panel width rather than each other. */}
              <div className="flex h-3 overflow-hidden rounded-full">
                {data.paletteMix.buckets.map((b) => (
                  <span
                    key={b.label}
                    style={{ background: b.hex, width: `${b.pct}%` }}
                    className="h-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    title={`${b.label} ${b.pct}%`}
                  />
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {data.paletteMix.buckets.map((b) => (
                  <div key={b.label} className="flex items-center gap-3">
                    <span
                      style={{ background: b.hex }}
                      className="h-4 w-4 shrink-0 rounded ring-1 ring-white/10"
                      aria-hidden="true"
                    />
                    <span className="data w-12 shrink-0 text-[1.0625rem] text-paper-50">
                      {b.pct}%
                    </span>
                    <span className="min-w-0 flex-1 text-[0.875rem] text-paper-200">
                      prefer {b.label.toLowerCase()} palettes
                    </span>
                    <span className="data shrink-0 text-[0.6875rem] text-paper-400">
                      {b.count} of {data.paletteMix.total}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[0.75rem] leading-relaxed text-paper-400">
                Based on {data.paletteMix.total} customer
                {data.paletteMix.total === 1 ? "" : "s"} whose preference has settled
                {data.paletteMix.forming > 0 &&
                  `; ${data.paletteMix.forming} more are still forming and are excluded rather than guessed at`}
                .
              </p>
            </>
          )}
        </Panel>

        {/* --------------------------- best sellers --------------------------- */}
        <Panel>
          <PanelHead title="Selling best" sub="Counted from quotations you actually sent." />
          {data.bestSellers.length === 0 ? (
            <Empty
              icon={TrendingUp}
              title="No quotations yet"
              body="Once you send a quotation, the products on it are counted here by value."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {data.bestSellers.map((b) => {
                const max = Math.max(...data.bestSellers.map((x) => x.value)) || 1;
                return (
                  <div key={b.productId}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[0.875rem] text-paper-100">
                        {b.product}
                      </span>
                      <span className="data shrink-0 text-[0.8125rem] text-paper-50">
                        {inr(b.value)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                        <span
                          style={{ width: `${(b.value / max) * 100}%` }}
                          className={`block h-full rounded-full ${b.thin ? "bg-pigment" : "bg-[#5fbfb3]"}`}
                        />
                      </span>
                      <span className="data shrink-0 text-[0.625rem] text-paper-400">
                        {b.litres} L
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-paper-400">
                      {b.reason}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* --------------- inactive customers + colour requests ------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel>
          <PanelHead
            title="Gone quiet"
            sub="Links that are still live but have not been touched for a day or more."
          />
          {data.inactive.length === 0 ? (
            <Empty
              icon={CircleCheck}
              title="Nobody is stalled"
              body="Every live customer link has been opened recently."
            />
          ) : (
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {data.inactive.map((c) => {
                const wa = waLink(
                  c.phone,
                  followUpMessage({
                    customerName: c.name,
                    dealerName: data.dealer?.name ?? "your dealer",
                    link: origin ? `${origin}/c/${c.token}` : null,
                    daysQuiet: c.daysQuiet,
                  }),
                );
                return (
                  <div key={c.token} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.875rem] text-paper-100">{c.name}</p>
                      <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                        {c.daysQuiet}d quiet · {c.stage} ·{" "}
                        {c.hoursLeft < 24
                          ? `expires in ${Math.round(c.hoursLeft)}h`
                          : `${Math.floor(c.hoursLeft / 24)}d left`}
                      </p>
                    </div>
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-[0.75rem] font-medium text-[#04310f] transition-transform hover:-translate-y-px"
                      >
                        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} /> WhatsApp
                      </a>
                    ) : (
                      <span className="data shrink-0 text-[0.625rem] text-paper-400 uppercase">
                        no number
                      </span>
                    )}
                  </div>
                );
              })}
              <p className="pt-3 text-[0.75rem] leading-relaxed text-paper-400">
                WhatsApp opens with the message written and their link included. You press send —
                we cannot confirm a number is on WhatsApp until you try.
              </p>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHead
            title="Colours you were asked for"
            sub="Shades a customer wanted that you cannot mix today."
          />
          {data.shadeRequests.length === 0 ? (
            <Empty
              icon={Palette}
              title="No outstanding requests"
              body="When a customer asks for a colour outside what you can tint, it lands here with their name."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {data.shadeRequests.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_11%,transparent)] p-3"
                >
                  <span
                    style={{ background: r.shadeHex }}
                    className="mt-0.5 h-9 w-9 shrink-0 rounded-lg ring-1 ring-white/10"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.875rem] text-paper-50">{r.shadeName}</span>
                      {r.count > 1 && (
                        <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] text-pigment-soft uppercase">
                          {r.count} customers
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[0.75rem] leading-relaxed text-paper-400">
                      Asked for by {r.customerName ?? "a customer"}
                      {r.substituteName && ` — they were offered ${r.substituteName} instead`}.
                    </p>
                  </div>
                </div>
              ))}
              <p className="text-[0.75rem] leading-relaxed text-paper-400">
                These are named customers asking for a named colour, not a forecast. Stocking the
                colorant is a decision you can check against this list.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* --------------------------- surface alerts --------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel>
          <PanelHead
            title="Surface alerts"
            sub="Customers whose photographs showed possible surface issues."
            right={<Basis>{data.providers.vision.disclosure}</Basis>}
          />
          {surfaceAlerts.length === 0 ? (
            <Empty
              icon={CircleCheck}
              title="No surface flags"
              body="No customer has run a surface analysis that came back with something to prepare for."
            />
          ) : (
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {surfaceAlerts.map((s) => (
                <Link
                  key={s.projectId}
                  href="/dashboard/customers"
                  className="flex items-center gap-3 py-3 transition-colors hover:text-paper-50"
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      s.severity === "significant"
                        ? "bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft"
                        : "bg-[color-mix(in_oklab,var(--color-brass)_14%,transparent)] text-[#e0bd72]"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.7} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] text-paper-100">
                      {s.customerName}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.75rem] text-paper-400">
                      {s.headline}
                    </span>
                  </span>
                  <Tag status={s.severity === "significant" ? "critical" : "low"}>
                    {s.severity}
                  </Tag>
                </Link>
              ))}
              <p className="pt-3 text-[0.75rem] leading-relaxed text-paper-400">
                These are readings from photographs, not inspections. Treat them as a reason to ask,
                not as a diagnosis.
              </p>
            </div>
          )}
        </Panel>

        {/* --------------------------- climate ------------------------------- */}
        <Panel>
          <PanelHead
            title="Season & climate"
            sub={`${data.climate.city} · ${SEASON_LABEL[data.climate.season]}`}
            right={
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_oklab,var(--color-glaze)_14%,transparent)] text-[#5fbfb3]">
                <CloudSun className="h-4 w-4" strokeWidth={1.6} />
              </span>
            }
          />
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Typical high" value={`${data.climate.tempC}°C`} />
            <Stat label="Humidity" value={`${data.climate.humidityPct}%`} />
            <Stat label="Rainfall" value={`${data.climate.rainfallMm} mm`} />
          </div>
          <p className="mt-4 rounded-xl border border-[color-mix(in_oklab,var(--color-brass)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-brass)_8%,transparent)] p-3 text-[0.75rem] leading-relaxed text-[#e0bd72]">
            {data.climate.disclosure}
          </p>

          {data.radar.external.length > 0 && (
            <div className="mt-4 border-t border-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)] pt-4">
              <p className="eyebrow mb-3">Stocking signals</p>
              <div className="flex flex-col gap-3">
                {data.radar.external.slice(0, 2).map((s) => (
                  <div key={s.headline}>
                    <div className="flex items-center gap-2">
                      <p className="text-[0.875rem] text-paper-100">{s.headline}</p>
                      {/* The badge is not optional. A demo row that looks like a
                          counted one is the failure mode this page exists to avoid. */}
                      <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.12em] text-paper-400 uppercase">
                        {s.source}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.75rem] leading-relaxed text-paper-400">{s.action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

/* --------------------------------- pieces --------------------------------- */

function ClimateBadge({ climate }: { climate: ClimateContext }) {
  return (
    <span className="data inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-3 py-1.5 text-[0.625rem] tracking-[0.12em] text-paper-300 uppercase">
      <CloudSun className="h-3.5 w-3.5" strokeWidth={1.6} />
      {climate.city} · {climate.tempC}°C · {climate.live ? "live" : "typical"}
    </span>
  );
}

function Basis({ children }: { children: React.ReactNode }) {
  return (
    <span className="hidden max-w-[19rem] items-start gap-1.5 text-[0.6875rem] leading-relaxed text-paper-400 lg:flex">
      <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.7} />
      {children}
    </span>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Radar;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-5 py-8 text-center">
      <Icon className="h-5 w-5 text-paper-400" strokeWidth={1.5} />
      <p className="mt-3 text-[0.875rem] text-paper-200">{title}</p>
      <p className="mt-1.5 max-w-xs text-[0.75rem] leading-relaxed text-paper-400">{body}</p>
    </div>
  );
}

/** Matches the real layout, so the page does not jump when data lands. */
function Skeleton() {
  const shimmer =
    "animate-pulse rounded-xl bg-[color-mix(in_oklab,var(--color-paper-200)_7%,transparent)]";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Panel key={i}>
            <div className={`${shimmer} h-3 w-20`} />
            <div className={`${shimmer} mt-3 h-7 w-28`} />
            <div className={`${shimmer} mt-2 h-2.5 w-24`} />
          </Panel>
        ))}
      </div>
      <Panel className="mt-4">
        <div className={`${shimmer} h-3.5 w-40`} />
        <div className="mt-5 flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className={`${shimmer} h-16 w-full`} />
          ))}
        </div>
      </Panel>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Panel>
          <div className={`${shimmer} h-3.5 w-36`} />
          <div className="mt-5 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`${shimmer} h-9 w-full`} />
            ))}
          </div>
        </Panel>
        <Panel>
          <div className={`${shimmer} h-3.5 w-28`} />
          <div className="mt-5 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${shimmer} h-14 w-full`} />
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
