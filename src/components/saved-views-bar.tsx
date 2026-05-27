"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Plus, X } from "lucide-react";
import { useToast } from "./toast";

export type SavedView = { id: string; name: string; query: string };

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function SavedViewsBar({
  initialViews,
  currentQuery,
  hasFilters,
}: {
  initialViews: SavedView[];
  currentQuery: string;
  hasFilters: boolean;
}) {
  const [views, setViews] = useState<SavedView[]>(initialViews);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const persist = async (next: SavedView[]) => {
    setViews(next);
    try {
      await fetch("/api/prefs/task-views", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ views: next }),
      });
    } catch {
      toast("Couldn't save view.", { tone: "danger" });
    }
  };

  const save = () => {
    const name = prompt("Name this view:");
    if (!name) return;
    startTransition(() => {
      persist([...views, { id: newId(), name: name.trim(), query: currentQuery }]);
      toast("View saved.", { tone: "success" });
    });
  };

  const remove = (id: string) => {
    startTransition(() => {
      persist(views.filter((v) => v.id !== id));
    });
  };

  if (views.length === 0 && !hasFilters) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Bookmark size={12} className="text-fg-subtle" />
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center group">
          <Link
            href={`/task?${v.query}`}
            className="text-xs px-2 py-1 rounded-l-full bg-bg-muted hover:bg-bg-elev"
          >
            {v.name}
          </Link>
          <button
            type="button"
            onClick={() => remove(v.id)}
            className="text-xs px-1.5 py-1 rounded-r-full bg-bg-muted hover:bg-danger hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Remove view ${v.name}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {hasFilters && (
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-border text-fg-muted hover:text-fg hover:border-accent"
        >
          <Plus size={10} /> Save view
        </button>
      )}
    </div>
  );
}
