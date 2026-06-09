import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The agent SDK spawns the `claude` binary and must not be bundled.
  serverExternalPackages: [
    "@anthropic-ai/claude-agent-sdk",
    "@anthropic-ai/claude-code",
  ],
  webpack: (config) => {
    // Apps live in /apps/<slug>/index.tsx (outside src/). The render route
    // imports them with a runtime-computed path; silence webpack's warning
    // about that dynamic require. This is dev-mode behavior by design.
    config.module.unknownContextCritical = false;
    return config;
  },
};

export default nextConfig;
