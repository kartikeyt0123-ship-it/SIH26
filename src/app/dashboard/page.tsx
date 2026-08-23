"use client";

import Link from "next/link";
import { ArrowUpRight, Boxes, QrCode, Radar, TrendingUp, Users } from "lucide-react";
import { PageHead, Panel, PanelHead, Stat, Tag } from "@/components/dashboard/ui";
import { AwaitingCount, IncomingQueue } from "@/components/dashboard/IncomingQueue";
import { ColourRequests, CustomerSplit } from "@/components/dashboard/CustomerSplit";
import { useWorkspace } from "@/lib/workspace-client";
import { useDealerAccount } from "@/lib/account-client";
import { inr } from "@/lib/utils";

/**
 * Overview answers one question: what needs me today?
 *
 * Everything here is this dealer's own — stock from their shelf, figures from
 * their sales, customers from their links. It previously mixed live session
 * data with hardcoded demo constants, which put another shop's stock levels and
 * revenue on every dealer's front page.
 */

const MODULES = [
  {
    href: "/dashboard/inventory",
    icon: Boxes,
    title: "Inventory",
    body: "Stock by category and brand, with what to boost against demand and weather.",
  },
  {
    href: "/dashboard/customers",
    icon: Users,
    title: "Customers",
    body: "Designs customers have submitted, ready to turn into a quotation.",
  },
  {
    href: "/dashboard/qr",
    icon: QrCode,
    title: "Customer links",
    body: "Issue a unique QR, valid two to three days, for a customer to design their room.",
  },
  {
    href: "/dashboard/intelligence",
    icon: Radar,
    title: "Intelligence",
    body: "Demand radar, taste profiles and who has gone quiet.",
  },
];

export default function Overview() {
  const { data } = useWorkspace();
  const { account } = useDealerAccount();

  const stock = data?.stock ?? [];
  const attention = stock
    .filter((s) => s.status === "critical" || s.status === "low")
    .sort((a, b) => a.daysOfCover - b.daysOfCover)
    .slice(0, 5);

  const month = data?.performance.month;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHead
        eyebrow={account ? `${greeting}, ${account.owner.split(" ")[0]}` : greeting}
        title="Here is what needs you today."
        lede={
          account
            ? `${account.name} · ${account.city}${account.pincode ? ` ${account.pincode}` : ""}`
            : "Loading your shop…"
        }
      />

      {/* Live: appears the moment a customer submits, polls every 5s. */}
      <IncomingQueue />

      <ColourRequests />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const metric =
            m.href === "/dashboard/inventory"
              ? `${stock.filter((s) => s.status !== "healthy" && s.status !== "overstocked").length} items need attention`
              : m.href === "/dashboard/customers"
                ? <AwaitingCount />
                : m.href === "/dashboard/qr"
                  ? "Issue a new code"
                  : "Radar & taste profiles";

          return (
            <Link key={m.href} href={m.href} className="group">
              <Panel className="h-full transition-colors duration-300 group-hover:border-[color-mix(in_oklab,var(--color-pigment)_40%,transparent)] group-hover:bg-ink-700/60">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--color-pigment)_14%,transparent)] text-pigment-soft">
                    <Icon className="h-5 w-5" strokeWidth={1.6} />
                  </span>
                  <ArrowUpRight
                    className="h-4 w-4 text-paper-400 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-paper-50"
                    strokeWidth={1.6}
                  />
                </div>
                <p className="mt-5 text-[1.0625rem] text-paper-50">{m.title}</p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-400">{m.body}</p>
                <p className="data mt-4 text-[0.6875rem] tracking-[0.08em] text-pigment-soft">
                  {metric}
                </p>
              </Panel>
            </Link>
          );
        })}
      </div>

      {/* Split by whether a price has gone out — the distinction that decides
          what the dealer does next. */}
      <CustomerSplit />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHead
            title="Running out first"
            sub="Ranked by days of cover against your own offtake, not by quantity."
            right={
              <Link href="/dashboard/inventory" className="text-[0.8125rem] text-paper-300 hover:text-paper-50">
                All stock
              </Link>
            }
          />
          {attention.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-5 py-8 text-center text-[0.8125rem] text-paper-400">
              Every line has cover against its lead time.
            </p>
          ) : (
            <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
              {attention.map((s) => (
                <div key={s.id} className="flex items-center gap-4 py-3">
                  <span
                    style={{ background: s.hex }}
                    className="h-3.5 w-3.5 shrink-0 rounded-[4px]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.875rem] text-paper-100">
                      {s.product} <span className="text-paper-400">· {s.category}</span>
                    </p>
                    <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                      {s.brand} · {s.litres} L left · lead time {s.leadTimeDays} d
                    </p>
                  </div>
                  <span className="data shrink-0 text-[0.8125rem] text-paper-200">
                    {s.daysOfCover > 900 ? "—" : `${s.daysOfCover} d`}
                  </span>
                  <Tag status={s.status === "critical" ? "critical" : "low"}>
                    {s.status === "critical" ? "act now" : "low"}
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHead title="This month" sub="From your own quotations and sales." />
          {!month || (month.revenue === 0 && month.quotations === 0) ? (
            <p className="rounded-xl border border-dashed border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-5 py-8 text-center text-[0.8125rem] leading-relaxed text-paper-400">
              Nothing closed yet this month. Send a quotation and these figures start filling in.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              <Stat
                label="Revenue"
                value={inr(month.revenue)}
                note={
                  month.revenueDeltaPct === null
                    ? "first month of trading"
                    : `${month.revenueDeltaPct >= 0 ? "+" : ""}${month.revenueDeltaPct}% on last month`
                }
                tone={month.revenueDeltaPct !== null && month.revenueDeltaPct >= 0 ? "up" : "neutral"}
              />
              <Stat
                label="Deals closed"
                value={String(month.deals)}
                note={`of ${month.quotations} quoted`}
              />
              <Stat label="Average basket" value={inr(month.avgBasket)} />
              <Stat
                label="Multi-category"
                value={`${Math.round(month.multiCategoryShare * 100)}%`}
                note="of quotations sent"
                tone={month.multiCategoryShare > 0.5 ? "up" : "neutral"}
              />
            </div>
          )}
        </Panel>
      </div>

      {data && data.signals.length > 0 && (
        <Panel className="mt-4">
          <PanelHead
            title="Signals worth stocking against"
            sub="Each one shows the evidence behind it. Nothing here is a prediction you cannot check."
            right={
              <Link href="/dashboard/inventory" className="text-[0.8125rem] text-paper-300 hover:text-paper-50">
                Act on these
              </Link>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            {data.signals.slice(0, 2).map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="data text-[0.625rem] tracking-[0.12em] text-paper-400 uppercase">
                    {s.kind}
                  </span>
                  <span className="data rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_18%,transparent)] px-2 py-0.5 text-[0.5625rem] tracking-[0.12em] text-paper-400 uppercase">
                    {s.source}
                  </span>
                </div>
                <p className="mt-3 text-[0.9375rem] text-paper-50">{s.headline}</p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-400">{s.action}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
