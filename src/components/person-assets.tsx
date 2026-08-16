"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Select } from "./ui";
import Link from "next/link";
import { Laptop, Loader2, RotateCcw, Plus, Users } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { CollapsibleSection, EmptyState } from "./drawer-kit";
import type { AssetRow } from "@/lib/assets-shared";
import { assignAssetAction, returnAssetAction } from "@/app/hrms/assets/actions";

type Payload = { held: AssetRow[]; custodian: AssetRow[]; available: AssetRow[] };

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
      <div className="glass elevated rounded-2xl p-3 flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading equipment…
      </div>
    );
  }
  if (!data) return null;

  const held = data.held;
  const custodian = data.custodian ?? [];

  return (
    <CollapsibleSection icon={<Laptop size={14} />} title="Equipment held" count={held.length}>
      {held.length > 0 ? (
        <div className="divide-y divide-border/50">
          {held.map((a) => {
            const busy = busyId === a.id;
            const meta = [a.tag, a.category, a.serialNo].filter(Boolean).join(" · ");
            return (
              <div key={a.id} className={cn("group/row flex items-center gap-2.5 px-3.5 py-2.5", busy && "opacity-60")}>
                <span className="h-2 w-2 rounded-full bg-info shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  {meta && <div className="text-[11px] text-fg-subtle truncate">{meta}</div>}
                </div>
                <button
                  type="button" disabled={busy}
                  onClick={() => run(a.id, () => returnAssetAction(a.id), "Asset returned.")}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ring-1 ring-border bg-bg-subtle hover:bg-bg-muted shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Return
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Laptop size={20} />} title="No equipment" hint="Nothing assigned to this person yet." />
      )}

      {/* Shared kit this person is custodian of */}
      {custodian.length > 0 && (
        <div className="border-t border-border/50">
          <div className="px-3.5 pt-2 pb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            <Users size={12} /> Custodian of (shared)
          </div>
          <div className="divide-y divide-border/50">
            {custodian.map((a) => {
              const meta = [a.tag, a.category, a.assignedToCompanyName].filter(Boolean).join(" · ");
              return (
                <div key={a.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <span className="h-2 w-2 rounded-full bg-warn shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    {meta && <div className="text-[11px] text-fg-subtle truncate">{meta}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assign from in-store stock */}
      <div className="flex items-center gap-2 border-t border-border/50 px-3.5 py-2">
        <Plus size={13} className="text-fg-subtle shrink-0" />
        {data.available.length > 0 ? (
          <Select wrapperClassName="flex-1"
            disabled={busyId != null}
            defaultValue=""
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) run(v, () => assignAssetAction(v, personId), "Equipment assigned.");
              e.currentTarget.value = "";
            }}
            className="text-[11px] text-fg-muted"
          >
            <option value="" disabled>Assign equipment from store…</option>
            {data.available.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.tag ? ` (${a.tag})` : ""}</option>
            ))}
          </Select>
        ) : (
          <Link href="/hrms/assets" onClick={onNavigate} className="text-[11px] text-accent hover:underline">
            No equipment in store — add some in the Asset Register
          </Link>
        )}
      </div>
    </CollapsibleSection>
  );
}
