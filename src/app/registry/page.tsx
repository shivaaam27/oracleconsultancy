import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /registry has been folded into the hub Tasks tab (/?tab=tasks&view=table).
 * This page now redirects, preserving any filter query string the caller provided.
 */
export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; status?: string; flag?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("tab", "tasks");
  params.set("view", "table");
  if (sp.company) params.set("company", sp.company);
  if (sp.flag) params.set("flag", sp.flag);
  if (sp.status) params.set("status", sp.status);
  if (sp.q) params.set("q", sp.q);
  redirect(`/?${params.toString()}`);
}
