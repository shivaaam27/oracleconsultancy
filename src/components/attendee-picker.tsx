"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuStyle, useAnchoredMenu } from "@/lib/use-anchored-menu";
import { X, Check, Mail, MailX, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CalendarAttendee } from "@/lib/calendar";

export type AttendeeOption = { id: number; name: string; email: string | null };

/**
 * Searchable attendee selector for calendar events. Type to filter people,
 * pick from a dropdown, selected render as removable chips. Each person carries
 * an email indicator (green dot = invitable, amber = no email on file) so the
 * operator sees at a glance who will actually receive an automatic invite.
 * Controlled: parent owns the CalendarAttendee[] value.
 */
export function AttendeePicker({
  people,
  value,
  onChange,
}: {
  people: AttendeeOption[];
  value: CalendarAttendee[];
  onChange: (next: CalendarAttendee[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  /* ⚠️ Portalled — the calendar board scrolls, so an `absolute` list was
     clipped the moment the field sat low in the form. */
  const { anchorRef, menuRef, pos, mounted } =
    useAnchoredMenu<HTMLDivElement, HTMLUListElement>(open);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickedIds = useMemo(
    () => new Set(value.map((a) => a.personId).filter((x): x is number => x != null)),
    [value]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = people.filter((p) => !pickedIds.has(p.id));
    if (!q) return pool.slice(0, 8);
    return pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [people, query, pickedIds]);

  function add(p: AttendeeOption) {
    if (pickedIds.has(p.id)) return;
    onChange([...value, { personId: p.id, name: p.name, email: p.email ?? undefined }]);
    setQuery("");
    setHighlight(0);
    inputRef.current?.focus();
  }
  function remove(personId?: number) {
    onChange(value.filter((a) => a.personId !== personId));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const p = matches[highlight] ?? matches[0];
      if (open && p) add(p);
    } else if (e.key === "Backspace" && query === "" && value.length > 0) {
      remove(value[value.length - 1].personId);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const missing = value.filter((a) => !a.email);

  return (
    <div className="space-y-2">
      <div ref={anchorRef} className="relative">
        <div
          className={cn(
            // min-h-10 / rounded-xl to match every other field in the event form
            // (see FIELD_SHELL in calendar-board.tsx) — it used to sit 4px
            // shorter than its neighbours, which read as sloppy.
            "w-full min-h-10 px-2.5 py-1.5 rounded-xl border border-border bg-bg-elev",
            "flex flex-wrap items-center gap-1.5 cursor-text",
            "focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/20"
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((a) => (
            <span
              key={a.personId ?? a.name}
              className={cn(
                "inline-flex items-center gap-1.5 pl-1.5 pr-1 py-0.5 rounded-full text-xs font-medium",
                a.email ? "bg-accent/10 text-accent" : "bg-warn/15 text-warn"
              )}
              title={a.email || "No email on file — won't get an automatic invite"}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", a.email ? "bg-accent" : "bg-warn")} />
              {a.name}
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={(e) => { e.stopPropagation(); remove(a.personId); }}
                className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-black/10"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
            {value.length === 0 && <Search size={13} className="text-fg-subtle shrink-0" />}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKeyDown}
              placeholder={value.length === 0 ? "Search people to invite…" : ""}
              className="flex-1 min-w-[80px] bg-transparent outline-none border-none p-0 h-6 text-sm placeholder:text-fg-subtle focus:ring-0"
            />
          </div>
        </div>

        {mounted && open && pos && matches.length > 0 && createPortal(
          <ul ref={menuRef} role="listbox" style={menuStyle(pos)}
            className="overflow-y-auto rounded-md border border-border bg-bg-elev shadow-lg p-1">
            {matches.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); add(p); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors",
                    i === highlight ? "bg-bg-muted" : "hover:bg-bg-muted/60"
                  )}
                >
                  <span className={cn(
                    "h-6 w-6 rounded-full inline-flex items-center justify-center shrink-0",
                    p.email ? "bg-accent/10 text-accent" : "bg-warn/15 text-warn"
                  )}>
                    {p.email ? <Mail size={12} /> : <MailX size={12} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{p.name}</span>
                    <span className={cn("block text-xs truncate", p.email ? "text-fg-muted" : "text-warn")}>
                      {p.email || "No email on file"}
                    </span>
                  </span>
                  <Check size={14} className="shrink-0 opacity-0" />
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      </div>

      {missing.length > 0 && (
        <p className="text-xs text-warn flex items-start gap-1.5">
          <MailX size={13} className="mt-0.5 shrink-0" />
          <span>
            <b>{missing.map((a) => a.name).join(", ")}</b> {missing.length === 1 ? "has" : "have"} no email on file —
            {missing.length === 1 ? " they" : " they"}&rsquo;ll be skipped when sending invites. Add an email on their
            People profile, or share the event link instead.
          </span>
        </p>
      )}
    </div>
  );
}
