import { redirect } from "next/navigation";

/**
 * Old address for the cleaning checklist.
 *
 * It was "OCR" (Office Cleaning Registry), which collided with OCR in the sense
 * the rest of the app uses it — reading text off a scan (`file-extract.ts`).
 * Same three letters, two meanings, in one system. It is `/hrms/cleaning` now;
 * this keeps every old link, bookmark and printed page working.
 */
export default async function OcrRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The page takes ?date=, so carry the query across or the redirect would
  // quietly drop the day someone was looking at.
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((one) => qs.append(k, one));
  }
  const query = qs.toString();
  redirect(query ? `/hrms/cleaning?${query}` : "/hrms/cleaning");
}
