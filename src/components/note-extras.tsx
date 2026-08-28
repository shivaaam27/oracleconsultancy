"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * Everything that is ABOUT a note rather than IN it — the folder, pin, archive,
 * template, to-dos, links, versions — held behind the "⋯" in the writing
 * toolbar, on a phone only.
 *
 * ⚠️ THEY WERE THREE PANELS STACKED UNDER THE WRITING, and that is what made the
 * note page unusable on a phone: measured at 375×812, the paper got 277px of an
 * 812px screen because a control row sat above it and three panels below. None of
 * them is something you look at WHILE writing — they are what you open when you
 * have stopped.
 *
 * ⚠️ NOTHING IS REMOVED, only moved. A drawer you cannot find is the same as a
 * feature that was deleted, which is why the trigger sits in the toolbar next to
 * the tools rather than floating over the page.
 *
 * From `lg` up this renders nothing at all: the panels stay in the page's right
 * rail, where there is room for them and where you can read them beside the note.
 */
export function NoteExtras({ children }: { children: ReactNode }) {
  /* ⚠️ `false` while there is no window, so a server render produces a CLOSED
     sheet — which is nothing on the screen — rather than a desktop that briefly
     renders the panels twice. */
  const wide = useMediaQuery("(min-width: 1024px)", false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("cos:note-extras", show);
    return () => window.removeEventListener("cos:note-extras", show);
  }, []);

  // Never leave it mounted-but-hidden on a wide screen: the panels are already
  // rendered in the rail there, and two live copies of the to-do list would both
  // be writing to the same rows.
  useEffect(() => {
    if (wide) setOpen(false);
  }, [wide]);

  if (wide) return null;

  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      title="This note"
      icon={<FileText size={16} className="text-accent" />}
    >
      <div className="space-y-2.5 pb-2">{children}</div>
    </BottomSheet>
  );
}
