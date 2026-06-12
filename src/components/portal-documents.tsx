"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, Clock, FileWarning } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "./toast";
import { REQUIREMENT_STATUS_LABELS, REQUIREMENT_STATUS_TONE, type EffectiveStatus } from "@/lib/requirements-shared";
import { portalUploadRequirementDocument } from "@/app/portal/actions";

export type PortalChecklistItem = {
  id: number;
  label: string;
  mandatory: boolean;
  effectiveStatus: EffectiveStatus;
  documentTitle: string | null;
  expiryLabel: string | null;
};

// Statuses where the staff member can help by uploading a (new) file.
const NEEDS_UPLOAD = new Set<EffectiveStatus>(["missing", "requested", "expired", "expiring"]);

const toneClass: Record<string, string> = {
  success: "bg-success-soft text-success",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  default: "bg-bg-muted text-fg-muted",
};

export function PortalDocuments({ items, score }: { items: PortalChecklistItem[]; score: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  function onPick(requirementId: number, file: File | null) {
    if (!file) return;
    setBusyId(requirementId);
    const fd = new FormData();
    fd.set("requirementId", String(requirementId));
    fd.set("file", file);
    startTransition(async () => {
      const res = await portalUploadRequirementDocument(fd);
      setBusyId(null);
      if (inputs.current[requirementId]) inputs.current[requirementId]!.value = "";
      if (!res.ok) {
        toast(res.error, { tone: "danger" });
        return;
      }
      toast("Uploaded — your administrator will review it.", { tone: "success" });
      router.refresh();
    });
  }

  const needs = items.filter((it) => NEEDS_UPLOAD.has(it.effectiveStatus));
  const onFile = items.filter((it) => !NEEDS_UPLOAD.has(it.effectiveStatus));

  function Row({ item }: { item: PortalChecklistItem }) {
    const tone = REQUIREMENT_STATUS_TONE[item.effectiveStatus];
    const busy = busyId === item.id;
    const canUpload = NEEDS_UPLOAD.has(item.effectiveStatus);
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {item.label}
            {!item.mandatory && <span className="ml-1.5 text-[11px] font-normal text-fg-subtle">(optional)</span>}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-fg-subtle">
            {item.documentTitle
              ? [item.documentTitle, item.expiryLabel].filter(Boolean).join(" · ")
              : canUpload
              ? "Please upload this document"
              : "On file"}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", toneClass[tone] ?? toneClass.default)}>
          {REQUIREMENT_STATUS_LABELS[item.effectiveStatus]}
        </span>
        {canUpload && (
          <>
            <input
              ref={(el) => { inputs.current[item.id] = el; }}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
              className="hidden"
              onChange={(e) => onPick(item.id, e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputs.current[item.id]?.click()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {item.effectiveStatus === "expired" || item.effectiveStatus === "expiring" ? "Renew" : "Upload"}
            </button>
          </>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-elev px-4 py-6 text-center text-sm text-fg-muted ring-1 ring-border">
        No documents are required from you right now.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 rounded-2xl bg-bg-elev px-4 py-3 ring-1 ring-border">
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1",
            score >= 100 ? "bg-success-soft text-success ring-success/20" : score >= 60 ? "bg-warn-soft text-warn ring-warn/20" : "bg-danger-soft text-danger ring-danger/20"
          )}
        >
          {score >= 100 ? <CheckCircle2 size={18} /> : needs.length ? <FileWarning size={18} /> : <Clock size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{score}% complete</div>
          <div className="text-[11px] text-fg-muted">
            {needs.length === 0 ? "Everything we need is on file — thank you." : `${needs.length} document${needs.length === 1 ? "" : "s"} still needed from you.`}
          </div>
        </div>
      </div>

      {needs.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border">
          <div className="border-b border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            Needed from you
          </div>
          <div className="divide-y divide-border/50">{needs.map((it) => <Row key={it.id} item={it} />)}</div>
        </div>
      )}

      {onFile.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border">
          <div className="border-b border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            On file
          </div>
          <div className="divide-y divide-border/50">{onFile.map((it) => <Row key={it.id} item={it} />)}</div>
        </div>
      )}
    </div>
  );
}
