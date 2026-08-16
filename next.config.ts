import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in the home directory makes Next infer the wrong root.
  outputFileTracingRoot: __dirname,
  transpilePackages: ["three"],
  // PGlite ships a WASM build of Postgres; bundling it breaks the loader, so it
  // stays external and is required at runtime from node_modules.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at runtime, so the folder has to travel with
  // the serverless bundle. Without this the first request on Vercel fails with
  // "no migrations found" against a perfectly healthy database.
  outputFileTracingIncludes: {
    "/api/**": ["./drizzle/**"],
  },
};

export default nextConfig;
