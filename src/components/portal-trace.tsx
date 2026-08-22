"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, History, AlertCircle } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Badge } from "./ui";
import { cn } from "@/lib/cn";
import { portalTrace, type PortalTraceEvent } from "@/app/portal/trace-actions";

/* ═══════════════════════════════════════════════════════════════════════════
 * PortalTrace — the staff-portal "History" trail.
 *
 * A self-managing Aurora glass sheet that shows the chronological history of a
 * task or a person, scoped to what the signed-in staff member is allowed to see
 * (the server action re-checks the gate). It is mounted ONCE per page and listens
 * for a window CustomEvent — it has no required props and opens itself.
 *
 *   window.dispatchEvent(new CustomEvent("portal:trace", {
 *     detail: { kind: "task", id: 42, title: "DS-001" },
 *   }));
 *
 * Built on BottomSheet so Esc/backdrop close, scroll-lock, portal-to-body and
 * reduced-motion all come for free. British English throughout.
 *
 * Also exports <PortalTraceButton/> — a tiny client trigger a SERVER page can
 * render to dispatch the event without becoming a client component itself.
 * ═══════════════════════════════════════════════════════════════════════════ */

type TraceTarget = { kind: "task" | "person"; id: number; title?: string };

// Map a kind to a Badge tone so the chips read at a glance.
function kindTone(kind: string): "default" | "accent" | "success" | "warn" | "danger" | "info" {
  const k = kind.toLowerCase();
  if (k === "created" || k === "closed" || k === "restored") return "success";
  if (k === "archived") return "danger";
  if (k === "update") return "info";
  if (k === "leave" || k === "asset") return "warn";
  if (k === "change") return "accent";
  return "default";
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "Unknown"
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function PortalTrace(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TraceTarget | null>(null);
  const [events, setEvents] = useState<PortalTraceEvent[] | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (t: TraceTarget) => {
    setLoading(true);
    setError(false);
    setEvents(null);
    setLabel(null);
    try {
      const res = await portalTrace(t.kind, t.id);
      if (!res.ok) {
        setError(true);
        return;
      }
      setEvents(res.events);
      setLabel(res.label);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for the open event from anywhere on the page.
  useEffect(() => {
    const onTrace = (e: Event) => {
      const detail = (e as CustomEvent).detail as TraceTarget | undefined;
      if (!detail || !detail.kind || !detail.id) return;
      setTarget(detail);
      setOpen(true);
      load(detail);
    };
    window.addEventListener("portal:trace", onTrace as EventListener);
    return () => window.removeEventListener("portal:trace", onTrace as EventListener);
  }, [load]);

  if (!open) return null;

  const heading = target?.title || label || "History";

  // Group events by calendar day, preserving the newest-first order.
  const groups: { day: string; events: PortalTraceEvent[] }[] = [];
  for (const ev of events ?? []) {
    const day = dayKey(ev.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(ev);
    else groups.push({ day, events: [ev] });
  }

  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      icon={<History size={18} />}
      maxWidth="max-w-lg"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{heading}</span>
          <span className="shrink-0 rounded-full bg-bg-subtle/70 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
            History
          </span>
        </span>
      }
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
          <Loader2 size={16} className="animate-spin text-accent" /> Loading history…
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-muted">
          <AlertCircle size={20} className="text-danger" />
          <p>Couldn&apos;t load this history — try again.</p>
          {target && (
            <button
              type="button"
              onClick={() => load(target)}
              className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-fg transition-colors hover:bg-bg-muted"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!loading && !error && events && events.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-muted">
          <History size={20} className="text-fg-subtle" />
          <p>No history yet.</p>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-5 py-1">
          {groups.map((g) => (
            <div key={g.day}>
              <h3 className="-mx-1 mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                {g.day}
              </h3>
              <ol className="relative space-y-3 pl-4">
                {/* The thread line down the timeline. */}
                <span aria-hidden className="absolute bottom-1 left-[3px] top-1 w-px bg-border/70" />
                {g.events.map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="relative">
                    {/* Dot on the thread. */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-4 top-1.5 h-1.5 w-1.5 rounded-full ring-2 ring-bg-elev",
                        kindTone(ev.kind) === "danger"
                          ? "bg-danger"
                          : kindTone(ev.kind) === "warn"
                            ? "bg-warn"
                            : kindTone(ev.kind) === "success"
                              ? "bg-success"
                              : kindTone(ev.kind) === "accent"
                                ? "bg-accent"
                                : "bg-fg-subtle"
                      )}
                    />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={kindTone(ev.kind)} className="shrink-0">
                          {ev.kind}
                        </Badge>
                        <span className="text-xs tabular-nums text-fg-subtle">{timeOf(ev.at)}</span>
                        {ev.by && <span className="ml-auto truncate text-xs text-fg-muted">by {ev.by}</span>}
                      </div>
                      <p className="text-sm leading-snug text-fg">{ev.title}</p>
                      {ev.detail && <p className="text-xs leading-snug text-fg-muted">{ev.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

/* A tiny client trigger a server page can drop in. It dispatches the open event;
 * the once-mounted <PortalTrace/> catches it and shows the sheet. */
export function PortalTraceButton({
  kind,
  id,
  title,
  label = "History",
  className,
}: {
  kind: "task" | "person";
  id: number;
  title?: string;
  label?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent("portal:trace", { detail: { kind, id, title } }))
      }
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-bg-subtle/50 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg",
        className
      )}
    >
      <History size={13} /> {label}
    </button>
  );
}
