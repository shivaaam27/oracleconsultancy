"use client";
/**
 * A page can put its own line on the left of the Studio footer (mockup boards:
 * "Needs you most · MES Ltd …" on Companies, "Company · Furaha Innovation Ltd"
 * on a company). Otherwise the footer shows the next deadline.
 *
 * The note is tied to the path it was set on, so it can never linger on the
 * next page. It is kept on `window` as well as sent as an event, because the
 * footer and the page mount in the same commit and either may listen first.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { StudioFootNote } from "./shell";

export type PageFootNote = { path: string; note: StudioFootNote } | null;
declare global { interface Window { __studioFootNote?: PageFootNote } }

export const FOOT_NOTE_EVENT = "studio:foot-note";

function publish(v: PageFootNote) {
  window.__studioFootNote = v;
  window.dispatchEvent(new CustomEvent<PageFootNote>(FOOT_NOTE_EVENT, { detail: v }));
}

export function useStudioFootNote(note: StudioFootNote) {
  const path = usePathname() || "/";
  const key = note ? `${note.label}|${note.text}|${note.href ?? ""}` : "";
  useEffect(() => {
    publish(note ? { path, note } : null);
    return () => publish(null);
  }, [path, key]); // eslint-disable-line react-hooks/exhaustive-deps
}
