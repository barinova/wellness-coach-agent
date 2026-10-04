import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@openai/agents", "@cursor/sdk", "openai"],
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Route handlers can run 15–90s. Next's default proxy timeout is 30s and
    // the browser then shows TypeError: Failed to fetch.
    proxyTimeout: 300_000,
  },
};

export default nextConfig;
