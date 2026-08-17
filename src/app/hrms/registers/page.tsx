import { redirect } from "next/navigation";

/**
 * Old address for the commitments register.
 *
 * "Register" meant three different things in the navigation: this page, the
 * sidebar group called "Registers", and the legacy `/registry` (which is the
 * task list). The page is `/hrms/commitments` now — it says what it holds — and
 * the sidebar group is "Operations". This keeps old links working.
 */
export default async function RegistersRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Carry the query: this list is filtered through the URL and its saved views
  // are shareable links, so dropping the query would open the wrong view.
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((one) => qs.append(k, one));
  }
  const query = qs.toString();
  redirect(query ? `/hrms/commitments?${query}` : "/hrms/commitments");
}
