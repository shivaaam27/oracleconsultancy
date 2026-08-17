import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";

/**
 * A note that isn't there.
 *
 * The generic "Page not found" is wrong here: the usual reason a note URL fails is
 * that the note was deleted or the link is old, and the useful next step is the
 * shelf — not a dead end. (Written after the owner hit exactly this on a note I had
 * created to verify the tag rail and then removed.)
 */
export default function NoteNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-3">
      <Link
        href="/notes"
        className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> All notes
      </Link>

      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-bg-elev px-6 py-14 text-center shadow-sm">
        <FileQuestion size={24} className="text-fg-subtle" />
        <p className="text-[15px] font-semibold">This note isn&apos;t here any more</p>
        <p className="max-w-[26rem] text-[12.5px] text-fg-muted">
          It was probably deleted, or this is an old link. Nothing else has changed — your other
          notes are exactly where you left them.
        </p>
        <Link
          href="/notes"
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          Back to your notes
        </Link>
      </div>
    </div>
  );
}
