"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, History, AlertCircle } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Badge } from "./ui";
import { cn } from "@/lib/cn";

/* ═══════════════════════════════════════════════════════════════════════════
 * TracePanel — "everything can be searched, found and even traced".
 *
 * A self-managing Aurora glass sheet that shows the FULL chronological trail of
 * any entity. It is mounted ONCE (by the command-palette agent) and listens for
 * a window CustomEvent — it has no required props and opens itself.
 *
 *   window.dispatchEvent(new CustomEvent("cos:trace", {
 *     detail: { type: "task", id: 42, title: "DS-001 · Renew licence" },
 *   }));
 *
 * On the event it opens, fetches /api/trace?type=&id=, and renders the timeline
 * grouped by day (dot · time · title · detail · "by"). Built on BottomSheet so
 * Esc/backdrop close, scroll-lock, portal-to-body and reduced-motion all come
 * for free.
 * ═══════════════════════════════════════════════════════════════════════════ */

type TraceEvent = {
  at: string;
  kind: string;
  title: string;
  detail?: string;
  by?: string;
};

type TraceData = {
  type: string;
  id: number;
  label: string;
  events: TraceEvent[];
};

type TraceTarget = { type: string; id: number; title?: string };

// Map a kind to a Badge tone so the chips read at a glance.
function kindTone(kind: string): "default" | "accent" | "success" | "warn" | "danger" | "info" {
  const k = kind.toLowerCase();
  if (k === "created" || k === "filed" || k === "issued") return "success";
  if (k === "closed" || k === "completed") return "success";
  if (k === "trashed" || k === "archived") return "danger";
  if (k === "update" || k === "linked" || k === "fact") return "info";
  if (k === "automation" || k === "renewal" || k === "decision") return "accent";
  if (k === "reviewed" || k === "leave") return "warn";
  return "default";
}

// Human label for the entity type shown in the header.
function typeLabel(type: string): string {
  const map: Record<string, string> = {
    task: "Task",
    person: "Person",
    company: "Company",
    document: "Document",
    letter: "Letter",
    vendor: "Vendor",
    asset: "Asset",
    pipeline: "Application",
    commitment: "Commitment",
    risk: "Risk",
    governance: "Governance",
    meeting: "Meeting",
  };
  return map[type] ?? (type ? type.charAt(0).toUpperCase() + type.slice(1) : "Record");
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "Unknown" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function TracePanel(): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<TraceTarget | null>(null);
  const [data, setData] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: TraceTarget) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/trace?type=${encodeURIComponent(t.type)}&id=${encodeURIComponent(String(t.id))}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Couldn't load this trail. Please try again.");
        return;
      }
      const json = (await res.json()) as TraceData;
      setData(json);
    } catch {
      setError("Couldn't load this trail. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for the open event from anywhere in the app.
  useEffect(() => {
    const onTrace = (e: Event) => {
      const detail = (e as CustomEvent).detail as TraceTarget | undefined;
      if (!detail || !detail.type || !detail.id) return;
      setTarget(detail);
      setOpen(true);
      load(detail);
    };
    window.addEventListener("cos:trace", onTrace as EventListener);
    return () => window.removeEventListener("cos:trace", onTrace as EventListener);
  }, [load]);

  if (!open) return null;

  const heading = target?.title || data?.label || (target ? `${typeLabel(target.type)} #${target.id}` : "Trail");
  const tLabel = typeLabel(target?.type ?? data?.type ?? "");

  // Group events by calendar day, preserving the newest-first order.
  const groups: { day: string; events: TraceEvent[] }[] = [];
  for (const ev of data?.events ?? []) {
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
      maxWidth="max-w-xl"
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{heading}</span>
          {tLabel && (
            <span className="shrink-0 rounded-full bg-bg-subtle/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted">
              {tLabel}
            </span>
          )}
        </span>
      }
    >
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-fg-muted">
          <Loader2 size={16} className="animate-spin text-accent" /> Tracing the trail…
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-muted">
          <AlertCircle size={20} className="text-danger" />
          <p>{error}</p>
          {target && (
            <button
              type="button"
              onClick={() => load(target)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-bg-muted transition-colors"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {!loading && !error && data && data.events.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-muted">
          <History size={20} className="text-fg-subtle" />
          <p>No history recorded yet.</p>
        </div>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="space-y-5 py-1">
          {groups.map((g) => (
            <div key={g.day}>
              <h3 className="sticky top-0 z-10 -mx-1 mb-2 bg-bg-elev/0 px-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
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
                        <span className="text-[11px] tabular-nums text-fg-subtle">{timeOf(ev.at)}</span>
                        {ev.by && (
                          <span className="ml-auto truncate text-[11px] text-fg-muted">by {ev.by}</span>
                        )}
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
