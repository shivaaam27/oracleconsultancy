"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, Loader2 } from "lucide-react";

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
    <div className="border border-border rounded-xl p-4 bg-bg-subtle space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-fg-muted uppercase tracking-wider">
        <GitBranch size={12} />
        Similar Past Tasks
        {loading && <Loader2 size={11} className="animate-spin" />}
      </div>
      <div className="space-y-1.5">
        {tasks.map(t => (
          <Link
            key={t.id}
            href={`/task/${t.code}`}
            className="block bg-bg border border-border rounded-lg p-2.5 hover:border-accent/40 transition-colors group"
          >
            <div className="flex items-center gap-2 text-xs text-fg-muted mb-0.5">
              <span className="font-mono">{t.code}</span>
              {t.companyName && <span>{t.companyName}</span>}
              <span className={`ml-auto ${["Completed","Closed"].includes(t.status) ? "text-success" : "text-fg-muted"}`}>{t.status}</span>
              {t.resolvedInDays !== null && (
                <span className="text-fg-muted">· resolved in {t.resolvedInDays}d</span>
              )}
            </div>
            <p className="text-sm group-hover:text-accent transition-colors">{t.actionItem}</p>
            {t.latestUpdate && (
              <p className="text-xs text-fg-muted italic mt-1 line-clamp-2">→ {t.latestUpdate}</p>
            )}
          </Link>
        ))}
      </div>
      <p className="text-xs text-fg-subtle italic">Click any to view how it was handled.</p>
    </div>
  );
}
