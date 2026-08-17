"use client";

import dynamic from "next/dynamic";

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
  loading: () => <div className="min-h-[24rem] rounded-md border border-border bg-bg-elev" aria-hidden />,
});

export function NoteEditorMount(props: { noteId: number; initialBody: unknown; initialUpdatedAt: string }) {
  return <NoteEditor {...props} />;
}
