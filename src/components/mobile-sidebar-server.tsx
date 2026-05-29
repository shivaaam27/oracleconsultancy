import { sb } from "@/db/supabase";
import { MobileSidebar } from "./mobile-sidebar";

/** Server wrapper: loads companies for the mobile nav drawer. */
export async function MobileSidebarServer() {
  const { data } = await sb.from("companies").select("id,name,code").order("code");
  const companies = (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  return <MobileSidebar companies={companies} />;
}
