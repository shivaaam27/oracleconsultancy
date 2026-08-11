// One source of truth for the canonical, absolute app URL used in emailed links
// and the printed staff-form QR.
//
// Resolution order:
//  1. NEXT_PUBLIC_APP_URL  — explicit override (set this to a custom domain if you
//     ever point one at the app, e.g. https://app.oracle.co.tz).
//  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's STABLE production host (e.g.
//     oracleconsultancy.vercel.app). Best default: it doesn't change between deployments,
//     unlike VERCEL_URL, and it's the public production deployment.
//  3. VERCEL_URL — the per-deployment hostname (changes every deploy; last resort).
//  4. A hardcoded fallback for local/dev only.
//
// NOTE: oracle.co.tz is the EMAIL domain, not the app — never use it as the app URL.
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/\/+$/, "")}`;

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/**
 * Base URL for assets EMBEDDED IN AN EMAIL (the masthead logo, etc).
 *
 * An email is always opened somewhere other than the machine that sent it, so a
 * localhost URL can never load — Gmail renders it as an empty bordered box,
 * which reads as a black square in dark mode. Anything sent from a dev machine
 * therefore borrows the public production host for its images.
 */
export function emailAssetBaseUrl(): string {
  const base = appBaseUrl();
  return base.startsWith("http://localhost") ? "https://oracleconsultancy.vercel.app" : base;
}
