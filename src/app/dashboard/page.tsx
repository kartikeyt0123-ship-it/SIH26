import Link from "next/link";
import { ArrowUpRight, Boxes, QrCode, TrendingUp, Users } from "lucide-react";
import { PageHead, Panel, PanelHead, Stat, Tag, CategoryChip } from "@/components/dashboard/ui";
import { AwaitingCount, IncomingQueue } from "@/components/dashboard/IncomingQueue";
import {
  DEALER,
  MONTH,
  PROPOSALS,
  SIGNALS,
  STOCK,
  proposalTotal,
  daysOfCover,
  stockStatus,
} from "@/lib/demo";
import { inr } from "@/lib/utils";

/**
 * Overview answers one question: what needs me today?
 *
 * The four module tiles are the map. Everything under them is triage — the
 * items that would otherwise be discovered too late.
 */

const MODULES = [
  {
    href: "/dashboard/inventory",
    icon: Boxes,
    title: "Inventory",
    body: "Stock by category and brand, with what to boost against demand and weather.",
    metric: () => `${STOCK.filter((s) => stockStatus(s) !== "healthy").length} items need attention`,
  },
  {
    href: "/dashboard/customers",
    icon: Users,
    title: "Customers",
    body: "Designs customers have submitted, ready to turn into a quotation.",
    metric: () => <AwaitingCount />,
  },
  {
    href: "/dashboard/qr",
    icon: QrCode,
    title: "Customer links",
    body: "Issue a unique QR, valid two to three days, for a customer to design their room.",
    metric: () => "2 links live now",
  },
  {
    href: "/dashboard/performance",
    icon: TrendingUp,
    title: "Performance",
    body: "Recent deals, revenue and what is actually selling.",
    metric: () => `${inr(MONTH.revenue)} this month`,
  },
];

export default function Overview() {
  const attention = STOCK.map((s) => ({ s, cover: daysOfCover(s), status: stockStatus(s) }))
    .filter((r) => r.status === "critical" || r.status === "low")
    .sort((a, b) => a.cover - b.cover)
    .slice(0, 5);

  const awaiting = PROPOSALS.filter((p) => p.status === "new");

  return (
    <>
      <PageHead
        eyebrow={`Good afternoon, ${DEALER.owner.split(" ")[0]}`}
        title="Here is what needs you today."
        lede={`${DEALER.name} · ${DEALER.city} ${DEALER.pincode}`}
      />

      {/* Live: appears the moment a customer submits, polls every 5s. */}
      <IncomingQueue />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MODULES.map((m) => {
          const Icon = m.icon;
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
                  {m.metric()}
                </p>
              </Panel>
            </Link>
          );
        })}
      </div>

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
          <div className="divide-y divide-[color-mix(in_oklab,var(--color-paper-200)_8%,transparent)]">
            {attention.map(({ s, cover, status }) => (
              <div key={s.id} className="flex items-center gap-4 py-3">
                <CategoryChip type={s.type} showLabel={false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] text-paper-100">
                    {s.product} <span className="text-paper-400">· {s.variant}</span>
                  </p>
                  <p className="data mt-0.5 text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                    {s.brand} · {s.qty} {s.unit} left · lead time {s.leadTimeDays} d
                  </p>
                </div>
                <span className="data shrink-0 text-[0.8125rem] text-paper-200">{cover} d</span>
                <Tag status={status === "critical" ? "critical" : "low"}>
                  {status === "critical" ? "act now" : "low"}
                </Tag>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHead title="This month" />
            <div className="grid grid-cols-2 gap-5">
              <Stat
                label="Revenue"
                value={inr(MONTH.revenue)}
                note={`+${MONTH.revenueDeltaPct}% on last month`}
                tone="up"
              />
              <Stat label="Deals closed" value={String(MONTH.deals)} note={`of ${MONTH.quotations} quoted`} />
              <Stat label="Average basket" value={inr(MONTH.avgBasket)} />
              <Stat
                label="Multi-category"
                value={`${Math.round(MONTH.multiCategoryShare * 100)}%`}
                note="of closed deals"
                tone="up"
              />
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Awaiting your quotation" sub={`${awaiting.length} customer designs`} />
            <div className="flex flex-col gap-3">
              {awaiting.map((p) => (
                <Link
                  key={p.id}
                  href="/dashboard/customers"
                  className="flex items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-3 transition-colors hover:border-[color-mix(in_oklab,var(--color-pigment)_40%,transparent)]"
                >
                  <span className="flex gap-1">
                    {p.palette.slice(0, 3).map((c) => (
                      <span key={c} style={{ background: c }} className="h-7 w-2.5 rounded-sm" />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] text-paper-100">{p.customer}</span>
                    <span className="data block text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                      {p.space} · {p.sqft} sq ft
                    </span>
                  </span>
                  <span className="data shrink-0 text-[0.8125rem] text-paper-200">
                    {inr(proposalTotal(p))}
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>

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
          {SIGNALS.slice(0, 2).map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4"
            >
              <div className="flex items-center gap-2">
                {s.categories.map((c) => (
                  <CategoryChip key={c} type={c} showLabel={false} />
                ))}
                <span className="data text-[0.625rem] tracking-[0.12em] text-paper-400 uppercase">
                  {s.kind}
                </span>
              </div>
              <p className="mt-3 text-[0.9375rem] text-paper-50">{s.headline}</p>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-paper-400">{s.action}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
