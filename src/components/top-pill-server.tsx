import { sb } from "@/db/supabase";
import { TopPill } from "./top-pill";

/** Server wrapper: loads companies (with accent) for the bottom-nav companies popup. */
export async function TopPillServer() {
  const { data } = await sb.from("companies").select("id,name,accent_color").order("name");
  const companies = (data ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accent: (c.accent_color as string | null) ?? null,
  }));
  return <TopPill companies={companies} />;
}
