/**
 * Dealer accounts: sign-up, sign-in, and the session cookie.
 *
 * Replaces the shared-password gate. That gate was one secret for every dealer,
 * which is fine for a single demo shop and wrong the moment there are two:
 * anyone who had the password could read every customer's photographs, phone
 * number and quotation. Accounts make the tenant boundary real — `dealerId`
 * comes from a signed cookie, never from a query parameter a client can edit.
 *
 * WHAT IS DELIBERATELY NOT HERE: an SMS provider. `sendOtp` hands the code to
 * whatever channel `server/sms.ts` resolves, and when none is configured that
 * channel returns the code to the caller, clearly labelled as undelivered. It
 * never reports a message as sent when nothing left the building.
 */

import { randomInt, randomUUID } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { deliverOtp, type OtpDelivery } from "./sms";
import { geocodeCity } from "@/lib/climate";

export { hashSecret, verifySecret } from "./hash";
import { hashSecret, verifySecret } from "./hash";

export { COOKIE, cookieOptions, issueCookie, readCookie } from "@/lib/dealer-cookie";
import { dealerFromCookieHeader } from "@/lib/dealer-cookie";

/* --------------------------------- phone --------------------------------- */

/**
 * One canonical form for a number, so "+91 98765 43210", "098765 43210" and
 * "9876543210" are the same account rather than three.
 */
export function normalisePhone(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return null;
  if (!/^[6-9]/.test(ten)) return null;
  return ten;
}

