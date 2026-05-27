import { NextRequest } from "next/server";

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on scheduled hits.
// Locally / manually, the same header works.
// If CRON_SECRET is not set, the route is open (dev convenience only — set it in prod).
export function authoriseCron(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: true };
  const header = req.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return { ok: true };
  return { ok: false, status: 401, message: "Unauthorised." };
}
