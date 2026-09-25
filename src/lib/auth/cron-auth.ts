import { NextRequest } from "next/server";

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on scheduled hits.
// Locally / manually, the same header works.
// No CRON_SECRET: open in local dev for convenience, but REJECTED in production —
// a forgotten env var must not leave the cron routes publicly triggerable.
export function authoriseCron(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, message: "CRON_SECRET is not configured." };
    }
    return { ok: true };
  }
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return { ok: true };
  return { ok: false, status: 401, message: "Unauthorised." };
}
