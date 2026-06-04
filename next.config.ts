import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Document uploads go through server actions; the default 1 MB body limit
    // is too small for the 20 MB documents bucket.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
