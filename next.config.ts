import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in the home directory makes Next infer the wrong root.
  outputFileTracingRoot: __dirname,
  // three/drei ship untranspiled ESM helpers; let Next handle them.
  transpilePackages: ["three"],
};

export default nextConfig;
