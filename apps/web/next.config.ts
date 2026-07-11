import path from "node:path";
import dotenv from "dotenv";
import type { NextConfig } from "next";

// Next.js only auto-loads .env files from this app's own directory, not the
// monorepo root — unlike apps/api (see apps/api/src/config/env.ts), so this
// loads it explicitly, before Next inlines NEXT_PUBLIC_* vars into the
// build. Local dev convenience only; production platforms inject real env
// vars directly, so this simply finds nothing and no-ops.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone build (only the node_modules
  // subset the app actually needs, traced automatically) — the standard
  // minimal-image pattern for deploying a Next.js app via Docker, used by
  // apps/web/Dockerfile. No effect on `next dev` or Vercel deploys (Vercel
  // ignores this option and uses its own build output).
  output: "standalone",
};

export default nextConfig;
