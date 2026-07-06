"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, CheckCircle2, Inbox as InboxIcon, Wand2 } from "lucide-react";
import { SortingDesk } from "@/components/sorting-desk";
import { InboxList } from "@/app/inbox/inbox-list";
import { RescanDocumentsButton } from "@/components/rescan-documents-button";
import { FindDuplicatesButton } from "@/components/find-duplicates-button";
import { SmartAdd } from "@/components/smart-add";
import { IntakeAccuracy } from "@/components/intake-accuracy";
import { useToast } from "@/components/toast";
import { autoSortReadyAction } from "@/app/documents/actions";
import { autoSortInboxAction, type InboxItem, type AutoSortSummary } from "@/app/inbox/actions";
import type { SortItem } from "@/lib/sorting-desk";
import type { IntakeMetrics } from "@/lib/intake-metrics";

export function ToSortPanel({
  sortItems,
  inboxItems,
  companies,
  people,
  intakeMetrics,
}: {
  sortItems: SortItem[];
  inboxItems: InboxItem[];
  companies: Array<{ id: number; name: string; aliases?: string[] }>;
  people: Array<{ id: number; name: string }>;
  intakeMetrics: IntakeMetrics | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sorting, startSort] = useTransition();
  const [autoFiling, startAutoFile] = useTransition();
  const [summary, setSummary] = useState<AutoSortSummary | null>(null);

  const readyCount = sortItems.filter((i) => i.group === "place" && (i.companyId || i.personId)).length;

  function sortNow() {
    setSummary(null);
    startSort(async () => {
      const res = await autoSortInboxAction();
      setSummary(res);
      router.refresh();
    });
  }

  function autoSort() {
    startAutoFile(async () => {
      const res = await autoSortReadyAction();
      if (res.ok) toast(res.filed ? `Filed ${res.filed} ready ${res.filed === 1 ? "document" : "documents"}.` : "Nothing was ready to file automatically.", { tone: "success" });
      else toast(res.error ?? "Couldn't auto-sort.", { tone: "warn" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* The To Sort action row — everything you do here, in one place. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={sortNow}
          disabled={sorting}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3.5 text-xs font-semibold text-fg transition-colors hover:bg-bg-muted disabled:opacity-50"
        >
          {sorting ? <Loader2 size={14} className="animate-spin text-accent" /> : <Sparkles size={14} className="text-accent" />} New files
        </button>
        <SmartAdd companies={companies} people={people} />
        {readyCount > 0 && (
          <button
            type="button"
            onClick={autoSort}
            disabled={autoFiling}
            title="File every ready-to-confirm document at once, using the guessed owner and category"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-3.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
          >
            {autoFiling ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Auto Sort <span className="tabular opacity-70">{readyCount}</span>
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <RescanDocumentsButton />
          <FindDuplicatesButton />
        </div>
      </div>

      {summary && (
        <div className={`glass flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs ${summary.ok ? "" : "ring-1 ring-danger/30"}`}>
          <CheckCircle2 size={14} className={summary.ok ? "text-success" : "text-danger"} />
          {summary.ok ? (
            summary.bundles === 0 && summary.filed + summary.quarantined + summary.trashed === 0 ? (
              <span className="text-fg-muted">Nothing new to read in.</span>
            ) : (
              <span className="text-fg-muted">
                Read in <b className="text-fg">{summary.quarantined + summary.filed}</b> to confirm
                {summary.trashed > 0 && <> · <b className="text-fg">{summary.trashed}</b> to trash</>}
                {summary.failed > 0 && <> · <b className="text-warn">{summary.failed}</b> couldn&apos;t be read</>}
              </span>
            )
          ) : (
            <span className="text-danger">{summary.error}</span>
          )}
        </div>
      )}

      {/* Slim intake-accuracy readout — glanceable, right under the actions. */}
      {intakeMetrics && <IntakeAccuracy metrics={intakeMetrics} />}

      {/* The worklist — confirm each document's guessed owner/category/expiry. */}
      <SortingDesk items={sortItems} companies={companies} people={people} />

      {/* Raw bundles (pasted text + files) not yet read in. */}
      {inboxItems.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-fg-muted">
            <InboxIcon size={14} /> Not read yet · {inboxItems.length}
          </div>
          <InboxList items={inboxItems} companies={companies} people={people} />
        </section>
      )}
    </div>
  );
}
