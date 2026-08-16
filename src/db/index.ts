import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

/**
 * Database handle — one of two drivers, chosen by environment.
 *
 * DATABASE_URL set  → postgres-js against hosted Postgres (Neon, Supabase, any).
 *                     This is what runs in production: Vercel's filesystem is
 *                     read-only and ephemeral, so an on-disk database would be
 *                     empty on every cold start.
 * DATABASE_URL unset → PGlite, real PostgreSQL as WASM, persisted to
 *                     .data/pgdata. Zero setup for local work.
 *
 * The schema, the migrations and every query are identical across both. Only
 * the two lines that construct the client differ, which is the whole reason the
 * app was written against Drizzle rather than a hand-rolled data layer.
 */

export type DB = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

async function loadPGlite(): Promise<typeof PGliteType> {
  // Dynamic import first: `serverExternalPackages` keeps the package out of the
  // bundle, so this resolves the real module from node_modules. The
  // createRequire fallback exists because some bundler configurations rewrite
  // `import()` into something that cannot reach an external CJS package — that
  // failure surfaces as "(void 0) is not a function", which is not a clue
  // anyone would enjoy chasing twice.
  try {
    const mod = await import("@electric-sql/pglite");
    if (mod?.PGlite) return mod.PGlite;
  } catch {
    /* fall through */
  }
  const req = createRequire(path.join(process.cwd(), "package.json"));
  return req("@electric-sql/pglite").PGlite as typeof PGliteType;
}

type Cache = { db?: DB; ready?: Promise<DB> };
const globalCache = globalThis as unknown as { __rachnaDb?: Cache };
const cache: Cache = (globalCache.__rachnaDb ??= {});

async function initHosted(url: string): Promise<DB> {
  const postgres = (await import("postgres")).default;
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");

  // Serverless functions are short-lived and numerous; a large pool per
  // instance exhausts the database's connection limit long before it helps.
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzlePostgres(client, { schema });

  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedIfEmpty(db);
  return db;
}

async function initLocal(): Promise<DB> {
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // PGlite parses its dataDir for a URL-style protocol prefix. A Windows
  // absolute path starts `C:` — read as a protocol named "c" — and then fails
  // deep inside its virtual filesystem. So the path stays relative and
  // POSIX-separated; only the mkdir uses the absolute form.
  const relDir = process.env.PGLITE_DATA_DIR ?? "./.data/pgdata";
  mkdirSync(path.resolve(process.cwd(), relDir), { recursive: true });

  const PGlite = await loadPGlite();
  const client = new PGlite(relDir);
  const db = drizzlePglite(client, { schema });

  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await seedIfEmpty(db);
  return db;
}

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL?.trim();
  return url ? initHosted(url) : initLocal();
}

export function getDb(): Promise<DB> {
  // On failure the memoised promise is cleared, otherwise one bad start (a
  // missing directory, a locked data dir, a database still waking up) poisons
  // every request until the server is restarted.
  cache.ready ??= init().catch((err) => {
    cache.ready = undefined;
    throw err;
  });
  return cache.ready;
}

export { schema };
