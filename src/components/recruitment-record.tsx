"use client";

// ─────────────────────────────────────────────────────────────────────────────
// One record on the recruitment desk — client, candidate or job order.
//
// The record IS the form, which is how ERPNext does it: no read view with an
// Edit button beside it, because that is two screens of the same thing and one
// of them is always the stale one. `RecordPage` supplies the header, the tabs
// and the shell; the body is the same form the list creates with.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, RotateCcw } from "lucide-react";
import { RecordPage } from "./record-page";
import { RecruitmentForm, type FormValues } from "./recruitment-form";
import type { FormGroup } from "@/lib/recruitment-fields";

export function RecruitmentRecord({
  title,
  subtitle,
  code,
  status,
  backHref,
  backLabel,
  groups,
  values,
  dynamicOptions,
  onSave,
  onArchive,
  archived,
  sidebar,
  banner,
  extraTabs,
}: {
  title: string;
  subtitle?: ReactNode;
  code?: string;
  status?: ReactNode;
  backHref: string;
  backLabel: string;
  groups: FormGroup[];
  values: FormValues;
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
  onSave: (v: FormValues) => Promise<{ ok: boolean; error?: string }>;
  onArchive: (archived: boolean) => Promise<{ ok: boolean; error?: string }>;
  archived: boolean;
  /** The right-hand column: the fee, the papers, whatever this record needs. */
  sidebar?: ReactNode;
  /** Above everything — used when something needs saying before it is read. */
  banner?: ReactNode;
  /**
   * Tabs beyond the form. The form is always the first one ("Brief"), because a
   * record you cannot correct is a record you stop trusting.
   *
   * ⚠️ The tab lives in component state, NOT the URL. Everything on these tabs is
   * an action taken in place — booking an interview, writing down a check-in —
   * and each one refreshes the route; a tab held in the address bar would be
   * fine, but a tab held in state survives that refresh without a navigation.
   */
  extraTabs?: { id: string; label: string; count?: number; content: ReactNode }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("brief");
  const tabs = extraTabs?.length
    ? [{ id: "brief", label: "Brief" }, ...extraTabs.map((t) => ({ id: t.id, label: t.label, count: t.count }))]
    : undefined;
  const active = extraTabs?.find((t) => t.id === tab);

  return (
    <div className="space-y-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={13} /> {backLabel}
      </Link>

      {banner}

      <RecordPage
        title={title}
        subtitle={subtitle}
        code={code}
        status={status}
        sidebar={sidebar}
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
        actions={
          <button
            type="button"
            onClick={async () => { await onArchive(!archived); router.refresh(); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-muted"
          >
            {archived ? <><RotateCcw size={13} /> Restore</> : <><Archive size={13} /> Archive</>}
          </button>
        }
        /* ⚠️ `main`, not `children`. Children render FULL WIDTH UNDER the body,
           which put the whole form below the sidebar and left the top half of a
           wide screen blank. This belongs beside the sidebar. */
        main={
          active ? active.content : (
            <RecruitmentForm
              groups={groups}
              initial={values}
              submitLabel="Save changes"
              dynamicOptions={dynamicOptions}
              onSubmit={async (v) => {
                const res = await onSave(v);
                if (res.ok) router.refresh();
                return res;
              }}
            />
          )
        }
      />
    </div>
  );
}
