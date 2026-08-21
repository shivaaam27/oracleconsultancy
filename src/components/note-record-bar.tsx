"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, LayoutTemplate, Pin, PinOff } from "lucide-react";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { applyTemplateToNote, setDailyTemplate, setNoteArchived, setNoteFolder, setNoteIsTemplate, togglePinNote } from "@/app/notes/actions";
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
  isTemplate,
  isDailyTemplate,
  templates,
}: {
  noteId: number;
  pinned: boolean;
  archived: boolean;
  folderId: number | null;
  folders: { id: number; name: string }[];
  updatedAt: string;
  isTemplate: boolean;
  /** Is this the template today's page starts from? */
  isDailyTemplate: boolean;
  templates: { id: number; title: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();

  const act = "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium transition-colors";

  const folderOptions: FluidOption[] = [
    { value: "", label: "No folder" },
    ...folders.map((f) => ({ value: String(f.id), label: f.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-fg-muted">
      <Link href="/notes" className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}>
        <ArrowLeft size={14} /> All notes
      </Link>

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      {/* The app's own anchored dropdown. This was a native <select>, which draws an
          OS popup that ignores every token in the design system — the same reason
          combobox.tsx replaced the native datalists. */}
      <FluidSelect
        value={folderId != null ? String(folderId) : ""}
        options={folderOptions}
        onSelect={(v) => start(async () => {
          const res = await setNoteFolder(noteId, v ? Number(v) : null);
          if (!res.ok) { toast("Could not move the note.", { tone: "danger" }); return; }
          router.refresh();
        })}
        buttonClassName="h-7 min-w-[8.5rem] justify-between rounded-md border-0 bg-transparent px-2 text-[11.5px] font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
      />

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

      {/* Templates are just notes with kind='template' — no new table, no new
          screen. Marking one puts it in the "Use a template" list on every other
          note. Phase 6. */}
      <button
        type="button"
        onClick={() => start(async () => {
          const res = await setNoteIsTemplate(noteId, !isTemplate);
          if (!res.ok) { toast("Could not change that.", { tone: "danger" }); return; }
          toast(isTemplate ? "Back to an ordinary note." : "Saved as a template.", { tone: "success" });
          router.refresh();
        })}
        className={cn(act, isTemplate ? "text-accent hover:bg-accent-soft" : "hover:bg-bg-muted hover:text-fg")}
      >
        <LayoutTemplate size={13} /> {isTemplate ? "Template" : "Make a template"}
      </button>

      {/* Joining the two things that already existed: templates, and one page per
          day. It stores this note's ID, not a copy of it — so editing the
          template changes tomorrow, and yesterday's page keeps what it had. */}
      {isTemplate && (
        <button
          type="button"
          onClick={() => start(async () => {
            await setDailyTemplate(isDailyTemplate ? null : noteId);
            toast(
              isDailyTemplate
                ? "Today's page goes back to a blank sheet."
                : "Tomorrow's page will start from this.",
              { tone: "success" },
            );
            router.refresh();
          })}
          title={isDailyTemplate ? "Stop using this for daily pages" : "Start every day from this template"}
          className={cn(act, isDailyTemplate ? "text-accent hover:bg-accent-soft" : "hover:bg-bg-muted hover:text-fg")}
        >
          <CalendarDays size={13} /> {isDailyTemplate ? "Used every day" : "Use for daily pages"}
        </button>
      )}

      {templates.length > 0 && !isTemplate && (
        <FluidSelect
          value=""
          options={[
            { value: "", label: "Use a template" },
            ...templates.map((t) => ({ value: String(t.id), label: t.title })),
          ]}
          onSelect={(v) => {
            if (!v) return;
            start(async () => {
              const res = await applyTemplateToNote(noteId, Number(v));
              if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
              // The editor holds the body, so a full reload is the honest way to
              // put the template in front of the owner — see the Versions panel
              // for the same reasoning about refs the render does not reset.
              toast("Template applied. The old text is in Versions.", { tone: "success" });
              window.location.reload();
            });
          }}
          buttonClassName="h-7 min-w-[8.5rem] justify-between rounded-md border-0 bg-transparent px-2 text-[11.5px] font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
        />
      )}

      <span className="grow" />
      <span className="px-1 text-[11px] text-fg-subtle">
        Updated {new Date(updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
