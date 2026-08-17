"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Folder, Pin, PinOff } from "lucide-react";
import { useToast } from "@/components/toast";
import { setNoteArchived, setNoteFolder, togglePinNote } from "@/app/notes/actions";
import { cn } from "@/lib/cn";

/**
 * The thin row above the sheet: back, folder, pin, archive, and when it was last
 * touched. ONE row of quiet controls — the first version stacked a title box and a
 * meta box above the paper, which made four bordered rectangles down the screen.
 *
 * The title is not here any more: it lives inside the sheet, where a title belongs.
 */
export function NoteRecordBar({
  noteId,
  pinned,
  archived,
  folderId,
  folders,
  updatedAt,
}: {
  noteId: number;
  pinned: boolean;
  archived: boolean;
  folderId: number | null;
  folders: { id: number; name: string }[];
  updatedAt: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();

  const act = "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-fg-muted">
      <Link href="/notes" className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}>
        <ArrowLeft size={14} /> All notes
      </Link>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      {/* Folder as a quiet native select — no bordered control for something you
          change once a month. It only shows its edge on hover/focus. */}
      <span className="relative inline-flex items-center">
        <Folder size={13} className="pointer-events-none absolute left-2 text-fg-subtle" />
        <select
          aria-label="Folder"
          value={folderId != null ? String(folderId) : ""}
          onChange={(e) => start(async () => {
            const v = e.target.value;
            const res = await setNoteFolder(noteId, v ? Number(v) : null);
            if (!res.ok) { toast("Could not move the note.", { tone: "danger" }); return; }
            router.refresh();
          })}
          className="bare-field h-7 cursor-pointer appearance-none rounded-md pl-7 pr-6 text-[11.5px] font-medium text-fg-muted outline-none transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <option value="">No folder</option>
          {folders.map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
        </select>
      </span>

      <button
        type="button"
        onClick={() => start(async () => {
          const res = await togglePinNote(noteId);
          if (res.ok) { toast(res.pinned ? "Pinned to the top." : "Unpinned.", { tone: "success" }); router.refresh(); }
        })}
        className={cn(act, pinned ? "text-accent hover:bg-accent-soft" : "hover:bg-bg-muted hover:text-fg")}
      >
        {pinned ? <PinOff size={13} /> : <Pin size={13} />} {pinned ? "Unpin" : "Pin"}
      </button>

      <button
        type="button"
        onClick={() => start(async () => {
          const res = await setNoteArchived(noteId, !archived);
          if (!res.ok) { toast("Could not archive.", { tone: "danger" }); return; }
          toast(archived ? "Back on the shelf." : "Archived — nothing is deleted.", { tone: "success" });
          router.refresh();
        })}
        className={cn(act, archived ? "text-success hover:bg-success-soft" : "hover:bg-bg-muted hover:text-fg")}
      >
        {archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {archived ? "Restore" : "Archive"}
      </button>

      <span className="grow" />
      <span className="px-1 text-[11px] text-fg-subtle">
        Updated {new Date(updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
