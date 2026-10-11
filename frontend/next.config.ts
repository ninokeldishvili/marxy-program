import path from "node:path";
import type { NextConfig } from "next";

// The frontend is one workspace of the repo; @marxy/shared lives in
// packages/shared, so the root is the repo root.
const root = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  outputFileTracingRoot: root,
  // @marxy/shared ships TypeScript source.
  transpilePackages: ["@marxy/shared"],
  // Don't let `next dev` write an AGENTS.md into the repo.
  agentRules: false,
};

export default nextConfig;
