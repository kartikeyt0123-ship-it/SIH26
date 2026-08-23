import { NextResponse } from "next/server";
import { getSessionByToken, saveSurfaceAnalysis } from "@/server/sessions";
import { buildPrep, overallSeverity, type SurfaceObservation } from "@/lib/surface";
import { providerStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Persist a surface-health reading.
 *
 * The measurement happens in the customer's browser, where the photographs
 * already are. What crosses the network is the resulting observations — never
 * the pixels a second time.
 *
 * The server does NOT trust the client's prep plan or severity. Both are
 * recomputed here from the observations, because those are what the dealer acts
 * on and a tampered request should not be able to tell a dealer that a damp
 * wall needs no waterproofing. The observations themselves are validated for
 * shape and vocabulary before anything is stored.
 */
const CODES = new Set(["cracks", "dampness", "peeling", "stains", "uneven", "deterioration"]);
const SEVERITIES = new Set(["ok", "watch", "attention"]);

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  const raw = Array.isArray(body.observations) ? body.observations : null;
  if (!raw || raw.length === 0 || raw.length > 12) {
    return NextResponse.json({ error: "invalid_observations" }, { status: 400 });
  }

  const observations: SurfaceObservation[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const code = String((o as Record<string, unknown>).code ?? "");
    const severity = String((o as Record<string, unknown>).severity ?? "");
    if (!CODES.has(code) || !SEVERITIES.has(severity)) {
      return NextResponse.json({ error: "invalid_observations" }, { status: 400 });
    }
    observations.push({
      code: code as SurfaceObservation["code"],
      severity: severity as SurfaceObservation["severity"],
      // Confidence is clamped rather than rejected: the cap is a property of
      // the method, so no client may report certainty the method cannot reach.
      confidence: Math.max(0, Math.min(0.72, Number((o as Record<string, unknown>).confidence) || 0)),
      label: String((o as Record<string, unknown>).label ?? "").slice(0, 160),
      evidence: String((o as Record<string, unknown>).evidence ?? "").slice(0, 300),
    });
  }
  if (!observations.length) {
    return NextResponse.json({ error: "invalid_observations" }, { status: 400 });
  }

  const surface = body.surface === "exterior" ? "exterior" : "interior";
  const prep = buildPrep(observations, surface);
  const severity = overallSeverity(observations);
  const engine = providerStatus().vision.engine;

  const imageId = typeof body.imageId === "string" ? body.imageId : null;
  const result = await saveSurfaceAnalysis(
    token,
    {
      engine,
      observations,
      prep,
      severity,
      confidence: Number(body.imageCount) >= 2 ? "medium" : "low",
    },
    imageId,
  );
  if (!result.ok) return fail(result.error);

  const session = await getSessionByToken(token);
  return NextResponse.json({
    session,
    report: { engine, observations, prep, severity },
    disclosure: providerStatus().vision.disclosure,
  });
}

function fail(error: string) {
  const status = error === "expired" ? 410 : error === "closed" ? 409 : 404;
  return NextResponse.json({ error }, { status });
}
