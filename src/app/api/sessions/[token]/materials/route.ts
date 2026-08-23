import { NextResponse } from "next/server";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";
import { companionMaterials, groupForCustomer, MATERIAL_ENGINE, type GraphContext } from "@/lib/materials";
import { climateAdvice, resolveClimate } from "@/lib/climate";
import { getSessionByToken, saveClimateContext } from "@/server/sessions";
import { dealerMaterialCategories } from "@/server/intelligence";
import { providerStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The combined recommendation context: materials + climate.
 *
 * These two are served together because they answer one question — "given this
 * wall colour, this room and this weather, what else does the job need?" —
 * and because splitting them would mean the customer's phone making two
 * requests to render one panel.
 *
 * The dealer's city comes from the dealer record, never from the client. A
 * customer could otherwise ask for Mumbai's monsoon and get advice for a wall
 * in Kanpur.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });

  const mainHex = HEX.test(String(body.mainHex ?? "")) ? String(body.mainHex) : "#e8e2d6";
  const accentHex = HEX.test(String(body.accentHex ?? "")) ? String(body.accentHex) : "#6b7a63";
  const surface = body.surface === "exterior" ? "exterior" : "interior";
  const conditions = Array.isArray(body.conditions)
    ? body.conditions.filter((c: unknown): c is string => typeof c === "string").slice(0, 8)
    : [];

  const db = await getDb();
  const dealer = await db.query.dealers.findFirst({ where: eq(t.dealers.id, session.dealerId) });

  const [stockedCategories, climate] = await Promise.all([
    dealerMaterialCategories(session.dealerId),
    resolveClimate({ city: dealer?.city ?? null, lat: dealer?.lat, lon: dealer?.lon }),
  ]);

  const ctx: GraphContext = {
    surface,
    conditions,
    roomType: typeof body.roomType === "string" ? body.roomType : "room",
    roomSize: body.roomSize === "small" || body.roomSize === "large" ? body.roomSize : "medium",
    budget: typeof body.budget === "string" ? body.budget : "mid",
    mainHex,
    accentHex,
    paletteFamily: typeof body.paletteFamily === "string" ? body.paletteFamily : undefined,
    stockedCategories,
  };

  const suggestions = companionMaterials(ctx);
  const advice = climateAdvice(climate, { surface, conditions });

  // Recorded against the project so the dealer can see what the recommendation
  // assumed. Best-effort: a closed or submitted session cannot be written to,
  // and that must not stop the panel rendering.
  await saveClimateContext(token, {
    city: dealer?.city ?? null,
    source: climate.source,
    data: climate as unknown as Record<string, unknown>,
  }).catch(() => undefined);

  return NextResponse.json({
    materials: {
      engine: MATERIAL_ENGINE,
      groups: groupForCustomer(suggestions),
      all: suggestions,
      disclosure: providerStatus().materials.disclosure,
    },
    climate: {
      context: climate,
      advice,
      /** False for the built-in table. The UI must not say "now" when false. */
      live: climate.live,
      disclosure: climate.disclosure,
    },
  });
}
