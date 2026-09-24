"use client";
/* Equipment on the Studio person page — the old drawer's PersonAssets, in the
 * Studio grammar. Same data (/api/person-assets) and the same two actions
 * (assignAssetAction / returnAssetAction); the Asset register keeps its own page. */
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Laptop, Loader2, RotateCcw, Users, ArrowUpRight } from "lucide-react";
import { StudioChoiceMenu } from "@/components/studio/tasks/cells";
import { useToast } from "@/components/toast";
import type { AssetRow } from "@/lib/assets-shared";
import { assignAssetAction, returnAssetAction } from "@/app/hrms/assets/actions";
import { cn } from "@/lib/cn";

type Payload = { held: AssetRow[]; custodian: AssetRow[]; available: AssetRow[] };

export function StudioPersonEquipment({ personId, firstName, onChanged }: { personId: number; firstName: string; onChanged?: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [, start] = useTransition();

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

  function run(id: number, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusyId(id);
    start(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.ok) { toast(res.error ?? "Something went wrong.", { tone: "danger" }); return; }
      toast(okMsg, { tone: "success" });
      load();
      onChanged?.();
    });
  }

  if (loading && !data) {
    return <div className="flex items-center gap-2 py-6 text-[13px] text-[var(--st-muted)]"><Loader2 size={14} className="animate-spin" />Loading equipment…</div>;
  }
  if (!data) return <div className="py-6 text-[13px] text-[var(--st-muted)]">Couldn&rsquo;t load the equipment. Try again in a moment.</div>;

  const Row = ({ a, shared }: { a: AssetRow; shared?: boolean }) => {
    const meta = [a.tag, a.category, shared ? a.assignedToCompanyName : a.serialNo].filter(Boolean).join(" · ");
    const busy = busyId === a.id;
    return (
      <div className={cn("grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-[var(--st-line-soft)] py-2.5 last:border-0", busy && "opacity-60")}>
        <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--st-page)] text-[var(--st-sub)]">{shared ? <Users size={15} /> : <Laptop size={15} />}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px]">{a.name}</span>
          {meta && <span className="block truncate text-[11px] text-[var(--st-muted)]">{meta}</span>}
        </span>
        {!shared && (
          <button type="button" disabled={busy} onBlur={() => setConfirmId(null)}
            onClick={() => { if (confirmId !== a.id) { setConfirmId(a.id); return; } setConfirmId(null); run(a.id, () => returnAssetAction(a.id), `${a.name} returned to the store.`); }}
            className={cn("inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
              confirmId === a.id ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] hover:bg-[var(--st-page)]")}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}{confirmId === a.id ? "Press again to return" : "Return"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1 text-xs text-[var(--st-label)]">Signed out to {firstName} · {data.held.length}</div>
        {data.held.length === 0
          ? <div className="py-3 text-[13px] text-[var(--st-muted)]">Nothing signed out to them.</div>
          : data.held.map((a) => <Row key={a.id} a={a} />)}
      </div>

      {data.custodian.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-[var(--st-label)]">In their care — shared with a company · {data.custodian.length}</div>
          {data.custodian.map((a) => <Row key={a.id} a={a} shared />)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--st-line-soft)] pt-3">
        {data.available.length > 0 ? (
          <StudioChoiceMenu value={null} empty="pick from the store" prefix="Sign out" showDot={false} width={320}
            options={data.available.map((a) => ({ value: String(a.id), label: `${a.name}${a.tag ? ` · ${a.tag}` : ""}` }))}
            onPick={(v) => { const id = Number(v); const a = data.available.find((x) => x.id === id); run(id, () => assignAssetAction(id, personId), `${a?.name ?? "Equipment"} signed out to ${firstName}.`); }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-xs hover:bg-[var(--st-page)]" />
        ) : (
          <span className="text-xs text-[var(--st-muted)]">Nothing in the store to sign out.</span>
        )}
        <Link href="/hrms/assets" className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--st-sub)] hover:text-[var(--st-ink)]">Asset register<ArrowUpRight size={12} /></Link>
      </div>
    </div>
  );
}
