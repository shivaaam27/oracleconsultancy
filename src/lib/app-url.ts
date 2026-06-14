// One source of truth for the canonical, absolute app URL used in emailed links
// and the printed staff-form QR. Prefer the explicit canonical domain
// (NEXT_PUBLIC_APP_URL) over Vercel's per-deployment VERCEL_URL (an ephemeral
// preview hostname). Set NEXT_PUBLIC_APP_URL=https://oracle.co.tz in Vercel env.
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://oracle.co.tz")
  );
}
