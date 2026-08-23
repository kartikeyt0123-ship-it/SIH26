/**
 * Password and one-time-code hashing.
 *
 * Separated from `server/auth.ts` purely to break an import cycle: the seed
 * needs to hash the demo dealer's password, the seed is imported by `db/index`,
 * and `auth` imports `db`. Keeping the crypto in a module that imports nothing
 * of ours lets both sides use it.
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * scrypt with a per-record salt, stored as `scrypt$<salt>$<hash>`.
 *
 * Not SHA-256: a fast hash over a short password chosen by a shopkeeper is a
 * rainbow-table lookup, not protection. scrypt is deliberately slow and
 * memory-hard, which is the only property that matters here.
 */
export async function hashSecret(secret: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(secret, salt, 32);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifySecret(secret: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const key = await scrypt(secret, salt, 32);
  const expected = Buffer.from(hex, "hex");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, and a thrown error here would read as a server fault.
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}
