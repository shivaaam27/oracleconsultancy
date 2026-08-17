"use client";

import dynamic from "next/dynamic";

/**
 * The client boundary that lazy-loads the editor.
 *
 * ⚠️ PHASE 0 FINDING, and the real module must copy this shape: in Next 16
 * `next/dynamic` with `ssr: false` is **rejected inside a Server Component**
 * ("`ssr: false` is not allowed with `next/dynamic` in Server Components"). The
 * record page wants to stay a Server Component so it can load the note from the
 * database, so the no-SSR lazy import has to live in a one-line client wrapper
 * like this one, which the server page then renders.
 *
 * Why `ssr: false` at all: the editor must never render on the server (it needs
 * the DOM), and its JavaScript must stay in its own chunk instead of joining a
 * shared bundle that every other page pays for.
 */
const NoteEditorSpike = dynamic(
  () => import("@/components/lab/note-editor-spike").then((m) => m.NoteEditorSpike),
  {
    ssr: false,
    // Same height as the mounted editor so the page does not jump.
    loading: () => <div className="h-64 rounded-md border border-border bg-bg-elev" aria-hidden />,
  },
);

export function NoteEditorMount() {
  return <NoteEditorSpike />;
}
