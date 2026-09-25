import { redirect } from "next/navigation";

/** The old portal directory. Staff have the shared People and Companies screens;
 *  directors and managers are sent to `/people` by the portal layout. This
 *  address stays only so old links still land somewhere. */
export default async function PortalDirectoryRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  redirect(tab === "companies" ? "/portal/companies" : "/portal/people");
}
