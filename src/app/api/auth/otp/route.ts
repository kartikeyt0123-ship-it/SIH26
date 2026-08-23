import { NextResponse } from "next/server";
import { sendOtp } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issue a one-time code.
 *
 * The response carries `channel`. When it is "console" no SMS exists and the
 * code is returned so the screen can show it, captioned as undelivered — see
 * `server/sms.ts`. The UI must key its wording off `channel` rather than
 * assuming a message went out.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const purpose = body.purpose === "login" ? "login" : "signup";

  const result = await sendOtp(String(body.phone ?? ""), purpose);
  if (!result.ok) {
    const status = result.error === "invalid_phone" ? 400 : 409;
    return NextResponse.json({ error: result.error, message: MESSAGES[result.error] ?? "Could not send a code." }, { status });
  }

  return NextResponse.json({ ok: true, ...result.delivery });
}

const MESSAGES: Record<string, string> = {
  invalid_phone: "Enter a valid 10-digit Indian mobile number.",
  already_registered: "That number already has an account. Sign in instead.",
  no_account: "No account found for that number. Create one first.",
};
