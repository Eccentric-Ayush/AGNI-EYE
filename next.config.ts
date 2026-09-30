import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone",
  /* config options here */
  reactStrictMode: false,
  // API routes read these files with fs at runtime (src/lib/pipeline/*). The file tracer cannot see
  // fs reads built from process.cwd(), so include them explicitly; keep the raw tile cache out.
  outputFileTracingIncludes: {
    "/*": [
      "data/snapshot/**/*",
      "data/industrial-india.json.gz",
      "data/india-boundary.json",
      "data/validation/results.json",
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["data/raw/**/*"],
  },
};

export default nextConfig;
