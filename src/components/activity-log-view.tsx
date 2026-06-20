"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, User as UserIcon, Users, Sparkles, ChevronDown, X, Eraser } from "lucide-react";
import { Segmented } from "@/components/macos";
import type { Actor } from "@/lib/activity-log";

// Plain client list so the actor filter + date grouping are instant. Rows arrive
// from the server with display labels precomputed (no locale-dependent formatting
// here — that would mismatch on hydration). Filtering is local, no refetch.
type Row = {
  key: string; actor: Actor; actorLabel: string; summary: string;
  detail: string | null; href: string | null; dayLabel: string; timeLabel: string;
};

const ACTOR_META: Record<Actor, { label: string; Icon: typeof Bot; cls: string }> = {
  system: { label: "System", Icon: Bot, cls: "text-accent bg-accent/10 ring-accent/30" },
  you: { label: "You", Icon: UserIcon, cls: "text-fg-muted bg-bg-muted ring-border" },
  staff: { label: "Staff", Icon: Users, cls: "text-info bg-info-soft ring-info/30" },
};

// "Clearing" is non-destructive: it just hides rows by key in this browser. The
// underlying audit/system records are never deleted. Persisted so a cleared list
// stays clear across visits; "Show cleared" brings them back.
const CLEARED_KEY = "cos.activity.cleared";

export function ActivityLogView({ rows }: { rows: Row[] }) {
  const [actor, setActor] = useState<Actor | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [showCleared, setShowCleared] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load the cleared set after mount (localStorage isn't available on the server).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLEARED_KEY);
      if (raw) setCleared(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  function persistCleared(next: Set<string>) {
    setCleared(next);
    try { localStorage.setItem(CLEARED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }

  const byActor = useMemo(() => rows.filter((r) => actor === "all" || r.actor === actor), [rows, actor]);
  const visible = useMemo(
    () => (showCleared ? byActor : byActor.filter((r) => !cleared.has(r.key))),
    [byActor, cleared, showCleared],
  );

  const groups = useMemo(() => {
    const out: { day: string; items: Row[] }[] = [];
    for (const r of visible) {
      const last = out[out.length - 1];
      if (last && last.day === r.dayLabel) last.items.push(r);
      else out.push({ day: r.dayLabel, items: [r] });
    }
    return out;
  }, [visible]);

  const clearedShownCount = useMemo(() => byActor.filter((r) => cleared.has(r.key)).length, [byActor, cleared]);

  function toggleDay(day: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  }
  function clearKeys(keys: string[]) {
    const next = new Set(cleared);
    for (const k of keys) next.add(k);
    persistCleared(next);
  }
  function clearAll() { clearKeys(byActor.map((r) => r.key)); }
  function restoreAll() { persistCleared(new Set()); setShowCleared(false); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Segmented<Actor | "all">
          value={actor}
          onChange={setActor}
          options={[
            { value: "all", label: "Everything" },
            { value: "system", label: "System" },
            { value: "you", label: "You" },
            { value: "staff", label: "Staff" },
          ]}
        />
        <div className="flex items-center gap-3">
          {hydrated && clearedShownCount > 0 && (
            <button type="button" onClick={() => setShowCleared((v) => !v)} className="text-[11px] text-accent hover:underline">
              {showCleared ? "Hide cleared" : `Show cleared (${clearedShownCount})`}
            </button>
          )}
          {hydrated && showCleared && cleared.size > 0 && (
            <button type="button" onClick={restoreAll} className="text-[11px] text-accent hover:underline">Restore all</button>
          )}
          {visible.length > 0 && !showCleared && (
            <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-danger transition-colors">
              <Eraser size={12} /> Clear all
            </button>
          )}
          <span className="text-[11px] text-fg-subtle">{visible.length} action{visible.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-fg-muted flex flex-col items-center gap-2">
          <Sparkles size={20} className="text-fg-subtle" />
          {clearedShownCount > 0 ? "All caught up — everything here is cleared." : "Nothing here yet — actions will appear as they happen."}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.day);
            return (
              <section key={g.day} className="space-y-1.5">
                <div className="group flex items-center gap-2 px-1">
                  <button type="button" onClick={() => toggleDay(g.day)} className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-muted hover:text-fg transition-colors">
                    <ChevronDown size={13} className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    {g.day}
                    <span className="text-fg-subtle normal-case tracking-normal">· {g.items.length}</span>
                  </button>
                  {!showCleared && (
                    <button
                      type="button"
                      onClick={() => clearKeys(g.items.map((r) => r.key))}
                      title={`Clear ${g.day}`}
                      className="inline-flex items-center gap-1 text-[10px] text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger transition-all"
                    >
                      <X size={11} /> Clear
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <ul className="glass elevated rounded-2xl divide-y divide-border/50 overflow-hidden">
                    {g.items.map((r) => {
                      const meta = ACTOR_META[r.actor];
                      const body = (
                        <div className="flex items-start gap-2.5 px-4 py-2.5">
                          <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${meta.cls}`} title={meta.label}>
                            <meta.Icon size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-snug">
                              <span className="font-medium">{r.actorLabel}</span>{" "}
                              <span className="text-fg">{r.summary}</span>
                            </p>
                            {r.detail && <p className="text-[11px] text-fg-muted leading-snug truncate">{r.detail}</p>}
                          </div>
                          <span className="shrink-0 text-[11px] text-fg-subtle tabular-nums mt-0.5">{r.timeLabel}</span>
                        </div>
                      );
                      return (
                        <li key={r.key} className="hover:bg-bg-subtle/40 transition-colors">
                          {r.href ? <Link href={r.href} className="block">{body}</Link> : body}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
