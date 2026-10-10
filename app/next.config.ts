import path from "node:path";
import type { NextConfig } from "next";

// The app lives in a subfolder of the Anchor repo (which has its own lockfile):
// pin the workspace root to app/.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  outputFileTracingRoot: root,
  // Don't let `next dev` write an AGENTS.md into the repo.
  agentRules: false,
};

export default nextConfig;
