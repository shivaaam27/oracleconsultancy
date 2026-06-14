import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf bundles a serverless pdf.js build; @napi-rs/canvas is a native addon
  // used to rasterise scanned PDFs for the vision model; @react-pdf/renderer
  // renders the board-pack PDF server-side. Keep them external so they aren't
  // re-bundled by Turbopack on the server.
  serverExternalPackages: ["unpdf", "@napi-rs/canvas", "@react-pdf/renderer"],
  experimental: {
    // Document uploads go through server actions; the default 1 MB body limit
    // is too small for the 20 MB documents bucket.
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
