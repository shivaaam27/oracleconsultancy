"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ClipboardList, FileWarning, Loader2, PackageCheck, X } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type {
  PersonPackPurpose,
  PersonPackSectionKey,
  PersonPackSectionSelection,
} from "@/lib/person-pack-shared";
import { serialisePersonPackSections } from "@/lib/person-pack-shared";

type PackResponse = {
  purpose: PersonPackPurpose;
  detail: {
    person: {
      id: number;
      name: string;
      role: string | null;
      companyName: string | null;
      personType: "internal" | "external" | "expat";
    };
  };
  compliance: {
    score: number;
    status: "Good" | "Watch" | "Risk";
    gaps: Array<{ id: string; label: string }>;
    documentIssues: Array<{ id: number; title: string; status: "Expired" | "Expiring"; expiryLabel: string | null }>;
  };
  openTasks: Array<{ id: number; code: string; actionItem: string; deadline: string | null; priority: string; latestUpdate: string | null }>;
  personalTodos: Array<{ id: number; title: string; dueAt: string | null; important: boolean; taskCode: string | null }>;
  drafts: Array<{ id: number; status: string; source: string | null; createdAt: string }>;
  recommendedSelection: PersonPackSectionSelection;
  counts: {
    missingDocuments: number;
    documentIssues: number;
    openTasks: number;
    personalTodos: number;
    drafts: number;
  };
};

const purposeOptions: Array<{ id: PersonPackPurpose; label: string; hint: string }> = [
  { id: "document-request", label: "Document Request", hint: "Only what they need to send." },
  { id: "visa-permit", label: "Visa / Permit", hint: "Immigration, permit and linked work." },
  { id: "recruitment", label: "Recruitment", hint: "Candidate or new-starter request." },
  { id: "task-reminder", label: "Task Reminder", hint: "Work assigned to this person." },
  { id: "custom", label: "Custom", hint: "Start blank and choose sections." },
];

const sectionLabels: Array<{ key: PersonPackSectionKey; label: string; sensitive?: boolean }> = [
  { key: "missingDocuments", label: "Missing documents" },
  { key: "documentIssues", label: "Expired/expiring documents" },
  { key: "openTasks", label: "Open tasks" },
  { key: "personalTodos", label: "Personal to-dos" },
  { key: "deadlines", label: "Deadlines" },
  { key: "latestUpdates", label: "Latest task updates", sensitive: true },
  { key: "contactDetails", label: "Contact details" },
  { key: "companyContext", label: "Company context" },
  { key: "fileLinks", label: "File links" },
  { key: "complianceScore", label: "Compliance score", sensitive: true },
  { key: "internalNotes", label: "Internal notes", sensitive: true },
];

function fmtDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Preview({ pack, selection }: { pack: PackResponse; selection: PersonPackSectionSelection }) {
  const included = useMemo(() => sectionLabels.filter((s) => selection[s.key]), [selection]);

  if (included.length === 0) {
    return (
      <div className="rounded-xl bg-bg-subtle/60 ring-1 ring-border p-4 text-sm text-fg-muted">
        Choose at least one section to prepare a pack.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-bg-elev ring-1 ring-border p-3">
        <div className="text-xs uppercase tracking-[0.08em] text-fg-muted">Preview</div>
        <h3 className="mt-1 text-base font-semibold">{pack.detail.person.name}</h3>
        <p className="text-xs text-fg-muted">
          {[pack.detail.person.role, pack.detail.person.companyName, pack.detail.person.personType].filter(Boolean).join(" - ")}
        </p>
      </div>

      {selection.missingDocuments && (
        <div className="rounded-xl bg-bg-elev ring-1 ring-border p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <FileWarning size={13} /> Missing documents
          </div>
          {pack.compliance.gaps.length ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {pack.compliance.gaps.map((gap) => <li key={gap.id}>- {gap.label}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No missing required documents found.</p>
          )}
        </div>
      )}

      {selection.documentIssues && (
        <div className="rounded-xl bg-bg-elev ring-1 ring-border p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <FileWarning size={13} /> Expired / expiring
          </div>
          {pack.compliance.documentIssues.length ? (
            <div className="mt-2 space-y-1.5">
              {pack.compliance.documentIssues.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                  <Badge tone={doc.status === "Expired" ? "danger" : "warn"}>{doc.expiryLabel ?? doc.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No expired or expiring documents found.</p>
          )}
        </div>
      )}

      {selection.openTasks && (
        <div className="rounded-xl bg-bg-elev ring-1 ring-border p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <ClipboardList size={13} /> Open tasks
          </div>
          {pack.openTasks.length ? (
            <div className="mt-2 space-y-2">
              {pack.openTasks.slice(0, 8).map((task) => (
                <div key={task.id} className="text-sm">
                  <div className="font-medium">{task.actionItem}</div>
                  <div className="text-xs text-fg-muted">
                    {selection.deadlines && task.deadline ? `${fmtDate(task.deadline)} - ` : ""}
                    {task.priority} - {task.code}
                  </div>
                  {selection.latestUpdates && task.latestUpdate && (
                    <p className="mt-1 text-xs text-fg-muted line-clamp-2">{task.latestUpdate}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No open tasks assigned.</p>
          )}
        </div>
      )}

      {selection.personalTodos && (
        <div className="rounded-xl bg-bg-elev ring-1 ring-border p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <Check size={13} /> Personal to-dos
          </div>
          {pack.personalTodos.length ? (
            <div className="mt-2 space-y-1.5 text-sm">
              {pack.personalTodos.slice(0, 8).map((todo) => (
                <div key={todo.id}>
                  - {todo.title}
                  {selection.deadlines && todo.dueAt ? <span className="text-fg-muted"> ({fmtDate(todo.dueAt)})</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">No open personal to-dos assigned.</p>
          )}
        </div>
      )}

      {selection.complianceScore && (
        <div className="rounded-xl bg-bg-elev ring-1 ring-border p-3 text-sm">
          Compliance score: <span className="font-semibold">{pack.compliance.score}%</span> ({pack.compliance.status})
        </div>
      )}
    </div>
  );
}

export function PersonPackBuilder({ personId, personName }: { personId: number; personName: string }) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<PersonPackPurpose>("document-request");
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [selection, setSelection] = useState<PersonPackSectionSelection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/person-pack?id=${personId}&purpose=${purpose}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not prepare this pack");
        return res.json();
      })
      .then((data: PackResponse) => {
        if (cancelled) return;
        setPack(data);
        setSelection(data.recommendedSelection);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, personId, purpose]);

  function toggle(key: PersonPackSectionKey) {
    setSelection((current) => current ? { ...current, [key]: !current[key] } : current);
  }

  function openPdf() {
    if (!selection) return;
    const params = new URLSearchParams({
      purpose,
      sections: serialisePersonPackSections(selection),
    });
    window.open(`/people/${personId}/pack?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 transition-opacity"
        >
          <PackageCheck size={12} /> Prepare pack
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-[71] h-[92svh] max-h-[92svh] w-full overflow-hidden rounded-t-2xl glass glass-refract outline-none
            sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[88svh] sm:w-[calc(100%-1.5rem)] sm:max-w-4xl sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold">Prepare pack for {personName}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fg-muted">
                Choose exactly what will be included before PDF or Outbox drafting.
              </Dialog.Description>
            </div>
            <Dialog.Close className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg">
              <X size={15} />
            </Dialog.Close>
          </div>

          <div className="grid h-[calc(92svh-61px)] min-h-0 overflow-y-auto md:h-auto md:max-h-[calc(88svh-61px)] md:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-4 border-b border-border p-4 md:border-b-0 md:border-r">
              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Purpose</div>
                <div className="space-y-1.5">
                  {purposeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setPurpose(option.id)}
                      className={cn(
                        "min-h-12 w-full rounded-xl px-3 py-2.5 text-left ring-1 transition-colors",
                        purpose === option.id
                          ? "bg-accent-soft text-fg ring-accent/30"
                          : "bg-bg-elev text-fg-muted ring-border hover:bg-bg-muted"
                      )}
                    >
                      <span className="block text-xs font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] text-fg-subtle">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Sections</div>
                {selection ? (
                  <div className="space-y-1.5">
                    {sectionLabels.map((section) => (
                      <label key={section.key} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-bg-muted">
                        <input
                          type="checkbox"
                          checked={selection[section.key]}
                          onChange={() => toggle(section.key)}
                          className="h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
                        />
                        <span className="min-w-0 flex-1">{section.label}</span>
                        {section.sensitive && <Badge tone="warn">careful</Badge>}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-fg-muted">Load a person pack to choose sections.</div>
                )}
              </div>
            </div>

            <div className="min-w-0 space-y-3 p-4">
              {loading && (
                <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-fg-muted">
                  <Loader2 size={16} className="animate-spin" /> Preparing pack...
                </div>
              )}
              {error && <div className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</div>}
              {!loading && pack && selection && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={pack.counts.missingDocuments ? "danger" : "success"}>{pack.counts.missingDocuments} missing</Badge>
                    <Badge tone={pack.counts.documentIssues ? "warn" : "success"}>{pack.counts.documentIssues} document issues</Badge>
                    <Badge tone={pack.counts.openTasks ? "info" : "default"}>{pack.counts.openTasks} open tasks</Badge>
                    <Badge tone={pack.counts.personalTodos ? "info" : "default"}>{pack.counts.personalTodos} to-dos</Badge>
                    <Badge tone={pack.counts.drafts ? "accent" : "default"}>{pack.counts.drafts} drafts</Badge>
                  </div>
                  <Preview pack={pack} selection={selection} />
                  <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 border-t border-border bg-bg/80 px-4 py-3 backdrop-blur-md">
                    <Button type="button" variant="secondary" size="sm" onClick={openPdf}>PDF</Button>
                    <Button type="button" size="sm" disabled>Create Outbox Draft next</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
