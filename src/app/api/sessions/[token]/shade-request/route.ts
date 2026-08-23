import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { getSessionByToken } from "@/server/sessions";
import { SHADE_BY_CODE, SHADES } from "@/lib/catalog";
import { findSubstitutes, substituteHeadline } from "@/lib/substitute";
import { dealerAvailability } from "@/server/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * A colour the dealer cannot mix today: what to use instead, and how to ask.
 *
 * GET returns the nearest producible alternatives. POST records the request
 * against the dealer, where it surfaces on the Overview as real demand from a
 * named customer — which is the only reason it is worth capturing at all.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const code = new URL(req.url).searchParams.get("code");
  const surface = new URL(req.url).searchParams.get("surface") === "exterior" ? "exterior" : "interior";

  const wanted = code ? SHADE_BY_CODE.get(code) : undefined;
  if (!wanted) return NextResponse.json({ error: "unknown_shade" }, { status: 404 });

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });

  const avail = await dealerAvailability(session.dealerId);
  const producible = SHADES.filter((s) => avail.producibleShades.has(s.code));

  // Already available: answer plainly rather than offering alternatives to a
  // colour the customer can simply have.
  if (avail.producibleShades.has(wanted.code)) {
    return NextResponse.json({ available: true, wanted, substitutes: [], headline: "" });
  }

  const substitutes = findSubstitutes(wanted, producible, { surface });
  return NextResponse.json({
    available: false,
    wanted,
    substitutes,
    headline: substituteHeadline(wanted, substitutes[0]),
  });
}

/** Ask the dealer to stock a colour they cannot currently mix. */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  const wanted = SHADE_BY_CODE.get(String(body.code ?? ""));
  if (!wanted) return NextResponse.json({ error: "unknown_shade" }, { status: 400 });

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });

  const db = await getDb();

  // One open request per customer per shade. Without this, tapping the button
  // twice puts the same ask on the dealer's Overview twice and makes a queue of
  // duplicates look like a queue of demand.
  const dupe = await db.query.shadeRequests.findFirst({
    where: and(
      eq(t.shadeRequests.sessionId, session.id),
      eq(t.shadeRequests.shadeCode, wanted.code),
    ),
  });
  if (dupe) return NextResponse.json({ ok: true, id: dupe.id, duplicate: true });

  const sub = body.substituteCode ? SHADE_BY_CODE.get(String(body.substituteCode)) : undefined;

  const id = `sr_${randomUUID()}`;
  await db.insert(t.shadeRequests).values({
    id,
    dealerId: session.dealerId,
    projectId: session.project?.id ?? null,
    sessionId: session.id,
    shadeCode: wanted.code,
    shadeName: wanted.name,
    shadeHex: wanted.hex,
    substituteCode: sub?.code ?? null,
    substituteName: sub?.name ?? null,
    customerName: session.customerName,
    customerPhone: session.phone,
    status: "OPEN",
  });

  return NextResponse.json({ ok: true, id });
}
