"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  LayoutGrid,
  LogOut,
  QrCode,
  TrendingUp,
  Users,
} from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { DEALER } from "@/lib/demo";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/inventory", label: "Inventory", icon: Boxes },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/qr", label: "Customer links", icon: QrCode },
  { href: "/dashboard/performance", label: "Performance", icon: TrendingUp },
];

/**
 * Console shell.
 *
 * A rail, not a drawer: five destinations is few enough that hiding them behind
 * a hamburger costs a tap for nothing. On mobile the same five collapse into a
 * bottom bar, which is where a thumb already is on a counter phone.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  return (
    <div className="min-h-[100svh] bg-ink-900">
      {/* rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[15.5rem] flex-col border-r border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-ink-800/50 px-4 py-6 lg:flex">
        <Link href="/" className="mb-9 flex items-center gap-2.5 px-2 text-[1.05rem]">
          <LogoMark className="h-6 w-6" />
          <Wordmark />
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const on = path === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.875rem] transition-colors duration-200",
                  on ? "bg-ink-700 text-paper-50" : "text-paper-300 hover:bg-ink-700/50 hover:text-paper-50",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1/2 left-0 h-5 w-[2px] -translate-y-1/2 rounded-full bg-pigment transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    on ? "scale-y-100" : "scale-y-0",
                  )}
                />
                <Icon className={cn("h-[1.05rem] w-[1.05rem]", on && "text-pigment")} strokeWidth={1.6} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] p-4">
          <p className="text-[0.8125rem] text-paper-100">{DEALER.name}</p>
          <p className="data mt-1 text-[0.625rem] tracking-[0.1em] text-paper-400 uppercase">
            {DEALER.city} · {DEALER.tier} plan
          </p>
          <Link
            href="/login"
            className="mt-3 inline-flex items-center gap-2 text-[0.75rem] text-paper-400 transition-colors hover:text-paper-50"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} /> Sign out
          </Link>
        </div>
      </aside>

      {/* content */}
      <div className="lg:pl-[15.5rem]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_82%,transparent)] px-5 py-3.5 backdrop-blur-xl sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-[1rem] lg:hidden">
            <LogoMark className="h-5 w-5" />
            <Wordmark />
          </Link>
          <p className="hidden text-[0.8125rem] text-paper-400 lg:block">
            Demo workspace · every figure below is synthetic
          </p>
          <div className="flex items-center gap-3">
            <span className="data hidden rounded-full border border-[color-mix(in_oklab,var(--color-paper-200)_14%,transparent)] px-3 py-1.5 text-[0.625rem] tracking-[0.12em] text-paper-300 uppercase sm:inline-flex">
              16 Aug · Kanpur · 34°C
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pigment text-[0.75rem] font-medium text-white">
              RS
            </span>
          </div>
        </header>

        <main className="px-5 py-8 pb-28 sm:px-8 lg:pb-14">{children}</main>
      </div>

      {/* mobile bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[color-mix(in_oklab,var(--color-paper-200)_10%,transparent)] bg-[color-mix(in_oklab,var(--color-ink-900)_92%,transparent)] backdrop-blur-xl lg:hidden">
        {NAV.map((item) => {
          const on = path === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.5625rem] tracking-[0.06em] uppercase transition-colors",
                on ? "text-pigment" : "text-paper-400",
              )}
            >
              <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.6} />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
