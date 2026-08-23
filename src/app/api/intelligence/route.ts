import { NextResponse } from "next/server";
import { currentDealerId } from "@/server/auth";
import { dealerIntelligence } from "@/server/intelligence";
import { resolveClimate } from "@/lib/climate";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { providerStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The dealer Intelligence tab, in one request.
 *
 * Dealer-side, so it sits behind the password gate in `middleware.ts` — it
 * aggregates every customer this dealer has. It takes no dealer id from the
 * client for the same reason `/api/sessions` does not: the tenant is decided
 * server-side or it is not a tenant boundary at all.
 */
export async function GET(req: Request) {
  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const db = await getDb();
  const dealer = await db.query.dealers.findFirst({ where: eq(t.dealers.id, dealerId) });

  const [intel, climate] = await Promise.all([
    dealerIntelligence(dealerId),
    resolveClimate({ city: dealer?.city ?? null, lat: dealer?.lat, lon: dealer?.lon }),
  ]);

  return NextResponse.json({
    ...intel,
    climate,
    dealer: dealer ? { name: dealer.name, city: dealer.city } : null,
    // Sent so the UI can render how each panel was produced without hardcoding
    // a claim that would go stale the moment a provider is configured.
    providers: providerStatus(),
  });
}
