"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Pin, PinOff } from "lucide-react";
import { CaretInput } from "@/components/ui";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { renameNote, setNoteArchived, setNoteFolder, togglePinNote } from "@/app/notes/actions";
import { cn } from "@/lib/cn";

/**
 * The note's header: its title, its folder, pin and archive. Phase 1.
 *
 * The title is a plain field that saves when you leave it — deliberately NOT
 * autosaved on every keystroke like the body, because a half-typed title flickering
 * through the list and the browser tab is worse than a one-second wait.
 *
 * Every control here is the Desk 28px secondary tier; the folder picker is the
 * shared `FluidSelect`, which is the one control that already positions itself
 * correctly (it measures through `layoutRect`).
 */
export function NoteRecordBar({
  noteId,
  title,
  pinned,
  archived,
  folderId,
  folders,
  updatedAt,
}: {
  noteId: number;
  title: string;
  pinned: boolean;
  archived: boolean;
  folderId: number | null;
  folders: { id: number; name: string }[];
  updatedAt: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [draft, setDraft] = useState(title);

  const commitTitle = () => {
    const next = draft.trim();
    if (next === title.trim()) return;
    start(async () => {
      const res = await renameNote(noteId, next);
      if (!res.ok) { toast("Could not save the title.", { tone: "danger" }); return; }
      router.refresh();
    });
  };

  const folderOptions: FluidOption[] = [
    { value: "", label: "No folder" },
    ...folders.map((f) => ({ value: String(f.id), label: f.name })),
  ];

  const btn = "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 text-[11px] font-medium transition-colors";

  return (
    <div className="flex flex-col gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        placeholder="Untitled note"
        aria-label="Note title"
        className="w-full max-w-[72ch] bg-transparent text-[19px] font-semibold tracking-tight text-fg outline-none placeholder:text-fg-subtle"
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-[170px]">
          <FluidSelect
            value={folderId != null ? String(folderId) : ""}
            options={folderOptions}
            onSelect={(v) => start(async () => {
              const res = await setNoteFolder(noteId, v ? Number(v) : null);
              if (!res.ok) { toast("Could not move the note.", { tone: "danger" }); return; }
              router.refresh();
            })}
            buttonClassName="h-7 w-full justify-between rounded-md border border-border bg-bg-elev px-2 text-[11px]"
          />
        </span>

        <button
          type="button"
          onClick={() => start(async () => {
            const res = await togglePinNote(noteId);
            if (res.ok) { toast(res.pinned ? "Pinned to the top." : "Unpinned.", { tone: "success" }); router.refresh(); }
          })}
          className={cn(btn, pinned ? "text-accent" : "text-fg-muted hover:text-fg")}
        >
          {pinned ? <PinOff size={12} /> : <Pin size={12} />} {pinned ? "Unpin" : "Pin"}
        </button>

        <button
          type="button"
          onClick={() => start(async () => {
            const res = await setNoteArchived(noteId, !archived);
            if (!res.ok) { toast("Could not archive.", { tone: "danger" }); return; }
            toast(archived ? "Back on the shelf." : "Archived — nothing is deleted.", { tone: "success" });
            router.refresh();
          })}
          className={cn(btn, archived ? "text-success" : "text-fg-muted hover:text-fg")}
        >
          {archived ? <ArchiveRestore size={12} /> : <Archive size={12} />} {archived ? "Restore" : "Archive"}
        </button>

        <span className="grow" />
        <span className="text-[11px] text-fg-subtle">
          Updated {new Date(updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {archived && (
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-[12px] text-fg-muted">
          This note is archived — it is off the shelf but nothing has been deleted. Restore it any time.
        </p>
      )}
    </div>
  );
}
