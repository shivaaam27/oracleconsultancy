"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, User as UserIcon, Users, Sparkles } from "lucide-react";
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

export function ActivityLogView({ rows }: { rows: Row[] }) {
  const [actor, setActor] = useState<Actor | "all">("all");

  const filtered = useMemo(
    () => rows.filter((r) => actor === "all" || r.actor === actor),
    [rows, actor],
  );

  const groups = useMemo(() => {
    const out: { day: string; items: Row[] }[] = [];
    for (const r of filtered) {
      const last = out[out.length - 1];
      if (last && last.day === r.dayLabel) last.items.push(r);
      else out.push({ day: r.dayLabel, items: [r] });
    }
    return out;
  }, [filtered]);

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
        <span className="text-[11px] text-fg-subtle">{filtered.length} action{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-fg-muted flex flex-col items-center gap-2">
          <Sparkles size={20} className="text-fg-subtle" />
          Nothing here yet — actions will appear as they happen.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.day} className="space-y-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">{g.day}</h2>
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
