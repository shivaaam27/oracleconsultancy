import { sb } from "@/db/supabase";

/** Active job-title names (managed list for the role field's suggestions). */
export async function listRoleNames(): Promise<string[]> {
  const { data } = await sb.from("job_titles").select("name").eq("active", true).order("name");
  return (data ?? []).map((r) => r.name as string);
}

export type RoleAdminRow = { id: number; name: string; peopleCount: number };

/** Job titles with how many active people currently use that exact role text. */
export async function getRolesAdmin(): Promise<RoleAdminRow[]> {
  const [{ data: rows }, { data: ppl }] = await Promise.all([
    sb.from("job_titles").select("id,name").order("name"),
    sb.from("people").select("role,active"),
  ]);
  const count = new Map<string, number>();
  for (const p of ppl ?? []) {
    if (!(p.active ?? true)) continue;
    const r = (p.role as string | null)?.trim();
    if (r) count.set(r.toLowerCase(), (count.get(r.toLowerCase()) ?? 0) + 1);
  }
  return (rows ?? []).map((r) => ({ id: r.id as number, name: r.name as string, peopleCount: count.get((r.name as string).toLowerCase()) ?? 0 }));
}
