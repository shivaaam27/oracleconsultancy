"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { Hero, Panel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { DirectorTaskForm } from "@/components/director-task-form";

type Person = { id: number; name: string; companyId?: number | null; companyIds?: number[] };
type Company = { id: number; name: string };

export function NewTaskForm({
  me,
  people,
  companies,
  isDirector = false,
}: {
  me: { id: number; name: string };
  people: Person[];
  companies: Company[];
  isDirector?: boolean;
}) {
  // The pill "New task" page renders the SAME composer as the board and the
  // Tasks page — auto-opened. Directors assign group-wide (multi-company
  // fan-out + "Only I can close it"); managers assign to their team. Closing
  // the sheet returns to where they came from.
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const backHref = isDirector ? "/portal/board" : "/portal";

  const peopleForComposer = people.map((p) => ({
    id: p.id,
    name: p.name,
    companyId: p.companyId ?? null,
    companyIds: p.companyIds,
  }));

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) router.push(backHref);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg transition-colors">
        <ArrowLeft size={15} /> {isDirector ? "Board" : "My tasks"}
      </Link>

      <Reveal delay={0}>
        <Hero
          title="New task"
          subtitle={isDirector ? "Assign work to anyone, in any company." : "Delegate work to yourself or your team."}
        />
      </Reveal>

      <Reveal delay={0.05}>
        <Panel glass className="flex flex-col items-start gap-3 p-4 sm:p-5">
          <p className="text-sm text-fg-muted">Fill in the task and assign it. The form opens automatically — reopen it below if you closed it.</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-[opacity,transform] hover:opacity-90 active:scale-95"
          >
            <ClipboardCheck size={15} /> New task
          </button>
        </Panel>
      </Reveal>

      <DirectorTaskForm
        people={peopleForComposer}
        companies={companies}
        role={isDirector ? "director" : "manager"}
        open={open}
        onOpenChange={onOpenChange}
      />
    </div>
  );
}
