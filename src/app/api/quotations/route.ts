import { NextResponse } from "next/server";
import { buildQuote } from "@/lib/quote";
import type { CustomerSpec } from "@/lib/recommend";
import type { Measurements, SelectedScheme } from "@/lib/session-types";
import { dealerAvailability } from "@/server/availability";
import { getSessionByToken, saveQuotation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §23 — the dealer generates a quotation against the customer's own numbers.
 *
 * Recomputed here rather than trusting whatever total the browser posts: a
 * price is the one thing in this system that must not be client-editable.
 *
 * Availability is checked at the moment of quoting. If a line has gone out of
 * stock since the customer chose it, the request is refused unless the dealer
 * explicitly sets `override` — and the override is recorded on the row, so
 * "why did we quote something we couldn't ship" has an answer later.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!session.project) return NextResponse.json({ error: "no_project" }, { status: 404 });

  const spec = (body.spec ?? session.project.spec) as CustomerSpec | null;
  const measurements = (body.measurements ?? session.project.measurements) as Measurements | null;
  const scheme = (body.scheme ??
    session.project.savedDesigns.find((d) => d.isChosen)?.scheme) as SelectedScheme | null;

  if (!spec || !measurements || !scheme) {
    return NextResponse.json({ error: "incomplete_project" }, { status: 400 });
  }

  const availability = await dealerAvailability(session.dealerId);
  const blocked: string[] = [];
  if (!availability.stockedLineIds.has(scheme.lineId)) blocked.push(scheme.lineId);
  for (const s of Object.values(scheme.shades)) {
    if (!availability.producibleShades.has(s.code)) blocked.push(`${s.name} (${s.code})`);
  }

  const override = body.override === true;
  if (blocked.length && !override) {
    return NextResponse.json(
      {
        error: "unavailable",
        blocked,
        message:
          "One or more items in this design are no longer available. Quote anyway only if you can source them.",
      },
      { status: 409 },
    );
  }

  const quote = buildQuote(spec, scheme, measurements);
  const discountPct = Math.min(100, Math.max(0, Number(body.discountPct) || 0));
  const total = Math.round(quote.subtotal * (1 - discountPct / 100));

  const saved = await saveQuotation({
    dealerId: session.dealerId,
    projectId: session.project.id,
    sessionId: session.id,
    lines: quote.lines,
    areas: quote.areas as unknown as Record<string, unknown>,
    subtotal: quote.subtotal,
    discountPct,
    total,
    overrodeAvailability: blocked.length > 0,
  });

  return NextResponse.json({
    quotationId: saved.id,
    quote,
    discountPct,
    total,
    blocked,
    session: await getSessionByToken(token),
  });
}
