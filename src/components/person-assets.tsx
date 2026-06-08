"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Laptop, Loader2, RotateCcw, Plus, ChevronDown } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import type { AssetRow } from "@/lib/assets-shared";
import { assignAssetAction, returnAssetAction } from "@/app/hrms/assets/actions";

type Payload = { held: AssetRow[]; available: AssetRow[] };

export function PersonAssets({
  personId,
  onChanged,
  onNavigate,
  onSummary,
}: {
  personId: number;
  onChanged?: () => void;
  onNavigate?: () => void;
  onSummary?: (s: { held: number }) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const autoSet = useRef(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/person-assets?id=${personId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load"))))
      .then((d: Payload) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!data) return;
    onSummary?.({ held: data.held.length });
    if (!autoSet.current) { autoSet.current = true; if (data.held.length > 0) setOpen(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      if (okMsg) toast(okMsg, { tone: "success" });
      load();
      onChanged?.();
    });
  }

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-bg-elev p-3 ring-1 ring-border flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading equipment…
      </div>
    );
  }
  if (!data) return null;

  const held = data.held;

  return (
    <details className="group rounded-2xl bg-bg-elev ring-1 ring-border overflow-hidden" open={open}>
      <summary
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="list-none cursor-pointer flex items-center gap-2 px-3 py-2.5 select-none"
      >
        <Laptop size={15} className="text-accent" />
        <span className="text-sm font-semibold">Equipment held</span>
        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular">
          {held.length}
        </span>
        <ChevronDown size={16} className={cn("ml-auto shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </summary>

      <div className="border-t border-border/70">
      {held.length > 0 ? (
        <div className="divide-y divide-border/50">
          {held.map((a) => {
            const busy = busyId === a.id;
            const meta = [a.tag, a.category].filter(Boolean).join(" · ");
            return (
              <div key={a.id} className={cn("flex items-center gap-2.5 px-3 py-2", busy && "opacity-60")}>
                <span className="h-1.5 w-1.5 rounded-full bg-info shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  {meta && <div className="text-[11px] text-fg-muted truncate">{meta}</div>}
                </div>
                <button
                  type="button" disabled={busy}
                  onClick={() => run(a.id, () => returnAssetAction(a.id), "Asset returned.")}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-border bg-bg-subtle hover:bg-bg-muted shrink-0"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Return
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-2.5 text-xs text-fg-muted">No equipment assigned yet.</div>
      )}

      {/* Assign from in-store stock */}
      <div className="flex items-center gap-2 border-t border-border/70 px-3 py-2">
        <Plus size={13} className="text-fg-subtle shrink-0" />
        {data.available.length > 0 ? (
          <select
            disabled={busyId != null}
            defaultValue=""
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) run(v, () => assignAssetAction(v, personId), "Equipment assigned.");
              e.currentTarget.value = "";
            }}
            className="flex-1 rounded-md bg-bg-subtle text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1"
          >
            <option value="" disabled>Assign equipment from store…</option>
            {data.available.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.tag ? ` (${a.tag})` : ""}</option>
            ))}
          </select>
        ) : (
          <Link href="/hrms/assets" onClick={onNavigate} className="text-[11px] text-accent hover:underline">
            No equipment in store — add some in the Asset Register
          </Link>
        )}
      </div>
      </div>
    </details>
  );
}
