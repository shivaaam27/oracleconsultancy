"use client";

import dynamic from "next/dynamic";
import type { LinkCandidate } from "@/lib/note-unlinked-shared";

/**
 * The client boundary that lazy-loads the note canvas.
 *
 * ⚠️ This one-line wrapper exists for a reason established in the Phase 0 spike:
 * **Next 16 rejects `next/dynamic` with `ssr: false` inside a Server Component**
 * ("`ssr: false` is not allowed with `next/dynamic` in Server Components", a build
 * error, not a warning). The record page must stay a Server Component so it can load
 * the note from the database, so the no-SSR import lives here instead.
 *
 * `ssr: false` matters twice over: the editor needs the DOM, and this keeps its
 * ~122 kB (gzip) in a chunk that only a note page ever downloads — measured in
 * Phase 0 as absent from the build manifest.
 */
const NoteEditor = dynamic(() => import("@/components/note-editor").then((m) => m.NoteEditor), {
  ssr: false,
  /* Same shape as the sheet, so nothing jumps when the editor arrives — AT BOTH
     SIZES. Below `lg` the sheet covers the screen, so a bordered card here is a
     frame that appears for a moment and then vanishes. Expressed in CSS rather
     than measured, because this renders before any of the editor's own code. */
  loading: () => (
    <div
      className="h-[100dvh] bg-bg-elev lg:h-auto lg:min-h-[70vh] lg:rounded-lg lg:border lg:border-border lg:shadow-sm"
      aria-hidden
    />
  ),
});

export function NoteEditorMount(props: {
  noteId: number;
  initialTitle: string;
  initialBody: unknown;
  initialUpdatedAt: string;
  /** Names to watch for in the text — see lib/note-unlinked-shared.ts. */
  candidates: LinkCandidate[];
}) {
  return <NoteEditor {...props} />;
}
