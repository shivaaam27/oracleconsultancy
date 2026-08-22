import type { NextConfig } from "next";
import path from "node:path";

/* ------------------------------------------------------------------ *
 * Security headers.
 *
 * There were NONE before 20 Aug 2026 — no CSP, no HSTS, nothing stopping the
 * site being framed inside a fake login page. These are the cheap half of the
 * security pass in memory/desktop_app_and_security_plan.md.
 *
 * TWO SPEEDS, on purpose:
 *   • Everything except the CSP is ENFORCED straight away. None of it can break
 *     a working page.
 *   • The CSP starts in REPORT-ONLY. It is the one header that can white-screen
 *     the app if an origin was missed, so it reports first and blocks later.
 *     Violations are collected at /api/csp-report and land in `system_events`
 *     (kind "csp.violation"). When a week has passed with nothing but noise,
 *     set CSP_ENFORCE=1 in Vercel and redeploy — that is the only change needed.
 *     ⚠️ next.config is read at BUILD time, so flipping it needs a redeploy.
 * ------------------------------------------------------------------ */

const isProd = process.env.NODE_ENV === "production";

/** Origin of a URL, or "" if it is missing/unparseable — a bad env var must not
 *  break the build, it just narrows the policy. */
function originOf(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Realtime is a websocket to the same host.
const supabaseSocket = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:") : "";
// Sentry posts errors to its ingest host, which is embedded in the DSN.
const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** Everything the BROWSER is allowed to talk to. Found by reading the client
 *  code, not guessed:
 *   - Supabase        REST, storage signed URLs and the Realtime socket
 *   - Sentry          error reports (inert until the DSN is set)
 *   - api.open-meteo  the weather chip (src/components/weather-chip.tsx)
 *  Google Drive and wa.me appear in the source as LINKS and a placeholder, not
 *  as fetches, so they are deliberately absent. */
const connectSrc = [
  "'self'",
  supabaseOrigin,
  supabaseSocket,
  sentryOrigin,
  "https://api.open-meteo.com",
  // Dev only: Turbopack's hot-reload socket.
  ...(isProd ? [] : ["ws://localhost:*", "http://localhost:*"]),
].filter(Boolean);

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js inlines its hydration and next-themes' no-flash script, and Turbopack
  // needs eval in dev. A nonce would be stricter, but it has to be minted per
  // request in src/proxy.ts — and the proxy deliberately does not run on /login.
  // Left as a follow-up rather than done badly.
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  // Tailwind, framer-motion and GSAP all write inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Signed Supabase URLs, data: previews, and images inside the email-preview
  // iframe (which inherits this policy) can come from anywhere.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // PDF preview (signed Supabase URL) and the srcdoc email preview.
  `frame-src 'self' blob: data:${supabaseOrigin ? " " + supabaseOrigin : ""}`,
  `connect-src ${connectSrc.join(" ")}`,
  // ⚠️ `upgrade-insecure-requests` IS ONLY ADDED WHEN THE POLICY IS ENFORCED.
  // The browser ignores it in a report-only policy AND logs an error saying so
  // — on every page load, in every console, which is noise that hides the
  // violations this report-only policy exists to collect.
  ...(process.env.CSP_ENFORCE === "1" ? ["upgrade-insecure-requests"] : []),
  "report-uri /api/csp-report",
].join("; ");

const securityHeaders = [
  // Report-only until CSP_ENFORCE=1 proves the policy is clean.
  {
    key: process.env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: csp,
  },
  // Clickjacking. Enforced now regardless of the CSP's mode, so frame-ancestors
  // being report-only costs nothing.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app genuinely uses the microphone (voice), the camera (document photos)
  // and location (weather) — so those are allowed to itself and nobody else.
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()",
  },
  // allow-popups, not same-origin: document previews open in a new tab.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Two years of HTTPS-only. No `preload` — that is a public commitment that is
  // painful to undo, and it buys little on a Vercel domain.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
