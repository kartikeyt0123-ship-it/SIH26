import { NextResponse } from "next/server";
import { currentDealerId } from "@/server/auth";
import { dealerPerformance, dealerStock } from "@/server/workspace";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stock, trading figures and stocking signals for the signed-in dealer.
 *
 * One request because the Inventory and Overview screens need overlapping
 * slices of it, and two endpoints would mean two round trips for one page.
 * The tenant comes from the cookie; there is no dealer id parameter, which is
 * the whole reason this endpoint replaced the hardcoded constants.
 */
export async function GET(req: Request) {
  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const db = await getDb();
  const [stock, performance, signals] = await Promise.all([
    dealerStock(dealerId),
    dealerPerformance(dealerId),
    db.query.demandSignals.findMany({ where: eq(t.demandSignals.dealerId, dealerId) }),
  ]);

  return NextResponse.json({
    stock,
    performance,
    signals: signals.map((s) => ({
      id: s.id,
      kind: s.kind,
      headline: s.headline,
      reason: s.reason,
      action: s.action,
      categories: s.categories,
      confidence: s.confidence,
      // Rendered as a badge. A demo signal must never look like a counted one.
      source: s.source,
    })),
  });
}
