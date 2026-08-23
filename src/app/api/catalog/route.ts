import { NextResponse } from "next/server";
import { dealerCatalogue } from "@/server/availability";
import { getSessionByToken } from "@/server/sessions";
import { currentDealerId } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §8 / §9 — the brands and paint types a customer may choose between.
 *
 * Derived from a dealer's stocked inventory, never hardcoded. A dealer who does
 * not carry Dulux never shows a customer a Dulux option, which is the whole
 * reason this endpoint exists instead of a constant in the client.
 *
 * WHICH dealer is resolved from the caller's own credential, never from a query
 * parameter. A customer supplies their session token and gets that session's
 * dealer; a signed-in dealer gets their own shop. Accepting `?dealerId=` would
 * let anyone read any dealer's catalogue and price list by guessing an id.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");

  if (token) {
    const session = await getSessionByToken(token);
    if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });
    return NextResponse.json(await dealerCatalogue(session.dealerId));
  }

  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  return NextResponse.json(await dealerCatalogue(dealerId));
}
