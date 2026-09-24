import { sb } from "@/db/supabase";
import Link from "next/link";
import { NewTaskForm } from "./new-task-form";
import { ArrowLeft } from "lucide-react";
import { getAppSettings } from "@/lib/settings";
import { isStudioOn } from "@/lib/studio";
import { safeReturn } from "@/lib/return-to";
import { StudioNewTaskPage } from "@/components/studio/tasks/new-task";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { viewerPeopleIds } from "@/lib/viewer-scope";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ companyId?: string; returnTo?: string; title?: string; deadline?: string; assignees?: string; priority?: string; instructions?: string }> }) {
  const sp = await searchParams;
  // The owner, or a director allowed to create tasks (lib/viewer.ts): they pick
  // from their own companies and the people in them.
  const viewer = await getViewer();
  if (!viewer || (viewer.kind === "director" && !viewer.person.caps.createTasks)) redirect("/portal");
  const { studioPages } = await getAppSettings();
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
  const presetCompany = sp.companyId ? parseInt(sp.companyId, 10) : companies[0]?.id;

  /* Studio (New look → Tasks): the new task is the record page itself, as an
     unsaved draft (mockup board NewTask). The old form below is untouched. */
  if (isStudioOn(studioPages, "tasks")) {
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

  return (
    <div className="space-y-5 max-w-2xl mx-auto pb-24 lg:pb-6">
      {/* Back */}
      <Link href={sp.returnTo || "/?tab=tasks"} className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors">
        <ArrowLeft size={14} /> Task Management
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">New task</h1>
        <p className="text-xs text-fg-muted mt-0.5">Create an action item tracked across the portfolio.</p>
      </div>

      <NewTaskForm
        companies={companies}
        people={people}
      departments={departments}
        presetCompany={presetCompany}
        returnTo={sp.returnTo}
        defaultTitle={sp.title}
        defaultDeadline={sp.deadline}
        defaultAccountable={sp.assignees ? sp.assignees.split(",").map((s) => s.trim()).filter(Boolean) : undefined}
      />
    </div>
  );
}
