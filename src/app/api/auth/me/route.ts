import { NextResponse } from "next/server";
import { currentDealer, displayPhone } from "@/server/auth";
import { smsConfigured } from "@/server/sms";
import { resolveClimate } from "@/lib/climate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who is signed in. The console calls this to render the account panel. */
export async function GET(req: Request) {
  const dealer = await currentDealer(req);
  if (!dealer) return NextResponse.json({ dealer: null }, { status: 200 });

  // Live conditions for the console header. Folded into this call rather than
  // given its own endpoint: the shell already loads /me on every page, and a
  // second request for one badge is a round trip for nothing.
  const climate = await resolveClimate({
    city: dealer.city,
    lat: dealer.lat,
    lon: dealer.lon,
  }).catch(() => null);

  return NextResponse.json({
    climate: climate
      ? { city: climate.city, tempC: climate.tempC, live: climate.live, humidityPct: climate.humidityPct }
      : null,
    dealer: {
      id: dealer.id,
      name: dealer.name,
      owner: dealer.owner,
      city: dealer.city,
      pincode: dealer.pincode,
      phone: dealer.phone ? displayPhone(dealer.phone) : null,
      tier: dealer.tier,
      // Present so the console can tell the dealer why the weather panel is
      // showing typical figures instead of a live reading.
      hasCoords: dealer.lat !== null && dealer.lon !== null,
    },
    smsConfigured: smsConfigured(),
  });
}
