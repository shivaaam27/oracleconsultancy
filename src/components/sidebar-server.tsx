import { sb } from "@/db/supabase";
import { Sidebar } from "./sidebar";

/** Server wrapper: loads the company list once for the persistent sidebar. */
export async function SidebarServer() {
  const { data } = await sb.from("companies").select("id,name,code").order("code");
  const companies = (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  return <Sidebar companies={companies} />;
}
