import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf bundles a serverless pdf.js build; keep it external so it isn't
  // re-bundled by Turbopack on the server.
  serverExternalPackages: ["unpdf"],
  experimental: {
    // Document uploads go through server actions; the default 1 MB body limit
    // is too small for the 20 MB documents bucket.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
