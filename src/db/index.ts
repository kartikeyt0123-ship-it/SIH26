import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

/**
 * Database handle.
 *
 * Development runs PGlite: real PostgreSQL compiled to WASM, persisted to
 * `.data/pgdata`. It speaks actual Postgres, so the schema, the constraints,
 * the JSONB columns and the generated migrations are all genuine — not a
 * key-value store wearing a database costume.
 *
 * To move to Supabase or any hosted Postgres, set DATABASE_URL and swap the two
 * driver lines below for `postgres-js` or `node-postgres`. The schema, the
 * migrations, the queries and every route handler stay exactly as they are.
 *
 * Initialisation is lazy and memoised on globalThis because Next's dev server
 * re-evaluates modules on every hot reload, and a second PGlite instance
 * pointed at the same data directory would fight the first for the lock.
 */

export type DB = PgliteDatabase<typeof schema>;

/**
 * PGlite is loaded through a runtime require rather than a static import.
 *
 * It ships a 9.6 MB `.wasm` and a 6 MB `.data` file that Emscripten locates
 * relative to its own module path. Both bundlers get this wrong: webpack tries
 * to inline the payload and hangs the dev compile, and Turbopack rewrites the
 * paths so Postgres' virtual filesystem fails to initialise with a bare
 * ErrnoError on the first query. Requiring it at runtime from node_modules
 * sidesteps the bundler entirely, and the package works exactly as it does in
 * plain Node.
 */
function loadPGlite() {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  return req("@electric-sql/pglite").PGlite as typeof PGliteType;
}

type Cache = { db?: DB; client?: PGliteType; ready?: Promise<DB> };
const globalCache = globalThis as unknown as { __rachnaDb?: Cache };
const cache: Cache = (globalCache.__rachnaDb ??= {});

async function init(): Promise<DB> {
  // PGlite parses its dataDir for a URL-style protocol prefix (`memory://`,
  // `idb://`, `file://`). A Windows absolute path starts `C:` — which it reads
  // as a protocol named "c" and then fails deep inside its virtual filesystem
  // with a bare ErrnoError. So the path handed to PGlite stays relative and
  // POSIX-separated, and only the mkdir uses the absolute form.
  const relDir = process.env.PGLITE_DATA_DIR ?? "./.data/pgdata";
  const absDir = path.resolve(process.cwd(), relDir);

  // PGlite's own mkdir is not recursive, so a missing parent fails the very
  // first query with an error that reads like a migration problem.
  mkdirSync(absDir, { recursive: true });

  const PGlite = loadPGlite();
  const client = new PGlite(relDir);
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedIfEmpty(db);

  cache.client = client;
  cache.db = db;
  return db;
}

export function getDb(): Promise<DB> {
  // On failure the memoised promise is cleared, otherwise one bad start (a
  // missing directory, a locked data dir) poisons every request until the
  // server is restarted — which in dev means the fix looks like it did nothing.
  cache.ready ??= init().catch((err) => {
    cache.ready = undefined;
    throw err;
  });
  return cache.ready;
}

export { schema };
