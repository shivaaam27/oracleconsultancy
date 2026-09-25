import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The Director Brief is not a page any more (owner, 26 Sept 2026: it repeated
 * Home; what mattered was the PDF, its filters and the ways to send it). It is
 * the Report panel (components/studio/report-sheet.tsx), opened from Home, a
 * company or a person. An old /brief link — a bookmark, a shared link — lands
 * on Home with the panel open and its filters kept. /brief/pdf is unchanged.
 */
export default async function BriefRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ report: "1" });
  if (sp.period) q.set("period", sp.period);
  const co = sp.co ?? sp.company;
  if (co) q.set("co", co);
  if (sp.who) q.set("who", sp.who);
  redirect(`/?${q.toString()}`);
}
