import { Suspense } from "react";
import { sb } from "@/db/supabase";
import { NewTaskForm } from "@/app/task/new/new-task-form";
import { RouteModal } from "@/components/route-modal";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

type SP = Promise<{ companyId?: string; returnTo?: string }>;

/**
 * Intercepting route: when /task/new is reached by in-app navigation, it renders
 * here as a modal over the current page (the @modal parallel slot). The modal
 * FRAME renders synchronously so the async company fetch never bubbles up to the
 * page-level loading skeleton (which used to flash behind the nav); the form
 * streams in via the inner Suspense boundary. A direct visit / refresh falls
 * through to the real /task/new page.
 */
export default function NewTaskModal({ searchParams }: { searchParams: SP }) {
  return (
    <RouteModal title="New task" subtitle="Create an action item tracked across the portfolio.">
      <Suspense fallback={<div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-fg-subtle" /></div>}>
        <ModalFormLoader searchParams={searchParams} />
      </Suspense>
    </RouteModal>
  );
}

async function ModalFormLoader({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { data: rows } = await sb.from("companies").select("id,name").order("name");
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const presetCompany = sp.companyId ? parseInt(sp.companyId, 10) : companies[0]?.id;
  return <NewTaskForm companies={companies} presetCompany={presetCompany} returnTo={sp.returnTo} variant="modal" />;
}
