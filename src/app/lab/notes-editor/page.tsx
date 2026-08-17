import { NoteEditorMount } from "@/components/lab/note-editor-mount";

/**
 * PHASE 0 SPIKE — `/lab/notes-editor`, throwaway (memory/notes_module_plan.md §10).
 *
 * It sits under /lab, which is NOT in the proxy matcher's exclusion list, so it is
 * behind the owner gate like every other admin page — the same place the real Notes
 * module has to live (plan §8: notes are owner-only).
 *
 * This page stays a SERVER component (the real one will load the note from the
 * database here). The editor's no-SSR lazy import therefore lives in the little
 * client wrapper — Next 16 refuses `ssr: false` in a Server Component. See the note
 * in `note-editor-mount.tsx`.
 */
export const metadata = { title: "Editor spike — COS" };

export default function NotesEditorSpikePage() {
  return (
    <div className="flex flex-col gap-4">
      <div data-page-header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Editor spike</h1>
        <p className="text-[13px] text-fg-muted">
          Phase 0 of the Notes plan. Throwaway: it answers whether Tiptap hydrates cleanly, takes Desk
          styling and yields the two columns the schema wants — before anything is built for real.
        </p>
      </div>

      {/* A note's measure, not a list's width: ~72 characters is the readable line
          length every writing app lands on. Capped here so the spike shows the real
          shape of the future record page. */}
      <div className="max-w-[72ch]">
        <NoteEditorMount />
      </div>
    </div>
  );
}
