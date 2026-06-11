"use client";

import { useEffect, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { TaskDrawerLink } from "./task-drawer-link";

type SimilarTask = {
  id: number;
  code: string;
  actionItem: string;
  status: string;
  companyName: string | null;
  resolvedInDays: number | null;
  latestUpdate: string | null;
};

export function SimilarTasks({ query, excludeId }: { query: string; excludeId?: number }) {
  const [tasks, setTasks] = useState<SimilarTask[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 6) { setTasks([]); return; }

    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/similar-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, excludeId }),
        });
        const data = await res.json();
        setTasks(data.tasks || []);
      } catch {
        setTasks([]);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(t);
  }, [query, excludeId]);

  if (!query.trim() || query.trim().length < 6) return null;
  if (!loading && tasks.length === 0) return null;

  return (
    <details className="group glass elevated rounded-2xl overflow-hidden">
      <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium text-fg-muted uppercase tracking-wider select-none">
        <GitBranch size={12} />
        <span>Similar past tasks</span>
        <span className="text-fg-subtle normal-case tracking-normal">· {tasks.length}</span>
        {loading && <Loader2 size={11} className="animate-spin" />}
        <span className="ml-auto text-fg-subtle text-base leading-none transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="px-4 pb-4 space-y-1.5">
        {tasks.map(t => (
          <TaskDrawerLink
            key={t.id}
            code={t.code}
            className="block w-full text-left bg-bg-subtle/60 border border-border rounded-xl p-2.5 hover:border-accent/40 transition-colors group/item"
          >
            <div className="flex items-center gap-2 text-xs text-fg-muted mb-0.5">
              <span className="font-mono">{t.code}</span>
              {t.companyName && <span>{t.companyName}</span>}
              <span className={`ml-auto ${["Completed","Closed"].includes(t.status) ? "text-success" : "text-fg-muted"}`}>{t.status}</span>
              {t.resolvedInDays !== null && (
                <span className="text-fg-muted">· resolved in {t.resolvedInDays}d</span>
              )}
            </div>
            <p className="text-sm group-hover/item:text-accent transition-colors">{t.actionItem}</p>
            {t.latestUpdate && (
              <p className="text-xs text-fg-muted italic mt-1 line-clamp-2">→ {t.latestUpdate}</p>
            )}
          </TaskDrawerLink>
        ))}
        <p className="text-xs text-fg-subtle italic pt-1">Tap any to see how it was handled.</p>
      </div>
    </details>
  );
}
