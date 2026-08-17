import { redirect } from "next/navigation";

/**
 * Old address for the supplies register.
 *
 * It was "OECR" (Office Equipment Control Registry), but it never tracked
 * equipment — real equipment lives in Assets. It tracks the things you use up
 * and re-buy, which is what its own tables have always called it
 * (`stock_items` / `stock_purchases` / `stock_issues`). It is `/hrms/supplies`
 * now; this keeps old links working.
 */
export default async function OecrRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((one) => qs.append(k, one));
  }
  const query = qs.toString();
  redirect(query ? `/hrms/supplies?${query}` : "/hrms/supplies");
}
