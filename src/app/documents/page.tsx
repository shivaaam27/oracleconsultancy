import { redirect } from "next/navigation";

/**
 * "Documents" is now Files Management (24 Sept 2026 — the owner: no Documents
 * name any more). Every old link still lands in the right place: a company or
 * person link opens its folder, a single document opens its preview.
 */
export default async function DocumentsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (sp.company && /^\d+$/.test(sp.company)) q.set("co", sp.company);
  if (sp.person && /^\d+$/.test(sp.person)) q.set("pe", sp.person);
  const one = sp.doc ?? sp.open;
  if (one && /^\d+$/.test(one)) q.set("open", one);
  redirect(`/files${q.toString() ? `?${q}` : ""}`);
}
