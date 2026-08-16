import { NextResponse } from "next/server";
import { dealerCatalogue } from "@/server/availability";
import { DEALER_ID } from "@/db/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * §8 / §9 — the brands and paint types a customer may choose between.
 *
 * Derived from this dealer's stocked inventory, never hardcoded. A dealer who
 * does not carry Dulux never shows a customer a Dulux option, which is the
 * whole reason this endpoint exists instead of a constant in the client.
 */
export async function GET(req: Request) {
  const dealerId = new URL(req.url).searchParams.get("dealerId") ?? DEALER_ID;
  return NextResponse.json(await dealerCatalogue(dealerId));
}
