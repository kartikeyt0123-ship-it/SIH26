import { NextResponse } from "next/server";
import { COOKIE, cookieOptions } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Same attributes as when it was set, with a zero lifetime — a cookie cleared
  // with a different path or sameSite is simply a second cookie, and the
  // original stays in the browser signed in.
  res.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
