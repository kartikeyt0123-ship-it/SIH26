import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, issueCookie, signup } from "@/server/auth";
import { seedDealerCatalogue } from "@/db/seed";
import { seedDealerWorkspace } from "@/db/workspace-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a dealer account and sign them straight in.
 *
 * A brand-new dealer with an empty catalogue would land on a console where
 * every screen is blank and the customer app can recommend nothing — the
 * inventory filter is absolute, so zero stock means zero schemes. So the
 * account is opened with the standard catalogue and a starting stock position,
 * which they then correct from the Inventory screen or a Tally import. That is
 * a far better first five minutes than an empty shop.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const result = await signup({
    phone: String(body.phone ?? ""),
    code: String(body.code ?? ""),
    password: String(body.password ?? ""),
    shopName: String(body.shopName ?? ""),
    owner: String(body.owner ?? ""),
    city: String(body.city ?? ""),
    pincode: body.pincode ? String(body.pincode) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: MESSAGES[result.error] ?? "Could not create the account." },
      { status: result.error === "already_registered" ? 409 : 400 },
    );
  }

  await seedDealerCatalogue(result.dealerId);
  // Their own demo customers, designs and quotations — so no panel opens empty,
  // and every row belongs to this dealer rather than to a shared demo shop.
  await seedDealerWorkspace(result.dealerId).catch(() => undefined);

  const res = NextResponse.json({ ok: true, dealerId: result.dealerId });
  res.cookies.set(COOKIE, await issueCookie(result.dealerId), cookieOptions);
  return res;
}

const MESSAGES: Record<string, string> = {
  invalid_phone: "Enter a valid 10-digit Indian mobile number.",
  weak_password: "Choose a password of at least six characters.",
  missing_details: "Shop name and city are both required.",
  already_registered: "That number already has an account. Sign in instead.",
  no_code: "Request a code first.",
  expired: "That code has expired. Ask for a new one.",
  wrong_code: "That code is not right.",
  too_many_attempts: "Too many attempts. Request a fresh code.",
};
