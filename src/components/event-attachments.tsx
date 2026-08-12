"use client";

// EventAttachments — the papers that travel with a diary entry.
//
// Drop a ticket here and three things happen, in this order and no other:
//   1. the file goes straight from the browser to storage (so a 40 MB scan is
//      fine — nothing large crosses a serverless request body);
//   2. it is filed in the Documents library under its own name, category
//      "Attachment", with no owner — the same convention chat and task
//      attachments already follow;
//   3. it is READ, and what it says is handed back to the form.
//
// Step 3 fills the form in. It does not save anything. The owner sees what was
// found — including a plain "Departs 02:15 EAT → arrives 08:40 Dubai time" line
// to check against the ticket in his hand — and presses Save himself.

import { useCallback, useRef, useState, useTransition } from "react";
import { Paperclip, X, Loader2, Sparkles, FileText, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { FieldLabel } from "@/components/ui";
import { DocLinkPicker } from "@/components/doc-link-picker";
import { createUploadSlotAction, discardUploadAction } from "@/app/documents/upload-actions";
import {
  fileEventAttachmentAction,
  readEventFileAction,
  linkEventDocumentAction,
  unlinkEventDocumentAction,
  discardEventAttachmentAction,
  setEventDocumentShareAction,
  searchDocumentsForEventAction,
} from "@/app/calendar/attachment-actions";
import type { EventReadResult } from "@/lib/event-read";

export type AttachedDoc = {
  id: number;
  title: string;
  fileName: string | null;
  /** Does it ride along on the invitation and appear on the public event page? */
  share: boolean;
};

/** What a read hands back to the form. Every field is a SUGGESTION. */
export type EventPrefill = {
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string;
  reminders: number[];
  whenSummary: string | null;
  gaps: string[];
  confidence: number | null;
  kind: string;
};

/**
 * What the document said, shown back for checking BEFORE anything is saved.
 *
 * This strip is the whole reason the time-zone handling is safe. The times are
 * quoted in the zones they were printed in — "02:15 EAT → 08:40 Dubai time" —
 * so a misread is caught by glancing at the ticket, not at the airport. What
 * could NOT be read is listed too: a stated gap is honest, a silent blank isn't.
 */
export function ReadSummary({ prefill, onDismiss }: { prefill: EventPrefill; onDismiss?: () => void }) {
  const unsure = prefill.confidence != null && prefill.confidence < 0.75;
  return (
    <div className="mt-2 rounded-xl bg-accent/5 px-3 py-2.5 ring-1 ring-accent/20">
      <div className="flex items-start gap-2">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium text-fg">
            Filled in from the {prefill.kind === "flight" ? "ticket" : "document"} — check it before saving.
          </p>
          {prefill.whenSummary && (
            <p className="text-[11px] text-fg-muted">
              <span className="text-fg-subtle">When: </span>
              {prefill.whenSummary}
            </p>
          )}
          {prefill.gaps.length > 0 && (
            <p className="text-[11px] text-fg-muted">
              <span className="text-fg-subtle">Couldn&rsquo;t read: </span>
              {prefill.gaps.join("; ")} — please fill that in.
            </p>
          )}
          {unsure && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              The scan was hard to read, so check every field.
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function EventAttachments({
  eventId,
  companyId,
  value,
  onChange,
  onPrefill,
  allowLibrary = false,
  className,
}: {
  /** Null for an event that hasn't been saved yet — files are filed now and
   *  linked by the server when the form submits its `documentIds`. */
  eventId: number | null;
  companyId?: number | null;
  value: AttachedDoc[];
  onChange: (next: AttachedDoc[]) => void;
  /** Called when a file has been read. The form decides what to apply. */
  onPrefill?: (prefill: EventPrefill, fileName: string) => void;
  /**
   * Offer "attach something already filed". OWNER SURFACES ONLY — searching the
   * library and linking an arbitrary document are admin-gated server-side, so
   * showing the picker on the portal would only ever produce an empty list.
   * The portal can still upload, which is the case that matters there.
   */
  allowLibrary?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [library, setLibrary] = useState<Array<{ id: number; title: string }> | null>(null);
  const [, startTransition] = useTransition();

  const toPrefill = useCallback((r: EventReadResult): EventPrefill | null => {
    if (!r.ok || !r.read) return null;
    const { read } = r;
    return {
      title: r.title,
      startAt: read.startAt,
      endAt: read.endAt,
      allDay: read.fields.allDay,
      location: read.fields.location,
      description: read.description,
      reminders: read.reminders,
      whenSummary: read.whenSummary,
      gaps: read.gaps,
      confidence: r.confidence,
      kind: read.fields.kind,
    };
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setNote(null);

      // Accumulate, then hand back the whole list each time. `value` is the prop
      // as it was when this callback was created, so calling
      // onChange([...value, one]) per file would make every file overwrite the
      // one before it — drop three tickets, keep one. Found in review.
      const added: AttachedDoc[] = [];

      for (const file of files) {
        setBusy(file.name);
        try {
          // 1. Browser → storage, direct. The server only ever sees the path.
          const slot = await createUploadSlotAction(file.name);
          if (!slot.ok) {
            setNote(slot.error);
            continue;
          }
          const put = await fetch(slot.signedUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (!put.ok) {
            await discardUploadAction(slot.path);
            setNote(`Couldn't upload ${file.name}.`);
            continue;
          }

          // 2. Read it WHILE IT IS STILL STAGED. Filing moves the object out of
          //    `uploads/`, and the reader accepts staged paths ONLY — so "read
          //    this" can only ever mean the file you just uploaded, never one
          //    already in the library. A failed read costs nothing: the file is
          //    filed regardless at step 3, and the form just stays blank.
          let prefill: EventPrefill | null = null;
          if (onPrefill) {
            setBusy(null);
            setReading(file.name);
            const read = await readEventFileAction({
              path: slot.path,
              fileName: file.name,
              mimeType: file.type,
            });
            prefill = toPrefill(read);
            if (!prefill && read.note) setNote(read.note);
            setReading(null);
          }

          // 3. File it, and link it if the event already exists.
          setBusy(file.name);
          const filed = await fileEventAttachmentAction({
            path: slot.path,
            fileName: file.name,
            companyId: companyId ?? null,
            eventId,
          });
          if (!filed.ok) {
            setNote(filed.error);
            continue;
          }
          added.push({
            id: filed.document.id,
            title: filed.document.title,
            fileName: filed.document.fileName,
            share: true,
          });
          onChange([...value, ...added]);
          setBusy(null);

          if (prefill && onPrefill) onPrefill(prefill, file.name);
        } catch (e) {
          setNote(e instanceof Error ? e.message : `Couldn't attach ${file.name}.`);
        } finally {
          setBusy(null);
          setReading(null);
        }
      }
    },
    [companyId, eventId, onChange, onPrefill, toPrefill, value]
  );

  function remove(doc: AttachedDoc) {
    onChange(value.filter((d) => d.id !== doc.id));
    startTransition(async () => {
      if (eventId) await unlinkEventDocumentAction(eventId, doc.id);
      // Tidy up a file that was added and then taken off again before it meant
      // anything. Strictly conditional server-side — it only ever bins an
      // unowned, unlinked "Attachment" this person uploaded, so a document you
      // filed deliberately is never touched.
      await discardEventAttachmentAction(doc.id);
    });
  }

  function toggleShare(doc: AttachedDoc) {
    const share = !doc.share;
    onChange(value.map((d) => (d.id === doc.id ? { ...d, share } : d)));
    if (eventId) startTransition(() => void setEventDocumentShareAction(eventId, doc.id, share));
  }

  async function openLibrary() {
    if (library) return;
    const docs = await searchDocumentsForEventAction(companyId ?? null);
    setLibrary(docs.map((d) => ({ id: d.id, title: d.fileName ? `${d.title} · ${d.fileName}` : d.title })));
  }

  function linkExisting(id: number) {
    if (value.some((d) => d.id === id)) return;
    const found = library?.find((d) => d.id === id);
    onChange([...value, { id, title: found?.title ?? `Document ${id}`, fileName: null, share: true }]);
    if (eventId) startTransition(() => void linkEventDocumentAction(eventId, id));
  }

  const working = busy ?? reading;

  return (
    <div className={className}>
      <FieldLabel>Attachments</FieldLabel>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        className={cn(
          "rounded-xl border border-dashed px-3 py-3 transition-colors",
          dragOver ? "border-accent bg-accent/5" : "border-border bg-bg-subtle/40"
        )}
      >
        {value.length > 0 && (
          <ul className="mb-2.5 space-y-1.5">
            {value.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 rounded-lg bg-bg-elev px-2.5 py-1.5 ring-1 ring-border">
                <FileText size={13} className="shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1 truncate text-xs text-fg" title={doc.fileName ?? doc.title}>
                  {doc.fileName || doc.title}
                </span>
                <button
                  type="button"
                  onClick={() => toggleShare(doc)}
                  title={doc.share ? "Sent to guests and openable from the calendar entry" : "Kept for reference — not sent, not on the public page"}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 transition-colors",
                    doc.share
                      ? "bg-accent/10 text-accent ring-accent/25"
                      : "bg-bg-subtle text-fg-subtle ring-border"
                  )}
                >
                  {doc.share ? <Check size={9} /> : null} {doc.share ? "Send to guests" : "Reference only"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(doc)}
                  title="Remove from this event (the document stays in your library)"
                  className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!working}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-bg-subtle px-2 py-1 text-[11px] font-medium text-fg-muted ring-1 ring-border transition-colors hover:bg-bg-muted disabled:opacity-50"
          >
            <Paperclip size={11} /> Attach a file
          </button>

          {allowLibrary && (
            <div onMouseEnter={() => void openLibrary()} onFocus={() => void openLibrary()}>
              <DocLinkPicker
                docs={library ?? []}
                onPick={linkExisting}
                label="Already filed…"
                placeholder="Search your documents…"
                disabled={!!working}
              />
            </div>
          )}

          {working && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <Loader2 size={11} className="animate-spin" />
              {reading ? (
                <>
                  <Sparkles size={11} className="text-accent" /> Reading {reading}…
                </>
              ) : (
                <>Uploading {busy}…</>
              )}
            </span>
          )}

          {!working && !value.length && (
            <span className="text-[11px] text-fg-subtle">
              Any file. A ticket or booking is read and fills the event in for you.
            </span>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {note && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-fg-muted">
          <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-500" />
          {note}
        </p>
      )}
    </div>
  );
}
