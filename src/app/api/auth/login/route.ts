import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, issueCookie, loginWithOtp, loginWithPassword } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in, by password or by one-time code.
 *
 * Both are offered because both are real: a dealer at his own counter wants a
 * password, and one who has forgotten it needs a way in that does not involve
 * a support call. Either route ends in the same signed cookie.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone ?? "");

  const result =
    body.mode === "otp"
      ? await loginWithOtp(phone, String(body.code ?? ""))
      : await loginWithPassword(phone, String(body.password ?? ""));

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: MESSAGES[result.error] ?? "Could not sign in." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true, dealerId: result.dealerId });
  res.cookies.set(COOKIE, await issueCookie(result.dealerId), cookieOptions);
  return res;
}

const MESSAGES: Record<string, string> = {
  invalid_phone: "Enter a valid 10-digit Indian mobile number.",
  // Deliberately identical for a wrong password and an unknown number: telling
  // them apart turns this form into a way to discover which shops are on the
  // platform.
  bad_credentials: "That number and password do not match.",
  no_account: "No account found for that number.",
  no_code: "Request a code first.",
  expired: "That code has expired. Ask for a new one.",
  wrong_code: "That code is not right.",
  too_many_attempts: "Too many attempts. Request a fresh code.",
};