export const displayPhone = (ten: string) => `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
/** E.164, which is what wa.me links require. */
export const e164 = (ten: string) => `91${ten}`;

/* ---------------------------------- OTP ---------------------------------- */

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export type OtpResult = { ok: true; delivery: OtpDelivery } | { ok: false; error: string };

export async function sendOtp(phoneRaw: string, purpose: "signup" | "login"): Promise<OtpResult> {
  const phone = normalisePhone(phoneRaw);
  if (!phone) return { ok: false, error: "invalid_phone" };

  const db = await getDb();
  const existing = await db.query.dealers.findFirst({ where: eq(t.dealers.phone, phone) });

  // Checked here rather than at verification, so a dealer typing a number that
  // is already registered is told immediately instead of after a code round trip.
  if (purpose === "signup" && existing) return { ok: false, error: "already_registered" };
  if (purpose === "login" && !existing) return { ok: false, error: "no_account" };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(t.otpChallenges).values({
    id: `otp_${randomUUID()}`,
    phone,
    codeHash: await hashSecret(code),
    purpose,
    channel: "pending",
    expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000),
  });

  const delivery = await deliverOtp(phone, code);
  return { ok: true, delivery };
}

export async function verifyOtp(phoneRaw: string, code: string, purpose: "signup" | "login") {
  const phone = normalisePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "invalid_phone" };

  const db = await getDb();
  const row = await db.query.otpChallenges.findFirst({
    where: and(eq(t.otpChallenges.phone, phone), eq(t.otpChallenges.purpose, purpose)),
    orderBy: desc(t.otpChallenges.createdAt),
  });

  if (!row || row.consumed) return { ok: false as const, error: "no_code" };
  if (row.expiresAt < new Date()) return { ok: false as const, error: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false as const, error: "too_many_attempts" };

  // The attempt is recorded BEFORE the comparison. Incrementing afterwards
  // means a caller who aborts the connection mid-check gets a free guess, and
  // enough free guesses is the whole attack on a six-digit code.
  await db
    .update(t.otpChallenges)
    .set({ attempts: row.attempts + 1 })
    .where(eq(t.otpChallenges.id, row.id));

  if (!(await verifySecret(String(code ?? ""), row.codeHash))) {
    return { ok: false as const, error: "wrong_code" };
  }

  await db
    .update(t.otpChallenges)
    .set({ consumed: true })
    .where(eq(t.otpChallenges.id, row.id));

  return { ok: true as const, phone };
}

/* -------------------------------- accounts ------------------------------- */

export type SignupInput = {
  phone: string;
  code: string;
  password: string;
  shopName: string;
  owner: string;
  city: string;
  pincode?: string;
};

export async function signup(input: SignupInput) {
  const verified = await verifyOtp(input.phone, input.code, "signup");
  if (!verified.ok) return { ok: false as const, error: verified.error };

  const phone = verified.phone;
  if (!input.password || input.password.length < 6) {
    return { ok: false as const, error: "weak_password" };
  }
  if (!input.shopName?.trim() || !input.city?.trim()) {
    return { ok: false as const, error: "missing_details" };
  }

  const db = await getDb();
  const clash = await db.query.dealers.findFirst({ where: eq(t.dealers.phone, phone) });
  if (clash) return { ok: false as const, error: "already_registered" };

  // Coordinates are resolved once, here, so every later weather call is a
  // direct forecast lookup. A geocode failure is not fatal — the dealer still
  // gets an account, and the weather panel falls back to the city name.
  const place = await geocodeCity(input.city).catch(() => null);

  const id = `d_${randomUUID()}`;
  await db.insert(t.dealers).values({
    id,
    name: input.shopName.trim(),
    owner: input.owner?.trim() || input.shopName.trim(),
    city: place?.name ?? input.city.trim(),
    pincode: input.pincode?.trim() || null,
    phone,
    passwordHash: await hashSecret(input.password),
    lat: place?.lat ?? null,
    lon: place?.lon ?? null,
    tier: "Pro",
  });

  await db.insert(t.users).values({
    id: `u_${randomUUID()}`,
    dealerId: id,
    name: input.owner?.trim() || input.shopName.trim(),
    phone,
    role: "DEALER",
  });

  return { ok: true as const, dealerId: id };
}

/**
 * Demo mode: the account is identified by phone number, and the password is
 * not checked.
 *
 * BE CLEAR ABOUT WHAT THIS IS. With this on, anyone who knows a registered
 * mobile number can open that dealer's console and read every one of their
 * customers' photographs, phone numbers and quotations. It is not a weaker
 * password policy — it is no authentication at all on the password path.
 *
 * It exists because a walkthrough should not stall on a forgotten password, and
 * it is deliberately a single environment variable so turning it off is one
 * line and no code change. Set STRICT_LOGIN=1 before this is in front of
 * anyone's real customers.
 */
export const openLogin = () => process.env.STRICT_LOGIN?.trim() !== "1";

export async function loginWithPassword(phoneRaw: string, password: string) {
  const phone = normalisePhone(phoneRaw);
  if (!phone) return { ok: false as const, error: "invalid_phone" };

  const db = await getDb();
  const dealer = await db.query.dealers.findFirst({ where: eq(t.dealers.phone, phone) });

  // The number alone has to resolve to a real account either way — an unknown
  // number is still a failure, so this cannot be used to create a session for
  // a shop that does not exist.
  if (!dealer) return { ok: false as const, error: "bad_credentials" };

  if (openLogin()) return { ok: true as const, dealerId: dealer.id, passwordChecked: false };

  // One message for "no such number" and "wrong password". Distinguishing them
  // turns the login form into a tool for discovering which shops are registered.
  if (!(await verifySecret(password, dealer.passwordHash))) {
    return { ok: false as const, error: "bad_credentials" };
  }
  return { ok: true as const, dealerId: dealer.id, passwordChecked: true };
}

export async function loginWithOtp(phoneRaw: string, code: string) {
  const verified = await verifyOtp(phoneRaw, code, "login");
  if (!verified.ok) return { ok: false as const, error: verified.error };

  const db = await getDb();
  const dealer = await db.query.dealers.findFirst({ where: eq(t.dealers.phone, verified.phone) });
  if (!dealer) return { ok: false as const, error: "no_account" };
  return { ok: true as const, dealerId: dealer.id };
}

/* ------------------------------ request scope ---------------------------- */

/**
 * The tenant for this request, from the signed cookie and nothing else.
 *
 * Every dealer-side route calls this. There is no `?dealerId=` fallback on
 * purpose: an id taken from the query string is not a tenant boundary, it is a
 * suggestion, and one route honouring it would undo the isolation everywhere.
 */
export async function currentDealerId(req: Request): Promise<string | null> {
  return dealerFromCookieHeader(req.headers.get("cookie"));
}

export async function currentDealer(req: Request) {
  const id = await currentDealerId(req);
  if (!id) return null;
  const db = await getDb();
  const dealer = await db.query.dealers.findFirst({ where: eq(t.dealers.id, id) });
  return dealer ?? null;
}

/** 401 body used by every dealer route, so the client can react in one place. */
export const UNAUTHORISED = { error: "unauthorised", message: "Sign in to continue." };
