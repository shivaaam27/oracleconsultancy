"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CalendarDays, LayoutTemplate, Pin, PinOff } from "lucide-react";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { applyTemplateToNote, setDailyTemplate, setNoteArchived, setNoteFolder, setNoteIsTemplate, togglePinNote } from "@/app/notes/actions";
import { stBtn } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

/**
 * The row above the sheet: folder, pin, templates, daily pages, archive — in the
 * Studio look (mockup board Note, 26 Sept 2026). "All notes" moved into the
 * writing toolbar and "Updated …" onto the paper, as in the mockup; nothing was
 * dropped. On a phone the same row sits in the "⋯" sheet (NoteExtras), where it
 * wraps. ONE row of quiet controls — the first version stacked a title box and a
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
  isTemplate,
  isDailyTemplate,
  templates,
}: {
  noteId: number;
  pinned: boolean;
  archived: boolean;
  folderId: number | null;
  folders: { id: number; name: string }[];
  isTemplate: boolean;
  /** Is this the template today's page starts from? */
  isDailyTemplate: boolean;
  templates: { id: number; title: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();

  /* The mockup's ghost button; "on" (pinned, a template, used every day) is the
     dark primary, so a state reads at a glance without a colour of its own. */
  const act = (on: boolean) => cn(on ? stBtn.dark : stBtn.ghost, "max-sm:h-8 max-sm:px-3 max-sm:text-xs");

  const folderOptions: FluidOption[] = [
    { value: "", label: "Unfiled" },
    ...folders.map((f) => ({ value: String(f.id), label: f.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The app's own anchored dropdown. This was a native <select>, which draws an
          OS popup that ignores every token in the design system — the same reason
          combobox.tsx replaced the native datalists. */}
      {/* "Folder · Unfiled ▾" — a chip, with the app's own dropdown inside it. */}
      <div className={cn(stBtn.chip, "gap-0 pr-1")}>
        <span>Folder</span>
        <FluidSelect
        value={folderId != null ? String(folderId) : ""}
        options={folderOptions}
        onSelect={(v) => start(async () => {
          const res = await setNoteFolder(noteId, v ? Number(v) : null);
          if (!res.ok) { toast("Could not move the note.", { tone: "danger" }); return; }
          router.refresh();
        })}
        buttonClassName="h-7 min-w-0 gap-2 rounded-md border-0 bg-transparent px-1.5 text-[13px] font-normal text-[var(--st-muted)] shadow-none hover:bg-transparent hover:text-[var(--st-ink)]"
        />
      </div>

      <button
        type="button"
        onClick={() => start(async () => {
          const res = await togglePinNote(noteId);
          if (res.ok) { toast(res.pinned ? "Pinned to the top." : "Unpinned.", { tone: "success" }); router.refresh(); }
        })}
        className={act(pinned)}
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
        className={cn(act(false), "sm:order-2")}
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
        className={act(isTemplate)}
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
          className={act(isDailyTemplate)}
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
          buttonClassName={cn(stBtn.ghost, "min-w-0 gap-2 font-normal text-[var(--st-ink)] shadow-none max-sm:h-8 max-sm:px-3 max-sm:text-xs")}
        />
      )}

      {/* Archive sits apart at the far end (mockup): ordered after a
          spacer, so it is never the button beside Pin. */}
      <span className="hidden grow sm:order-1 sm:block" aria-hidden />
    </div>
  );
}
