/**
 * The dealer session cookie: mint and verify.
 *
 * Built on Web Crypto rather than `node:crypto` for one specific reason —
 * middleware runs on the edge runtime, where `node:crypto` does not exist. If
 * the signature could only be checked inside a route handler, middleware would
 * be reduced to asking "is a cookie present?", and any string at all would get
 * a visitor past the gate and into a rendered console. Web Crypto runs in both
 * places, so the same real check guards both.
 *
 * The token is `<dealerId>.<expiryMs>.<hmac>` and carries no secrets — it names
 * a tenant and an expiry, and the signature is what makes it unforgeable.
 */

export const COOKIE = "rachna_dealer";
const MAX_AGE_DAYS = 30;

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_DAYS * 86_400,
  // Secure in production only: the dev server is plain http on localhost, and a
  // Secure cookie there is never sent back by the browser.
  secure: process.env.NODE_ENV === "production",
};

function secretBytes() {
  // A stable dev fallback keeps sign-in working out of the box. The deploy
  // checklist sets a real one; rotating it invalidates every existing cookie,
  // which is the correct behaviour rather than a bug.
  const s = process.env.AUTH_SECRET?.trim() || "rachna-dev-secret-not-for-production";
  return new TextEncoder().encode(s);
}

async function key() {
  return crypto.subtle.importKey(
    "raw",
    secretBytes(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function issueCookie(dealerId: string) {
  const body = `${dealerId}.${Date.now() + MAX_AGE_DAYS * 86_400_000}`;
  const sig = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Returns the dealer id, or null for anything forged, malformed or expired. */
export async function readCookie(value: string | undefined | null): Promise<string | null> {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx < 0) return null;

  const body = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = b64url(
    await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body)),
  );

  // Constant-time-ish: compare every character rather than short-circuiting on
  // the first difference, so timing does not leak how much of a forged
  // signature was correct.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  const [dealerId, expStr] = body.split(".");
  if (!dealerId || !expStr) return null;
  // A valid signature over an expired token is still a rejection.
  if (Number(expStr) < Date.now()) return null;
  return dealerId;
}

/** Pull the cookie out of a raw Cookie header. */
export async function dealerFromCookieHeader(header: string | null) {
  const match = (header ?? "").split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return null;
  return readCookie(decodeURIComponent(match.slice(COOKIE.length + 1)));
}
