"use client";

import Link from "next/link";
import { ArrowUpRight, Bell } from "lucide-react";
import { Panel, Tag } from "@/components/dashboard/ui";
import type { SelectedScheme } from "@/lib/session-types";
import { useDealerSessions } from "@/lib/store";
import { cn, inr } from "@/lib/utils";

/**
 * New designs, on the overview.
 *
 * The dealer should not have to remember to open the Customers tab. This polls
 * the same endpoint the queue does, so a design submitted on a phone across
 * town surfaces here within a few seconds of the customer pressing send.
 *
 * It renders nothing at all when there is nothing waiting — a permanent empty
 * "0 new" panel trains people to stop looking at it.
 */
export function IncomingQueue() {
  const { sessions, ready } = useDealerSessions();

  const submitted = sessions.filter((s) => s.project?.status === "SUBMITTED");
  if (!ready || submitted.length === 0) return null;

  return (
    <Panel className="mb-4 border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-pigment)_8%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--color-pigment)_20%,transparent)] text-pigment-soft">
            <Bell className="h-4 w-4" strokeWidth={1.8} />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pigment opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pigment" />
            </span>
          </span>
          <div>
            <p className="text-[1rem] text-paper-50">
              {submitted.length} new design{submitted.length > 1 ? "s" : ""} from customers
            </p>
            <p className="text-[0.8125rem] text-paper-300">
              Sent from their phones. Waiting on a quotation from you.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/customers"
          className="group inline-flex h-10 items-center gap-2 rounded-full bg-paper-50 px-4 text-[0.875rem] font-medium text-ink-900"
        >
          Open the queue
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            strokeWidth={1.8}
          />
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {submitted.slice(0, 6).map((s) => {
          const chosen = s.project?.savedDesigns.find((d) => d.isChosen)?.scheme as
            | unknown as SelectedScheme
            | undefined;
          const when = s.project?.submittedAt
            ? new Date(s.project.submittedAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : "";
          return (
            <Link
              key={s.token}
              href="/dashboard/customers"
              className={cn(
                "flex items-center gap-3 rounded-xl border border-[color-mix(in_oklab,var(--color-paper-200)_12%,transparent)] bg-ink-900/50 p-3",
                "transition-colors duration-300 hover:border-[color-mix(in_oklab,var(--color-pigment)_45%,transparent)]",
              )}
            >
              <span className="flex shrink-0 gap-1">
                {chosen ? (
                  Object.values(chosen.shades).map((c) => (
                    <span key={c.code} style={{ background: c.hex }} className="h-9 w-2.5 rounded-sm" />
                  ))
                ) : (
                  <span className="h-9 w-9 rounded-sm bg-ink-700" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.875rem] text-paper-50">
                  {s.customerName}
                </span>
                <span className="data block truncate text-[0.625rem] tracking-[0.08em] text-paper-400 uppercase">
                  {String(s.project?.spec?.roomType ?? "space")} · {when}
                </span>
                {s.phone && (
                  <span className="data block truncate text-[0.625rem] text-paper-400">
                    {s.phone}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Tag status="new">new</Tag>
                {s.project?.quotation && (
                  <span className="data text-[0.625rem] text-paper-400">
                    {inr(s.project.quotation.total)}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

/** Live count for the Customers tile, so the overview never quotes a stale figure. */
export function AwaitingCount() {
  const { sessions, ready } = useDealerSessions();
  if (!ready) return <>…</>;
  const n = sessions.filter((s) => s.project?.status === "SUBMITTED").length;
  return <>{n} awaiting quotation</>;
}
