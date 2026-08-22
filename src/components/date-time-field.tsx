"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuStyle, useAnchoredMenu } from "@/lib/use-anchored-menu";
import { DatePopover } from "@/components/date-popover";
import { cn } from "@/lib/cn";
import { formatTimeLabel, parseTimeInput, timeSuggestions } from "@/lib/time-input";

/* Shared date + time controls for event/meeting forms. The date uses the Aurora
 * DatePopover; the time is TYPED (see TimeField below — it replaced a 96-option
 * dropdown). Value is a datetime-local string ("yyyy-mm-ddThh:mm"), or just
 * "yyyy-mm-dd" for all-day; onChange emits the same. */

// The full-size Aurora field box so the date + time triggers match the other
// controls on the form (Company, Responsible people, etc.).
export const FIELD_TRIGGER = "rounded-xl bg-bg-subtle ring-1 ring-border px-3.5 py-3 text-sm text-fg transition-colors hover:ring-accent/40";

/**
 * A stored UTC instant → the value THESE controls expect ("yyyy-mm-ddThh:mm",
 * or "yyyy-mm-dd" for all-day), read as Dar es Salaam wall-clock.
 *
 * The inverse of what the server's `localToIso` does on submit. It lives here,
 * beside `composeDT`/`dateOf`/`timeOf`, because both event forms now need it —
 * the command centre to show an event being edited, and the portal sheet to
 * drop in a time read off an attached ticket.
 */
export function isoToLocalInput(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Shift to +03:00, then read the UTC fields — the same trick used app-wide.
  const shifted = new Date(d.getTime() + 3 * 3600_000).toISOString();
  return allDay ? shifted.slice(0, 10) : shifted.slice(0, 16);
}

// (TIME_OPTS — the 96-slot list — was removed with the dropdown that used it.
//  lib/time-input.ts owns the quarter-hour list now, for the suggestions.)

/**
 * TimeField — type the time instead of hunting for it.
 *
 * The old control was a 96-option dropdown: measured on the live form that is
 * 3,468px of list inside a 501px window, opening at midnight while the selected
 * time sat 1,446px below the fold. Changing 10:00 to 10:45 meant scrolling most
 * of a day, which is exactly the "I can't scroll to change time" complaint.
 *
 * Now: type "1430", "2:30pm" or "9" and it resolves (see lib/time-input.ts).
 * A short list of nearby times sits underneath for tapping, and it starts AROUND
 * the current value rather than at 00:00. Parsing is shared and unit-tested.
 */
export function TimeField({
  value,
  onChange,
  className,
  inputClassName,
}: {
  /** "HH:mm" 24-hour. */
  value: string;
  onChange: (v: string) => void;
  /** Wrapper (width). */
  className?: string;
  /** Field shell, so a form can match its own control height exactly. */
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  /* ⚠️ Portalled through the one hook — this field lives inside the director's
     event sheet, so an `absolute` menu was clipped by the sheet. */
  const { anchorRef: wrapRef, menuRef, pos, mounted, isInside } =
    useAnchoredMenu<HTMLDivElement, HTMLUListElement>(open);

  // Click-away commits whatever is typed. No dependency array on purpose: `close`
  // reads `typed`, and a stale closure here would commit yesterday's keystrokes.
  useEffect(() => {
    if (!open) return;
    // ⚠️ Includes the PORTALLED menu — see `isInside`.
    const onDoc = (e: MouseEvent) => { if (!isInside(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  });

  /**
   * Escape closes the SUGGESTION LIST — and nothing else.
   *
   * This has to be a capture listener on `window`, which reads like overkill
   * until you look at what it is competing with: Radix (the dialog behind this
   * form, and the portal's bottom sheet) registers its escape handler on
   * `document` with `capture: true`. Capture runs outside-in, so `document`
   * fires BEFORE the keystroke ever reaches this input — a normal React
   * onKeyDown with stopPropagation is far too late, which was measured: the
   * first Escape closed the entire half-filled event form.
   *
   * `window` is one level further out than `document`, so this runs first and
   * `stopImmediatePropagation` ends the matter. Only while the list is open, so
   * Escape still closes the dialog the rest of the time.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setTyped(null);
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open]);

  const suggestions = timeSuggestions(typed, value);

  /** Commit whatever is typed; keep the old value if it isn't a time. */
  function close() {
    const parsed = parseTimeInput(typed);
    if (parsed) onChange(parsed);
    setTyped(null);
    setOpen(false);
  }

  function pick(v: string) {
    onChange(v);
    setTyped(null);
    setOpen(false);
  }

  const shown = typed ?? formatTimeLabel(value);

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <input
        value={shown}
        // Clear the TEXT on focus but keep the current time visible as the
        // placeholder. Selecting-instead-of-clearing looked tidier, but a click
        // lands the caret and collapses the selection, so typing "1045" against
        // "9:00 AM" produced "9:00 AM1045" — unparseable. Clearing means every
        // keystroke starts a clean time, and the placeholder means the field
        // never looks like it has lost your value.
        onFocus={() => { setOpen(true); setTyped(""); }}
        onChange={(e) => { setTyped(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = suggestions[0];
            if (parseTimeInput(typed)) close();
            else if (first) pick(first.value);
          }
          // Escape is handled by the window capture listener above — it has to
          // run before Radix's, which sits on document in the capture phase.
        }}
        placeholder={formatTimeLabel(value) || "09:00"}
        inputMode="numeric"
        aria-label="Time"
        className={cn(FIELD_TRIGGER, "w-full bg-bg-subtle text-left outline-none focus:ring-2 focus:ring-accent/40", inputClassName)}
      />
      {mounted && open && pos && suggestions.length > 0 && createPortal(
        <ul ref={menuRef} role="listbox" style={menuStyle(pos)}
          className="overflow-auto rounded-md bg-bg-elev p-1 shadow-lg ring-1 ring-border">
          {suggestions.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(o.value); }}
                className={cn(
                  "block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-bg-muted",
                  o.value === value ? "text-accent font-medium" : "text-fg"
                )}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}

export const dateOf = (v: string) => (v || "").slice(0, 10);
export const timeOf = (v: string) => (v && v.length >= 16 ? v.slice(11, 16) : "");
export const composeDT = (date: string, time: string, allDay: boolean) =>
  !date ? "" : allDay ? date : `${date}T${time || "09:00"}`;

export function DateTimeField({
  name, allDay, value, onChange, defaultTime = "09:00",
}: {
  name: string;
  allDay: boolean;
  value: string;
  onChange: (v: string) => void;
  defaultTime?: string;
}) {
  const date = dateOf(value);
  // A time chosen BEFORE a date has nowhere to live in the combined value —
  // composeDT returns "" without a date, so it used to be thrown away and the
  // field snapped back to the default. Hold it here until a date arrives.
  // (The command centre solves this by keeping date and time as separate state;
  // this component's contract is a single string, so it remembers the draft.)
  const [timeDraft, setTimeDraft] = useState<string | null>(null);
  const time = timeOf(value) || timeDraft || defaultTime;
  const hidden = date ? (allDay ? date : composeDT(date, time, false)) : "";
  return (
    <>
      <input type="hidden" name={name} value={hidden} />
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">
          <DatePopover block triggerClassName={FIELD_TRIGGER} value={date || null} onChange={(d) => onChange(allDay ? d : composeDT(d, time, false))} />
        </div>
        {!allDay && (
          <TimeField
            className="w-[7.5rem] shrink-0"
            value={time}
            onChange={(t) => {
              setTimeDraft(t);
              if (date) onChange(composeDT(date, t, false));
            }}
          />
        )}
      </div>
    </>
  );
}
