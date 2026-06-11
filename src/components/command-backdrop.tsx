"use client";

/**
 * Calm "liquid glass" backdrop for the command surface: a couple of large, soft
 * accent glows that drift slowly behind a frosted scrim. Pure CSS (no WebGL) —
 * cheap, never janks, and sits strictly behind the panel so it never touches the
 * search/chat content. Drift pauses under prefers-reduced-motion (handled in CSS).
 */
export function CommandBackdrop() {
  return (
    <div aria-hidden className="cmd-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <span className="cmd-blob cmd-blob-a" />
      <span className="cmd-blob cmd-blob-b" />
    </div>
  );
}
