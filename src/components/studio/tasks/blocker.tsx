"use client";

/**
 * "Waiting on…" — who a task is blocked on, and why.
 *
 * The server actions have existed for months (`setTaskBlocker` /
 * `clearTaskBlocker`, used by MCP and ORI) but no administrator screen called
 * them; this is that screen. Raising one sets the status to Blocked and
 * suspends the overdue for everyone until it is cleared — say so before the
 * owner presses it.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { setTaskBlocker, clearTaskBlocker } from "@/app/task/actions";
import { useToast } from "@/components/toast";
import { SelectField } from "@/components/select-field";
import { FIELD } from "@/components/ui";
import { stBtn } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

export function StudioBlocker({
  taskId,
  closed,
  blockedOnPersonId,
  blockedReason,
  people,
  onChanged,
}: {
  taskId: number;
  closed: boolean;
  blockedOnPersonId: number | null;
  blockedReason: string | null;
  people: { id: number; name: string }[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const who = blockedOnPersonId != null ? people.find((p) => p.id === blockedOnPersonId)?.name ?? "someone" : null;

  async function raise(fd: FormData) {
    const personId = Number(fd.get("personId"));
    const reason = String(fd.get("reason") ?? "");
    if (!personId) return toast("Pick who it is waiting on.", { tone: "warn" });
    setBusy(true);
    const res = await setTaskBlocker(taskId, personId, reason);
    setBusy(false);
    if (!res.ok) return toast(res.error, { tone: "warn" });
    toast("Marked as waiting. Overdue is paused until it is cleared.", { tone: "success" });
    setOpen(false);
    onChanged();
  }

  async function clear() {
    setBusy(true);
    await clearTaskBlocker(taskId);
    setBusy(false);
    toast("Blocker cleared — the task is live again.", { tone: "success" });
    onChanged();
  }

  if (who) {
    return (
      <div className="space-y-2">
        <div className="text-[13px]">Waiting on <b className="font-semibold">{who}</b></div>
        {blockedReason && <div className="text-xs leading-relaxed text-[var(--st-sub)]">{blockedReason}</div>}
        {!closed && (
          <button type="button" disabled={busy} onClick={clear} className={cn(stBtn.ghost, "h-8 text-xs")}>
            {busy && <Loader2 size={12} className="animate-spin" />}Clear the blocker
          </button>
        )}
      </div>
    );
  }
  if (closed) return <div className="text-xs text-[var(--st-muted)]">Not waiting on anyone.</div>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} title="Overdue pauses until it is cleared" className="-mx-1.5 block rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-[var(--st-page)]">
        <span className="block text-[13px] text-[var(--st-muted)]">Nobody</span>
        <span className="block text-[11px] text-[var(--st-muted)]">Set who or what it is blocked on</span>
      </button>
    );
  }
  return (
    <form action={raise} className="min-w-0 space-y-2" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <SelectField name="personId" defaultValue="" placeholder="Who is it waiting on?" options={people.map((p) => ({ value: String(p.id), label: p.name }))} />
      <label className="block">
        <span className="sr-only">Why</span>
        <textarea name="reason" required rows={2} placeholder="Why — e.g. awaiting the signed resolution" className={cn(FIELD, "h-auto resize-none py-1.5 leading-snug")} />
      </label>
      <p className="text-[11px] leading-snug text-[var(--st-muted)]">Overdue pauses until it is cleared.</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button type="submit" disabled={busy} className={cn(stBtn.dark, "h-8 px-3 text-xs")}>{busy && <Loader2 size={12} className="animate-spin" />}Mark as waiting</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">Cancel</button>
      </div>
    </form>
  );
}
