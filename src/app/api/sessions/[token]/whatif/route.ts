import { NextResponse } from "next/server";
import { recommendSchemes, type CustomerSpec } from "@/lib/recommend";
import { applyIntent, biasFor, OPTION_BY_INTENT, WHATIF_ENGINE, type Intent } from "@/lib/whatif";
import { dealerAvailability } from "@/server/availability";
import { getSessionByToken, saveVariation } from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * What-If generation.
 *
 * The important line in this file is the one that calls `recommendSchemes`.
 * There is exactly one recommendation engine in this application, and What-If
 * is a caller of it: the intent changes the brief, and the same engine runs
 * against the same live inventory. That is what makes a What-If result
 * saveable and quotable rather than a picture the dealer cannot supply.
 *
 * The bias pass afterwards only re-ORDERS what the engine already declared
 * eligible. It can never introduce a scheme, and it can never resurrect one the
 * stock check removed.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  const intent = String(body.intent ?? "") as Intent;
  const option = OPTION_BY_INTENT.get(intent);
  if (!option) return NextResponse.json({ error: "unknown_intent" }, { status: 400 });

  const baseSpec = body.spec as CustomerSpec | undefined;
  if (!baseSpec || typeof baseSpec !== "object") {
    return NextResponse.json({ error: "missing_spec" }, { status: 400 });
  }

  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (session.expired) return NextResponse.json({ error: "expired" }, { status: 410 });

  const { spec, changed } = applyIntent(baseSpec, intent);
  const availability = await dealerAvailability(session.dealerId);

  // Ask for more than we will show, so the bias re-sort has something to choose
  // between. Re-sorting three results is not exploration.
  const generated = recommendSchemes(spec, {
    photoHex: typeof body.photoHex === "string" ? body.photoHex : undefined,
    limit: 8,
    availability,
  });

  const bias = biasFor(intent);
  const schemes = [...generated].sort((a, b) => bias(b) - bias(a)).slice(0, 3);

  // An empty result is a real outcome and is returned as one. "Nothing in stock
  // matches that direction" is useful; five schemes that ignore the request are
  // not, and inventing them would break the promise the whole product rests on.
  if (schemes.length && !session.project?.submittedAt) {
    await saveVariation(token, {
      intent,
      baseSpec: baseSpec as unknown as Record<string, unknown>,
      schemes,
      engine: WHATIF_ENGINE,
    });
  }

  return NextResponse.json({
    intent,
    prompt: option.prompt,
    schemes,
    changed,
    engine: WHATIF_ENGINE,
    /** Why the list may be short or empty — shown rather than left to guess. */
    stockedLines: availability.stockedLineIds.size,
    producibleShades: availability.producibleShades.size,
  });
}
