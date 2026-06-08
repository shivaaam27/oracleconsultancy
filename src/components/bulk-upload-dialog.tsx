"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { UploadCloud, X, Check, Plus, Sparkles, Loader2, UserPlus } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { DocumentForm } from "./document-form";
import { extractPersonFields, enrichPersonProfile, createPerson, type PersonProfileFields } from "@/app/people/actions";

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
}: {
  noteText: string;
  people: Array<{ id: number; name: string }>;
  onPersonCreated: (p: { id: number; name: string }) => void;
}) {
  const [fields, setFields] = useState<PersonProfileFields | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [personId, setPersonId] = useState<number | "">("");
  const [enriching, setEnriching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
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
      if (res.ok) setFields(null);
    } finally { setEnriching(false); }
  }

  async function addPerson() {
    const name = newName.trim();
    if (!name) return;
    setSavingPerson(true);
    try {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("personType", "local_staff");
      const res = await createPerson(fd);
      if (res.ok && res.id) {
        onPersonCreated({ id: res.id, name });
        setPersonId(res.id);
        setCreating(false); setNewName("");
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
                <button type="button" onClick={addPerson} disabled={savingPerson || !newName.trim()}
                  className="inline-flex items-center gap-1 rounded-md bg-accent text-accent-fg px-2 py-1 text-[11px] disabled:opacity-50">
                  {savingPerson ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Add
                </button>
                <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="text-fg-muted hover:text-fg p-1"><X size={12} /></button>
              </span>
            ) : (
              <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><UserPlus size={11} /> New</button>
            )}
            <button type="button" onClick={apply} disabled={enriching || personId === ""}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent text-accent-fg px-2.5 py-1 text-[11px] font-medium disabled:opacity-50">
              {enriching ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Update profile
            </button>
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
  const [savedAny, setSavedAny] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // People can grow if someone is created from the message-profile panel; the
  // file forms should see them immediately too.
  const [localPeople, setLocalPeople] = useState(people);

  // Fresh start every time the dialog opens (fixes stale data on reopen).
  useEffect(() => {
    if (open) { setFiles(initialFiles ?? []); setIndex(0); setDone(new Set()); setSavedAny(false); setLocalPeople(people); }
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

  function afterHandled(savedOk: boolean) {
    const nextDone = new Set(done);
    nextDone.add(index);
    setDone(nextDone);
    if (savedOk) { onDone?.(); setSavedAny(true); }
    // Move to the next unhandled file, or finish.
    const remaining = files.map((_, j) => j).filter((j) => !nextDone.has(j));
    if (remaining.length === 0) {
      toast(`${nextDone.size} file${nextDone.size === 1 ? "" : "s"} reviewed.`, { tone: "success" });
      if (savedOk || savedAny) onAllDone?.();
      onOpenChange(false);
      return;
    }
    setIndex(remaining[0]);
  }

  const allHandled = files.length > 0 && done.size >= files.length;
  const current = files[index];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(640px,calc(100vw-2rem))] max-h-[90dvh] -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-2xl bg-bg-elev border border-border shadow-2xl outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div>
              <Dialog.Title className="text-sm font-semibold">Add several documents</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-fg-muted">
                {files.length === 0
                  ? "Pick several files — each is auto-read, then reviewed in the normal form."
                  : `Reviewing ${Math.min(done.size + 1, files.length)} of ${files.length}`}
              </Dialog.Description>
            </div>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>

          {/* Queue strip */}
          {files.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/70 px-4 py-2 shrink-0">
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
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); if (e.target) e.target.value = ""; }}
          />

          <div className="flex-1 overflow-y-auto p-4">
            {noteText && noteText.trim() && (
              <>
                <MessageProfilePanel
                  noteText={noteText}
                  people={localPeople}
                  onPersonCreated={(p) => setLocalPeople((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))}
                />
                <details className="mb-3 rounded-xl bg-bg-subtle/50 ring-1 ring-border/60 px-3 py-2">
                  <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Message from sender</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-fg-muted">{noteText}</p>
                </details>
              </>
            )}
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="w-full rounded-xl border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-10 text-center hover:border-accent hover:bg-bg-muted/40 transition-colors"
              >
                <UploadCloud size={24} className="mx-auto text-fg-subtle" />
                <div className="mt-2 text-sm font-medium">Choose files to upload</div>
                <div className="text-xs text-fg-muted">PDFs, photos/scans, Word, Excel — many at once</div>
              </button>
            ) : allHandled || !current ? (
              <div className="py-10 text-center text-sm text-fg-muted">All files reviewed.</div>
            ) : (
              <DocumentForm
                key={`${index}-${current.name}`}
                mode="create"
                companies={companies}
                people={localPeople}
                initialFile={current}
                submitLabel={advanceFrom(index) === null ? "Save & finish" : "Save & next"}
                cancelLabel="Skip"
                onCancel={() => afterHandled(false)}
                onComplete={(res) => { if (res.ok) afterHandled(true); }}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
