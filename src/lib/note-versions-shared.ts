/**
 * Versions — the CLIENT-SAFE half. Phase 6 of memory/notes_module_plan.md.
 *
 * ⚠️ The server twin imports `sb`; a `"use client"` file that reaches for it kills
 * every page with "SUPABASE_SERVICE_ROLE_KEY is not set". Fourth file in this
 * module to need the split, and the rule has not changed.
 */

export type NoteRevision = {
  id: number;
  title: string;
  preview: string;
  /** Why the snapshot was taken — shown so "before the AI touched it" is findable. */
  reason: "manual" | "ai" | "template";
  createdAt: string;
};

export const REVISION_REASON_LABELS: Record<NoteRevision["reason"], string> = {
  manual: "Saved",
  ai: "Before AI",
  template: "Before template",
};

/** "3 minutes ago", "yesterday", "12 Aug" — a version list is read at a glance. */
export function agoLabel(iso: string, now = Date.now()): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const secs = Math.max(0, Math.round((now - at) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
