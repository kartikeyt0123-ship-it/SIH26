import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { createSession, listSessions } from "@/server/sessions";
import { currentDealerId } from "@/server/auth";
import { customerUrl, isPubliclyReachable, publicAppUrl, SESSION_DURATION_HOURS } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dealer: list every session issued, newest first. */
export async function GET(req: Request) {
  // The tenant comes from the signed cookie. Never from a query parameter:
  // an id a client can type is not a boundary.
  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const sessions = await listSessions(dealerId);
  const origin = publicAppUrl(new URL(req.url).origin);

  return NextResponse.json({
    origin,
    publicReachable: isPubliclyReachable(origin),
    sessions: sessions.map((s) => ({ ...s, url: customerUrl(origin, s.token) })),
  });
}

/**
 * Dealer: issue a customer session and return a genuinely scannable QR.
 *
 * The QR is rendered server-side against the configured public origin, never
 * against the address this server happens to be listening on. A QR containing
 * localhost is worse than no QR — it looks like it works right up until a
 * customer points a phone at it.
 */
export async function POST(req: Request) {
  const dealerId = await currentDealerId(req);
  if (!dealerId) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const origin = publicAppUrl(new URL(req.url).origin);

  // `Number(x) || default` would silently turn a requested 0 into the default,
  // which is the difference between "this link is dead" and "this link is open
  // for three days". Validate the value instead of coercing it.
  const requested = Number(body.validityHours);
  const validityHours =
    Number.isFinite(requested) && requested >= 0 ? requested : SESSION_DURATION_HOURS;

  const session = await createSession({
    dealerId,
    customerName: String(body.customerName ?? ""),
    phone: body.phone ? String(body.phone) : undefined,
    validityHours,
  });

  const url = customerUrl(origin, session.token);

  const qr = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 720,
    // Brand ink on paper. Kept high-contrast: a stylised QR that scanners
    // struggle with in shop lighting is a decoration, not a feature.
    color: { dark: "#0c0e11ff", light: "#f7f4eeff" },
  });

  return NextResponse.json({
    session: { ...session, url },
    url,
    qr,
    publicReachable: isPubliclyReachable(origin),
    origin,
  });
}
