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
      <div className="space-y-2">
        <div className="text-xs leading-relaxed text-[var(--st-muted)]">Nobody. If it is stuck on someone, say who — overdue pauses until it is cleared.</div>
        <button type="button" onClick={() => setOpen(true)} className={cn(stBtn.ghost, "h-8 text-xs")}>Mark as waiting on someone</button>
      </div>
    );
  }
  return (
    <form action={raise} className="space-y-2">
      <SelectField name="personId" defaultValue="" placeholder="Who is it waiting on?" options={people.map((p) => ({ value: String(p.id), label: p.name }))} />
      <label className="block">
        <span className="sr-only">Why</span>
        <input name="reason" required placeholder="Why — e.g. awaiting the signed resolution" className={FIELD} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={cn(stBtn.dark, "h-8 text-xs")}>{busy && <Loader2 size={12} className="animate-spin" />}Mark as waiting</button>
        <button type="button" onClick={() => setOpen(false)} className="h-8 px-2 text-xs text-[var(--st-muted)]">Cancel</button>
      </div>
    </form>
  );
}
