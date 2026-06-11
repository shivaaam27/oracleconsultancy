/**
 * App-wide triggers to open the unified COS Command surface (the ⌘K palette)
 * and optionally run a prompt in conversation mode. Dispatches window events the
 * CommandPaletteProvider listens for. Kept as plain functions (not React) so any
 * button anywhere — nav, suggestion reveal, /ask redirect — can call them.
 *
 * (These replace the old floating-assistant triggers; the round pill is gone.)
 */

/** Open the command surface. `full` requests the expanded conversation pane. */
export function openAssistant(full = false) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("cos:assistant", { detail: { full } }));
  }
}

/** Open the surface and immediately ask a prompt (conversation mode). */
export function askAssistant(q: string) {
  if (typeof window === "undefined") return;
  openAssistant(true);
  // Let the palette mount + its listener attach before the prompt lands.
  setTimeout(() => window.dispatchEvent(new CustomEvent("cos:ask", { detail: { q } })), 60);
}
