import { NextResponse } from "next/server";
import {
  deleteSession,
  getSessionByToken,
  saveRequirements,
  saveVisualization,
  setStep,
  touchSession,
  updateContact,
} from "@/server/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Customer: fetch the session and its project.
 *
 * `?touch=1` records the open. The customer app calls it once on load and polls
 * without it, so the open count means "times the customer came back", not
 * "times the page refreshed itself".
 */
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  const touch = new URL(req.url).searchParams.get("touch") === "1";

  const session = touch ? await touchSession(token) : await getSessionByToken(token);
  if (!session) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (session.expired) {
    return NextResponse.json(
      {
        error: "expired",
        expiredAt: session.expiresAt,
        message:
          "This customer session has expired. Please request a new link from your dealer.",
      },
      { status: 410 },
    );
  }
  return NextResponse.json({ session });
}

/** Customer: persist requirements, wizard position or the room analysis. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.spec || body.measurements) {
    const r = await saveRequirements(token, body.spec ?? {}, body.measurements, body.rawText);
    if (!r.ok) return fail(r.error);
  }
  if (body.room) {
    const r = await saveVisualization(
      token,
      body.room,
      body.roomEngine ?? "heuristic-v1",
      body.roomConfidence ?? "low",
    );
    if (!r.ok) return fail(r.error);
  }
  if (body.customerName || body.phone) {
    const r = await updateContact(token, {
      customerName: body.customerName ? String(body.customerName) : undefined,
      phone: body.phone ? String(body.phone) : undefined,
    });
    if (!r.ok) return fail(r.error);
  }
  if (typeof body.step === "number") {
    const r = await setStep(token, body.step);
    if (!r.ok) return fail(r.error);
  }

  const session = await getSessionByToken(token);
  return NextResponse.json({ session });
}

/** Dealer: revoke a link. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const session = await getSessionByToken(token);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await deleteSession(session.id);
  return NextResponse.json({ ok: true });
}

function fail(error: string) {
  const status = error === "expired" ? 410 : error === "closed" ? 409 : 404;
  return NextResponse.json({ error }, { status });
}
