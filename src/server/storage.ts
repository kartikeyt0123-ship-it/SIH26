import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Object storage adapter.
 *
 * §11 says image binaries must not sit in Postgres, and they do not: the
 * database stores only a `storageKey`, which is opaque to every caller. Today
 * that key addresses a file under `.data/uploads`. Pointing it at Supabase
 * Storage means replacing the three functions below — `put`, `get`, `remove` —
 * and nothing else in the application changes.
 *
 * The uploads directory sits outside `public/` deliberately. Anything in
 * `public/` is served to the whole internet by path alone; a customer's
 * photographs of the inside of their house are served through a route handler
 * that checks the session first.
 */

const root = () => process.env.UPLOAD_DIR ?? path.join(process.cwd(), ".data", "uploads");

export async function put(data: Buffer, mimeType: string): Promise<string> {
  const dir = root();
  await mkdir(dir, { recursive: true });
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  const key = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, key), data);
  return key;
}

export async function get(key: string): Promise<Buffer | null> {
  // Reject anything that could climb out of the uploads directory.
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return null;
  try {
    return await readFile(path.join(root(), key));
  } catch {
    return null;
  }
}

export async function remove(key: string): Promise<void> {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return;
  try {
    await unlink(path.join(root(), key));
  } catch {
    /* already gone */
  }
}
