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

/**
 * Vercel's filesystem is read-only and thrown away between invocations, so on a
 * deploy the disk path silently loses every customer photograph. When a blob
 * token is present we use object storage instead; locally, files stay on disk
 * so development needs no accounts.
 */
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function put(data: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  const name = `${randomUUID()}.${ext}`;

  if (useBlob()) {
    const { put: blobPut } = await import("@vercel/blob");
    const res = await blobPut(`rachna/${name}`, data, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
    });
    // The whole URL becomes the key. Callers treat it as opaque, and the
    // serving route recognises it by scheme.
    return res.url;
  }

  const dir = root();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), data);
  return name;
}

export async function get(key: string): Promise<Buffer | null> {
  if (/^https?:\/\//.test(key)) {
    try {
      const res = await fetch(key, { cache: "no-store" });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  // Reject anything that could climb out of the uploads directory.
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return null;
  try {
    return await readFile(path.join(root(), key));
  } catch {
    return null;
  }
}

export async function remove(key: string): Promise<void> {
  if (/^https?:\/\//.test(key)) {
    try {
      const { del } = await import("@vercel/blob");
      await del(key);
    } catch {
      /* already gone */
    }
    return;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return;
  try {
    await unlink(path.join(root(), key));
  } catch {
    /* already gone */
  }
}
