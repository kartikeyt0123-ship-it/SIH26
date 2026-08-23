import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { displayPhone, openLogin } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registered dealer accounts, for the sign-in screen.
 *
 * ONLY EXPOSED IN DEMO MODE. This is a directory of who is on the platform, and
 * while open login is on, a phone number here is effectively the credential —
 * so the endpoint is gated on exactly the same switch. With STRICT_LOGIN=1 it
 * returns nothing at all rather than a shorter list, because a partial
 * directory is still a directory.
 *
 * It exists so an account created a minute ago through sign-up can be opened
 * again without anyone having to remember which number they typed.
 */
export async function GET() {
  if (!openLogin()) return NextResponse.json({ openLogin: false, accounts: [] });

  const db = await getDb();
  const rows = await db.query.dealers.findMany({ orderBy: desc(t.dealers.createdAt) });

  return NextResponse.json({
    openLogin: true,
    accounts: rows
      .filter((d) => d.phone)
      .slice(0, 12)
      .map((d) => ({
        name: d.name,
        owner: d.owner,
        city: d.city,
        phone: d.phone as string,
        display: displayPhone(d.phone as string),
      })),
  });
}
