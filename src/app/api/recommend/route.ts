import { NextResponse } from "next/server";
import { recommendSchemes, type CustomerSpec } from "@/lib/recommend";
import { dealerAvailability } from "@/server/availability";
import { getSessionByToken, saveRecommendations } from "@/server/sessions";
import { DEALER_ID } from "@/db/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §14, §15, §33 — inventory-aware recommendation, computed on the server.
 *
 * The pipeline is deterministic end to end:
 *
 *   requirements → product filters → dealer inventory → business rules → ranking
 *
 * No language model decides eligibility. Availability comes from the database,
 * so a product that is out of stock cannot be recommended even if it is the
 * best aesthetic match — which is the entire point of the feature.
 *
 * The generated set is persisted against the project so the dealer sees exactly
 * what the customer was shown, not a re-run that may have shifted with stock.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const spec = body.spec as CustomerSpec | undefined;
  if (!spec) return NextResponse.json({ error: "missing_spec" }, { status: 400 });

  let dealerId = DEALER_ID;
  if (body.token) {
    const session = await getSessionByToken(String(body.token));
    if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });
    dealerId = session.dealerId;
  }

  const availability = await dealerAvailability(dealerId);
  const schemes = recommendSchemes(spec, {
    photoHex: body.photoHex,
    limit: Number(body.limit) || 5,
    availability,
  });

  if (body.token && schemes.length) {
    await saveRecommendations(String(body.token), schemes);
  }

  return NextResponse.json({
    schemes,
    // Surfaced so the UI can explain an empty result honestly rather than
    // showing "no matches" and leaving the customer to guess why.
    stockedLines: availability.stockedLineIds.size,
    producibleShades: availability.producibleShades.size,
  });
}
