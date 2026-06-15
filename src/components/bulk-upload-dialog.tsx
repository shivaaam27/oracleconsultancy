"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, X, Check, Plus, Sparkles, Loader2, UserPlus, SkipForward, AlertTriangle } from "lucide-react";
import { useToast } from "./toast";
import { Button } from "./ui";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { cn } from "@/lib/cn";
import { DocumentForm } from "./document-form";
import { extractPersonFields, enrichPersonProfile, createPerson, type PersonProfileFields } from "@/app/people/actions";
import { PERSON_TYPES, PERSON_TYPE_LABELS, type PersonType } from "@/lib/person-types";

const PROFILE_LABELS: Record<keyof PersonProfileFields, string> = {
  name: "Name", email: "Email", phone: "Phone", whatsapp: "WhatsApp", role: "Role",
  dateOfBirth: "Date of birth", nationality: "Nationality", nationalId: "National ID",
  passportNo: "Passport no.", address: "Address", emergencyContactName: "Emergency contact",
  emergencyContactPhone: "Emergency phone", startDate: "Start date", probationEndDate: "Probation end",
  department: "Department", supervisorName: "Manager", companyName: "Company",
};

/**
 * Reads the sender's message for a person's profile details and offers to fill
 * a chosen person's BLANK fields (fill-blanks-only, always reviewed). Part of the
 * unified intake: one bundle updates the person AND files the documents.
 */
