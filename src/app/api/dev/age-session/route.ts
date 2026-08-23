import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { currentDealerId } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dev-only: age a customer session so time-based behaviour can be demonstrated.
 *
 * The inactivity alert and session expiry are both real and both wait on the
 * clock, which makes them impossible to show in a walkthrough without either
 * faking the panel or waiting a day. This moves a session's timestamps
 * backwards so the genuine code path runs against genuinely old data — nothing
 * is mocked, the rule is simply given something to find.
 *
 * Refuses outright in production, and only ever touches the caller's own
 * sessions.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const days = Math.max(0, Math.min(30, Number(body.days) || 3));

  const db = await getDb();
  const session = await db.query.customerSessions.findFirst({
    where: eq(t.customerSessions.token, token),
  });
  if (!session || session.dealerId !== dealerId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const when = new Date(Date.now() - days * 86_400_000);
  await db
    .update(t.customerSessions)
    .set({ lastSeenAt: when, createdAt: when })
    .where(eq(t.customerSessions.id, session.id));

  return NextResponse.json({ ok: true, token, agedDays: days });
}
