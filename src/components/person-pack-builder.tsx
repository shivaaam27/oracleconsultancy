"use client";

// Person pack — pick what the pack is FOR, then open it. The old builder also
// let you tick off individual compliance gaps; that half went with the
// required-document engine (Aug 2026), so this is now purpose + open.

import { useState } from "react";
import { ArrowLeft, PackageCheck, ExternalLink } from "lucide-react";
import { PERSON_PACK_PURPOSES, type PersonPackPurpose } from "@/lib/person-pack-shared";
import { cn } from "@/lib/cn";

const PURPOSE_LABEL: Record<PersonPackPurpose, string> = {
  "document-request": "Request documents",
  "expat-onboarding": "Expat onboarding",
  "visa-permit": "Visa / permit",
  "work-permit-renewal": "Work-permit renewal",
  recruitment: "Recruitment",
  "contract-signing": "Contract signing",
  "task-reminder": "Task reminder",
  custom: "Custom",
};

export function PersonPackPanel({
  personId,
  personName,
  initialPurpose,
  onBack,
  studio = false,
}: {
  /** Inside the Studio person page's pop-up: no Back link (the pop-up closes itself). */
  studio?: boolean;
  personId: number;
  personName: string;
  initialPurpose?: PersonPackPurpose;
  onBack?: () => void;
}) {
  const [purpose, setPurpose] = useState<PersonPackPurpose>(initialPurpose ?? "document-request");

  return (
    <div className="space-y-3">
      {onBack && !studio && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft size={13} /> Back
        </button>
      )}

      <div>
        <div className={studio ? "text-xs text-[var(--st-label)]" : "text-xs font-medium uppercase tracking-wider text-fg-muted"}>What is this pack for?</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PERSON_PACK_PURPOSES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPurpose(p)}
              className={studio
                ? cn("h-8 rounded-[9px] border px-3 text-xs transition-colors",
                    purpose === p ? "border-[var(--st-ink)] bg-[var(--st-ink)] text-[var(--st-surface)]" : "border-[var(--st-line)] hover:bg-[var(--st-page)]")
                : cn(
                "rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors",
                purpose === p
                  ? "bg-accent text-accent-fg ring-accent"
                  : "bg-bg-subtle/60 text-fg-muted ring-border/60 hover:text-fg",
              )}
            >
              {PURPOSE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <a
        href={`/people/${personId}/pack?purpose=${purpose}`}
        target="_blank"
        rel="noreferrer"
        className={studio
          ? "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--st-ink)] px-3 text-[13px] font-semibold text-[var(--st-surface)] transition-opacity hover:opacity-90"
          : "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"}
      >
        <PackageCheck size={14} /> Open {personName}&apos;s pack <ExternalLink size={13} />
      </a>
    </div>
  );
}
