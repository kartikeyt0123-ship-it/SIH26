import type { Config } from "drizzle-kit";

/**
 * Migrations are generated as plain PostgreSQL DDL. They are applied to PGlite
 * in development and would apply unchanged to Supabase or any hosted Postgres —
 * which is the point of not inventing a bespoke persistence layer.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/rachna",
  },
} satisfies Config;
