"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Plane } from "lucide-react";
import { Panel } from "./surface-kit";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { portalDecideLeave } from "@/app/portal/actions";

export type TeamLeaveRequest = {
  id: number;
  personName: string;
  typeName: string;
  color: string | null;
  startLabel: string;
  days: number;
  halfDay: boolean;
  reason: string | null;
};

/** Manager view: pending leave from direct reports, with Approve / Reject. */
export function PortalTeamLeave({ requests }: { requests: TeamLeaveRequest[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function decide(id: number, status: "Approved" | "Rejected") {
    setBusyId(id);
    startTransition(async () => {
      const res = await portalDecideLeave(id, status);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(status === "Approved" ? "Leave approved." : "Leave rejected.", { tone: "success" });
      router.refresh();
    });
  }

  if (requests.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {requests.map((r) => {
        const busy = busyId === r.id;
        return (
          <Panel key={r.id} className={cn("flex items-center gap-3 p-3.5", busy && "opacity-60")}>
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info-soft/60 text-info ring-1 ring-info/20">
              <Plane size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{r.personName}</p>
              <p className="text-xs text-fg-muted truncate">
                {r.typeName} · {r.startLabel} · {r.halfDay ? "½ day" : `${r.days} day${r.days === 1 ? "" : "s"}`}
                {r.reason ? ` · “${r.reason}”` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" disabled={busy} onClick={() => decide(r.id, "Approved")}
                className="inline-flex items-center gap-1 rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-medium text-success ring-1 ring-success/25 hover:bg-success-soft/80 disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
              </button>
              <button type="button" disabled={busy} onClick={() => decide(r.id, "Rejected")}
                className="inline-flex items-center gap-1 rounded-lg bg-bg-elev px-2.5 py-1.5 text-xs font-medium text-fg-muted ring-1 ring-border hover:text-danger disabled:opacity-50">
                <X size={13} /> Reject
              </button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
