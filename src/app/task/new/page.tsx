import { sb } from "@/db/supabase";
import Link from "next/link";
import { NewTaskForm } from "./new-task-form";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ companyId?: string; returnTo?: string }> }) {
  const sp = await searchParams;
  const { data: rows } = await sb.from("companies").select("id,name").order("name");
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const presetCompany = sp.companyId ? parseInt(sp.companyId, 10) : companies[0]?.id;

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

      <NewTaskForm companies={companies} presetCompany={presetCompany} returnTo={sp.returnTo} />
    </div>
  );
}
