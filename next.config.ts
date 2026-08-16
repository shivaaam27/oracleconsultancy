import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // ⚠️ Pin the workspace root to THIS folder.
  //
  // Development happens in git worktrees under `.claude/worktrees/`, and each one
  // has its own package-lock.json. With several of them present Turbopack cannot
  // tell which is the root, warns about "multiple lockfiles", and picks the PARENT
  // checkout — at which point it resolves modules across sibling worktrees and
  // emits chunks named after whichever one it wandered into. The browser then
  // asks for a chunk that doesn't exist and the app dies with a ChunkLoadError
  // that has nothing to do with your code. Pinning the root stops it dead.
  turbopack: { root: path.resolve(__dirname) },
  // unpdf bundles a serverless pdf.js build; @napi-rs/canvas is a native addon
  // used to rasterise scanned PDFs for the vision model; @react-pdf/renderer
  // renders the Director Brief PDF server-side. Keep them external so they aren't
  // re-bundled by Turbopack on the server.
  serverExternalPackages: ["unpdf", "@napi-rs/canvas", "@react-pdf/renderer"],
  experimental: {
    // Document uploads go through server actions; the default 1 MB body limit
    // is too small for the 20 MB documents bucket.
    serverActions: { bodySizeLimit: "25mb" },
  },
  // OAuth discovery for the MCP server (stage 3). These documents MUST live at
  // the root of the domain under /.well-known/, and a route folder whose name
  // starts with a dot isn't something to depend on the App Router serving — so
  // they are rewritten onto normal routes. RFC 9728 also allows the resource's
  // own path to be appended to the metadata URL, hence the :path* variants.
  //
  // ⚠️ Each source points at its OWN route. Do not collapse these onto one
  // endpoint with a ?doc= discriminator: a rewrite does not carry the
  // destination's query string into the handler, so both paths silently served
  // the same document. That bug shipped once and was caught by curl, not by tsc.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/mcp/oauth/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/mcp/oauth/authorization-server" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/mcp/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/mcp/oauth/protected-resource" },
    ];
  },
};

export default nextConfig;