function MessageProfilePanel({
  noteText,
  people,
  onPersonCreated,
  onEnriched,
  onChanged,
}: {
  noteText: string;
  people: Array<{ id: number; name: string }>;
  onPersonCreated: (p: { id: number; name: string }) => void;
  /** Fired after a successful profile enrich (so a text-only bundle can be filed). */
  onEnriched?: () => void;
  /** Fired after any standalone change so the open list can refresh. */
  onChanged?: () => void;
}) {
  const [fields, setFields] = useState<PersonProfileFields | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [personId, setPersonId] = useState<number | "">("");
  const [enriching, setEnriching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PersonType>("local_staff");
  const [savingPerson, setSavingPerson] = useState(false);

  async function scan() {
    if (!noteText.trim()) return;
    setScanning(true); setNote(null);
    try {
      const res = await extractPersonFields(noteText);
      const found = Object.fromEntries(Object.entries(res.fields).filter(([, v]) => v)) as PersonProfileFields;
      setFields(Object.keys(found).length ? found : null);
      setScanned(true);
      // If the message names someone we know, pre-select them.
      if (found.name) {
        const match = people.find((p) => p.name.toLowerCase() === found.name!.trim().toLowerCase());
        if (match) setPersonId(match.id);
      }
    } finally { setScanning(false); }
  }

  async function apply() {
    if (!fields || personId === "") return;
    setEnriching(true);
    try {
      const res = await enrichPersonProfile(Number(personId), fields);
      setNote(res.ok
        ? (res.filled.length ? `Updated ${res.filled.length} field${res.filled.length === 1 ? "" : "s"}: ${res.filled.join(", ")}.` : "Profile already had those details.")
        : (res.error ?? "Couldn't update the profile."));
      if (res.ok) {
        setFields(null);
        // Mark the bundle as worked (so a text-only item can be filed) and
        // refresh the open list to show the updated profile.
        onEnriched?.();
        onChanged?.();
      }
    } finally { setEnriching(false); }
  }

  async function addPerson() {
    const name = newName.trim();
    if (!name) return;
    setSavingPerson(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("personType", newType);
      const res = await createPerson(fd);
      if (res.ok && res.id) {
        onPersonCreated({ id: res.id, name });
        setPersonId(res.id);
        setCreating(false); setNewName(""); setNewType("local_staff");
      }
    } finally { setSavingPerson(false); }
  }

  const summary = fields
    ? (Object.keys(fields) as Array<keyof PersonProfileFields>).filter((k) => fields[k]).map((k) => PROFILE_LABELS[k]).join(", ")
    : "";

  return (
    <div className="mb-3 rounded-xl bg-accent-soft/30 ring-1 ring-accent/25 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-accent">
        <Sparkles size={12} /> Profile details in this message
      </div>
      {!scanned && (
        <button type="button" onClick={scan} disabled={scanning}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50">
          {scanning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {scanning ? "Reading…" : "Read message for profile details"}
        </button>
      )}
      {scanned && !fields && <p className="text-xs text-fg-muted">No personal details found in the message text.</p>}
      {fields && (
        <>
          <p className="text-xs text-fg-muted">Found: {summary}.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select value={personId === "" ? "" : String(personId)} onChange={(e) => setPersonId(e.target.value === "" ? "" : Number(e.target.value))}
              className="rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40">
              <option value="">— Who is this about?</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {creating ? (
              <span className="inline-flex items-center gap-1.5">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New person's name" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }}
                  className="rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:border-accent" />
                <select value={newType} onChange={(e) => setNewType(e.target.value as PersonType)}
                  title="What kind of person is this?"
                  className="rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs focus:outline-none focus:border-accent">
                  {PERSON_TYPES.map((t) => <option key={t} value={t}>{PERSON_TYPE_LABELS[t]}</option>)}
                </select>
                <Button type="button" size="xs" onClick={addPerson} disabled={savingPerson || !newName.trim()}>
                  {savingPerson ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Add
                </Button>
                <button type="button" onClick={() => { setCreating(false); setNewName(""); setNewType("local_staff"); }} className="text-fg-muted hover:text-fg p-1"><X size={12} /></button>
              </span>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><UserPlus size={11} /> New</button>
            )}
            <Button type="button" size="xs" onClick={apply} disabled={enriching || personId === ""}>
              {enriching ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Update profile
            </Button>
          </div>
          <p className="text-[11px] text-fg-subtle">Only empty fields are filled — nothing on record is changed.</p>
        </>
      )}
      {note && <p className="text-xs text-success">{note}</p>}
    </div>
  );
}

/**
 * Bulk add: a queue that reviews each dropped file in the FULL DocumentForm
 * (pre-filled by extraction), so every field is captured and company/person/
 * both + new-person creation all work — same form as single add.
 */
export function BulkUploadDialog({
  open,
  onOpenChange,
  companies,
  people,
  onDone,
  initialFiles,
  noteText,
  onAllDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: Array<{ id: number; name: string }>;
  people: Array<{ id: number; name: string }>;
  onDone?: () => void;
  /** Pre-loaded files (e.g. an Inbox bundle's attachments). Hides the drop zone. */
  initialFiles?: File[];
  /** Reference text shown above the queue (e.g. the Inbox message). */
  noteText?: string;
  /** Fired when the whole queue is finished (used to mark the bundle filed). */
  onAllDone?: () => void;
}) {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  // What happened to each handled file, keyed by its queue index. Drives the
  // end-of-queue summary so skipped/failed files don't silently disappear.
  const [outcomes, setOutcomes] = useState<Record<number, "saved" | "skipped" | "failed">>({});
  // Once every file is handled, show the summary INSIDE the dialog instead of
  // closing it — so the owner can jump back to anything skipped or failed.
  const [showSummary, setShowSummary] = useState(false);
  const [savedAny, setSavedAny] = useState(false);
  // Whether any profile enrich succeeded — lets a text-only (no-file) bundle be
  // marked filed, which otherwise could only happen after saving a file.
  const [enrichedAny, setEnrichedAny] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // People can grow if someone is created from the message-profile panel; the
  // file forms should see them immediately too.
  const [localPeople, setLocalPeople] = useState(people);

  // Fresh start every time the dialog opens (fixes stale data on reopen).
  useEffect(() => {
    if (open) { setFiles(initialFiles ?? []); setIndex(0); setDone(new Set()); setOutcomes({}); setShowSummary(false); setSavedAny(false); setEnrichedAny(false); setLocalPeople(people); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  function advanceFrom(i: number): number | null {
    for (let j = i + 1; j < files.length; j++) if (!done.has(j)) return j;
    for (let j = 0; j < files.length; j++) if (!done.has(j) && j !== i) return j;
    return null;
  }

  function afterHandled(outcome: "saved" | "skipped" | "failed") {
    const savedOk = outcome === "saved";
    const nextDone = new Set(done);
    nextDone.add(index);
    setDone(nextDone);
    setOutcomes((prev) => ({ ...prev, [index]: outcome }));
    if (savedOk) { onDone?.(); setSavedAny(true); }
    // Move to the next unhandled file, or show the end-of-queue summary.
    const remaining = files.map((_, j) => j).filter((j) => !nextDone.has(j));
    if (remaining.length === 0) {
      if (savedOk || savedAny) onAllDone?.();
      setShowSummary(true);
      return;
    }
    setIndex(remaining[0]);
  }

  // Re-open a handled file (from the summary) so the owner can fix it. Clearing
  // its done/outcome puts it back into the active queue at that index.
  function reopen(j: number) {
    setDone((prev) => { const next = new Set(prev); next.delete(j); return next; });
    setOutcomes((prev) => { const next = { ...prev }; delete next[j]; return next; });
    setShowSummary(false);
    setIndex(j);
  }

  const allHandled = files.length > 0 && done.size >= files.length;
  const current = files[index];

  return (
    <HrmsDialog
      open={open}
      onOpenChange={onOpenChange}
      width={640}
      title="Add several documents"
      sub={
        files.length === 0
          ? "Pick several files — each is auto-read, then reviewed in the normal form."
          : `Reviewing ${Math.min(done.size + 1, files.length)} of ${files.length}`
      }
    >
      {/* Queue strip */}
      {files.length > 0 && (
        <div className="-mx-5 -mt-5 mb-4 flex items-center gap-1.5 overflow-x-auto border-b border-border/70 px-4 py-2">
          {files.map((f, j) => (
            <button
              key={j}
              type="button"
              onClick={() => !done.has(j) && setIndex(j)}
              title={f.name}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] whitespace-nowrap ring-1 transition-colors",
                done.has(j) ? "bg-success-soft/60 ring-success/30 text-success"
                  : j === index ? "bg-accent-soft ring-accent/40 text-accent"
                  : "bg-bg-subtle ring-border text-fg-muted hover:bg-bg-muted"
              )}
            >
              {done.has(j) && <Check size={11} />} {f.name.length > 18 ? f.name.slice(0, 16) + "…" : f.name}
            </button>
          ))}
          <button type="button" onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-fg-muted ring-1 ring-dashed ring-border hover:text-fg whitespace-nowrap">
            <Plus size={11} /> More
          </button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,application/pdf"
        className="hidden"
        onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
      />

      <div>
        {noteText && noteText.trim() && (
              <>
                <MessageProfilePanel
                  noteText={noteText}
                  people={localPeople}
                  onPersonCreated={(p) => setLocalPeople((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))}
                  onEnriched={() => setEnrichedAny(true)}
                  onChanged={() => onDone?.()}
                />
                <details className="mb-3 rounded-xl bg-bg-subtle/50 ring-1 ring-border/60 px-3 py-2">
                  <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Message from sender</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-fg-muted">{noteText}</p>
                </details>
              </>
            )}
            {files.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-10 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors"
                >
                  <UploadCloud size={24} className="mx-auto text-fg-subtle" />
                  <div className="mt-2 text-sm font-medium">Choose files to upload</div>
                  <div className="text-xs text-fg-muted">PDFs, photos/scans, Word, Excel — many at once</div>
                </button>
                {/* Text-only bundle: no files to save, but once a profile was
                    updated (or even if nothing was) let the operator close it off
                    so it doesn't linger as pending. */}
                {noteText && noteText.trim() && (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted"
                    >
                      Close
                    </button>
                    <Button
                      type="button"
                      onClick={() => {
                        toast(enrichedAny ? "Profile updated — bundle filed." : "Bundle marked filed.", { tone: "success" });
                        onAllDone?.();
                        onOpenChange(false);
                      }}
                    >
                      <Check size={13} /> {enrichedAny ? "Done — mark filed" : "Mark filed"}
                    </Button>
                  </div>
                )}
              </>
            ) : showSummary || allHandled || !current ? (
              <BulkSummary
                files={files}
                outcomes={outcomes}
                onReopen={reopen}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <DocumentForm
                key={`${index}-${current.name}`}
                mode="create"
                companies={companies}
                people={localPeople}
                initialFile={current}
                submitLabel={advanceFrom(index) === null ? "Save & finish" : "Save & next"}
                cancelLabel="Skip"
                onCancel={() => afterHandled("skipped")}
                onComplete={(res) => afterHandled(res.ok ? "saved" : "failed")}
              />
            )}
      </div>
    </HrmsDialog>
  );
}

/**
 * End-of-queue summary shown inside the dialog: how many saved, plus any files
 * that were skipped or failed — each clickable to re-open and fix on the spot.
 */
function BulkSummary({
  files, outcomes, onReopen, onClose,
}: {
  files: File[];
  outcomes: Record<number, "saved" | "skipped" | "failed">;
  onReopen: (j: number) => void;
  onClose: () => void;
}) {
  const saved = files.map((_, j) => j).filter((j) => outcomes[j] === "saved");
  const leftovers = files.map((_, j) => j).filter((j) => outcomes[j] === "skipped" || outcomes[j] === "failed");
  return (
    <div className="py-6 space-y-4">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check size={18} />
        </div>
        <p className="text-sm font-medium">All files reviewed.</p>
        <p className="text-xs text-fg-muted">{saved.length} saved · {leftovers.length} still need a look.</p>
      </div>

      {leftovers.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-warn">
            <AlertTriangle size={12} /> Skipped or couldn’t save
          </div>
          <ul className="rounded-xl ring-1 ring-warn/30 divide-y divide-border/50">
            {leftovers.map((j) => (
              <li key={j}>
                <button
                  type="button"
                  onClick={() => onReopen(j)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-bg-muted/50"
                >
                  {outcomes[j] === "failed"
                    ? <X size={13} className="shrink-0 text-danger" />
                    : <SkipForward size={13} className="shrink-0 text-fg-subtle" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{files[j].name}</span>
                    <span className="block text-[11px] text-fg-muted">{outcomes[j] === "failed" ? "Couldn’t save — tap to try again" : "Skipped — tap to review"}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-fg-subtle">Open</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end">
        <Button type="button" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
