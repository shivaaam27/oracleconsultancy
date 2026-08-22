"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { personDeleteImpact, deletePersonForever, type PersonDeleteImpact } from "@/app/people/actions";

/**
 * Permanently delete a person.
 *
 * Deactivating is the normal answer and keeps everything; this is for the case
 * it cannot solve — a duplicate, a typo, a test row. Because it cannot be
 * undone, the dialog does three things before it will run:
 *   1. counts what is attached and says so in plain words,
 *   2. spells out what survives and what is destroyed,
 *   3. requires the person's exact name to be typed.
 */
export function DeletePersonDialog({ personId, personName }: { personId: number; personName: string }) {
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<PersonDeleteImpact | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) { setTyped(""); setImpact(null); return; }
    let cancelled = false;
    personDeleteImpact(personId).then((i) => { if (!cancelled) setImpact(i); });
    return () => { cancelled = true; };
  }, [open, personId]);

  const nameMatches = typed.trim().toLowerCase() === personName.trim().toLowerCase();

  function run() {
    start(async () => {
      const res = await deletePersonForever(personId, typed);
      if (!res.ok) return toast(res.error, { tone: "danger", duration: 5000 });
      toast(`${personName} deleted for good.`, { tone: "success" });
      setOpen(false);
      router.push("/people");
    });
  }

  /** "3 tasks, 2 documents" — only the things that actually exist. */
  const survives = impact
    ? [
        impact.ownedTasks > 0 && `${impact.ownedTasks} task${impact.ownedTasks === 1 ? "" : "s"} they own (left with no owner)`,
        impact.documents > 0 && `${impact.documents} document${impact.documents === 1 ? "" : "s"} (kept, but no longer filed under anyone)`,
        impact.assets > 0 && `${impact.assets} asset${impact.assets === 1 ? "" : "s"} (released back to the store)`,
        impact.reports > 0 && `${impact.reports} direct report${impact.reports === 1 ? "" : "s"} (left with no manager)`,
        impact.departmentsHeaded > 0 && `${impact.departmentsHeaded} department${impact.departmentsHeaded === 1 ? "" : "s"} they head (left without a head)`,
      ].filter(Boolean)
    : [];

  const destroyed = impact
    ? [
        impact.assignedTasks > 0 && `their assignment to ${impact.assignedTasks} task${impact.assignedTasks === 1 ? "" : "s"}`,
        impact.history > 0 && `${impact.history} history record${impact.history === 1 ? "" : "s"} — their audit trail, attendance and leave`,
        "their portal login, passkeys and chat mentions",
      ].filter(Boolean)
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-fg-subtle transition-colors hover:text-danger"
      >
        <Trash2 size={12} /> Delete permanently
      </button>

      <HrmsDialog open={open} onOpenChange={setOpen} width={520} title={`Delete ${personName}?`}>
        <div className="space-y-3.5">
          <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2.5 text-base text-danger">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              <b className="font-semibold">This cannot be undone.</b> If you only want them out of the way,
              close this and use <b>Deactivate</b> instead — that keeps the whole record.
            </span>
          </p>

          {!impact ? (
            <p className="text-base text-fg-muted">Checking what they&apos;re attached to…</p>
          ) : (
            <>
              {survives.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Kept, but detached</p>
                  <ul className="mt-1 space-y-0.5 text-base text-fg-muted">
                    {survives.map((s) => <li key={String(s)}>· {s}</li>)}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Destroyed</p>
                <ul className="mt-1 space-y-0.5 text-base text-fg-muted">
                  {destroyed.map((s) => <li key={String(s)}>· {s}</li>)}
                </ul>
              </div>

              <div>
                <label className="text-base text-fg">
                  Type <b className="font-semibold">{personName}</b> to confirm
                </label>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  placeholder={personName}
                  className="mt-1 w-full px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={run}
              disabled={!nameMatches || pending}
              loading={pending}
            >
              <Trash2 size={13} /> Delete for good
            </Button>
          </div>
        </div>
      </HrmsDialog>
    </>
  );
}
