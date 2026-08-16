/**
 * Runtime configuration.
 *
 * The QR code is the whole reason this file exists. A QR containing
 * `http://localhost:3000` or `http://192.168.1.x:3000` is unscannable from a
 * customer's phone on mobile data, which is exactly the situation the feature
 * is for. So the public origin is configuration, never inferred from the
 * server's own address.
 */

/** §5 — configurable, not hardcoded. Two to three days. */
export const SESSION_DURATION_HOURS = Number(
  process.env.CUSTOMER_SESSION_DURATION_HOURS ?? 72,
);

export const MAX_PROJECT_IMAGES = 3;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * The origin customers' phones will use.
 *
 * `requestOrigin` is a last-resort fallback for local work only — if it is ever
 * what gets used, the QR is only good on this machine, and the UI says so
 * rather than letting a dealer print a dead code.
 */
export function publicAppUrl(requestOrigin?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return (requestOrigin ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isPubliclyReachable(url: string) {
  return (
    /^https:\/\//.test(url) &&
    !/localhost|127\.0\.0\.1|\b10\.|\b192\.168\.|\b172\.(1[6-9]|2\d|3[01])\./.test(url)
  );
}

export const customerUrl = (origin: string, token: string) => `${origin}/c/${token}`;
