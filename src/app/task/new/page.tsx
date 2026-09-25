import { sb } from "@/db/supabase";
import { safeReturn } from "@/lib/nav/return-to";
import { StudioNewTaskPage } from "@/components/studio/tasks/new-task";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { viewerPeopleIds } from "@/lib/auth/viewer-scope";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ companyId?: string; returnTo?: string; title?: string; deadline?: string; assignees?: string; priority?: string; instructions?: string }> }) {
  const sp = await searchParams;
  // The owner, or a director allowed to create tasks (lib/auth/viewer.ts): they pick
  // from their own companies and the people in them.
  const viewer = await getViewer();
  if (!viewer || (viewer.kind === "director" && !viewer.person.caps.createTasks)) redirect("/portal");
  const [{ data: rowsRaw }, { data: pplRaw }, { data: depts }, inScope] = await Promise.all([
    sb.from("companies").select("id,name,code_prefix").order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    sb.from("departments").select("name").order("name"),
    viewerPeopleIds(viewer),
  ]);
  const rows = (rowsRaw ?? []).filter((c) => viewer.scope == null || viewer.scope.includes(c.id as number));
  const ppl = (pplRaw ?? []).filter((p) => !inScope || inScope.has(p.id as number));
  const departments = (depts ?? []).map((d) => d.name as string);
  const companies = rows.map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = ppl.map((p) => ({ id: p.id as number, name: p.name as string }));

  /* Studio (New look → Tasks): the new task is the record page itself, as an
     unsaved draft (mockup board NewTask). The old form below is untouched. */
  const cid = sp.companyId ? parseInt(sp.companyId, 10) : NaN;
  return (
    <StudioNewTaskPage
      options={{ companies: (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, prefix: (c.code_prefix as string | null) ?? null })), people, departments: [...new Set(departments)] }}
      back={safeReturn(sp.returnTo) ?? "/?tab=tasks"}
      initial={{
        title: sp.title ?? "",
        companyId: Number.isFinite(cid) && companies.some((c) => c.id === cid) ? cid : null,
        people: sp.assignees ? sp.assignees.split(",").map((s) => s.trim()).filter(Boolean) : [],
        deadline: sp.deadline && /^\d{4}-\d{2}-\d{2}$/.test(sp.deadline) ? sp.deadline : null,
        priority: sp.priority && ["Critical", "High", "Medium", "Low"].includes(sp.priority) ? sp.priority : "Medium",
        instructions: sp.instructions ?? "",
      }}
    />
  );
}
