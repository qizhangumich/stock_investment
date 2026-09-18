import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the bundled SQLite snapshot ships with every serverless function
  // on Vercel (all pages read it at request time).
  outputFileTracingIncludes: {
    "/": ["db/evolution.db"],
    "/**": ["db/evolution.db"],
  },
};

export default nextConfig;
