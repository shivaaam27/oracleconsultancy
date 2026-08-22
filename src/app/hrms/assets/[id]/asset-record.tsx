"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RecordPage, RecordSidebarBlock, type RecordSection } from "@/components/record-page";
import { Badge } from "@/components/ui";
import { ASSET_STATUS_TONE, type AssetRow, type AssetHistoryRow } from "@/lib/assets-shared";

/* The asset record, on the shared RecordPage shell — same header, tabs, field
 * grid and right sidebar as a person or a task. */

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

const money = (n: number | null) => (n === null ? null : `TZS ${new Intl.NumberFormat("en-GB").format(n)}`);

function V({ children }: { children: ReactNode }) {
  return children ? <>{children}</> : <span className="text-fg-subtle">—</span>;
}

export function AssetRecord({
  asset,
  statusLabel,
  history,
}: {
  asset: AssetRow;
  statusLabel: string;
  history: AssetHistoryRow[];
}) {
  const [tab, setTab] = useState("overview");

  const holder = asset.assignedToName
    ? { label: "Assigned to", name: asset.assignedToName, id: asset.assignedToPersonId }
    : asset.assignedToCompanyName
      ? { label: "Shared with", name: asset.assignedToCompanyName, id: null }
      : null;

  const sections: RecordSection[] = [
    {
      id: "detail",
      title: "Detail",
      fields: [
        { label: "Category", value: <V>{asset.category}</V> },
        { label: "Status", value: <V>{statusLabel}</V> },
        { label: "Brand", value: <V>{asset.brand}</V> },
        { label: "Model", value: <V>{asset.model}</V> },
        { label: "Serial number", value: <V>{asset.serialNo}</V> },
        { label: "Asset tag", value: <V>{asset.tag}</V> },
      ],
    },
    {
      id: "where",
      title: "Where it is",
      fields: [
        {
          label: "Company",
          value: (
            <V>
              {asset.companyName && asset.companyId ? (
                <Link href={`/companies/${asset.companyId}`} className="text-accent hover:underline">
                  {asset.companyName}
                </Link>
              ) : (
                asset.companyName
              )}
            </V>
          ),
        },
        { label: "Department", value: <V>{asset.department}</V> },
        { label: "Location", value: <V>{asset.location}</V> },
        { label: "Custodian", value: <V>{asset.custodianName}</V> },
      ],
    },
    {
      id: "purchase",
      title: "Purchase",
      collapsible: true,
      defaultOpen: false,
      fields: [
        { label: "Supplier", value: <V>{asset.vendorName}</V> },
        { label: "Bought on", value: <V>{fmt(asset.purchaseDate)}</V> },
        { label: "Cost", value: <V>{money(asset.purchaseCost)}</V> },
        {
          label: "Notes",
          value: <V>{asset.notes ? <span className="whitespace-pre-wrap">{asset.notes}</span> : null}</V>,
          full: true,
        },
      ],
    },
  ];

  const sidebar = (
    <>
      <RecordSidebarBlock title="Held by">
        {holder ? (
          <>
            <p className="text-xs uppercase tracking-[0.04em] text-fg-subtle">{holder.label}</p>
            {holder.id ? (
              <Link href={`/people/${holder.id}`} className="text-base text-accent hover:underline">
                {holder.name}
              </Link>
            ) : (
              <p className="text-base">{holder.name}</p>
            )}
            {asset.assignedAt && <p className="text-xs text-fg-subtle">Since {fmt(asset.assignedAt)}</p>}
          </>
        ) : (
          <p className="text-sm text-fg-muted">In store — not assigned to anyone.</p>
        )}
      </RecordSidebarBlock>

      <RecordSidebarBlock title="Manage">
        <p className="text-sm text-fg-muted">
          Assigning, sharing and returning happen on the register, where you can act on several at once.
        </p>
        <Link href="/hrms/assets?view=assets" className="text-sm text-accent hover:underline">
          Open the register
        </Link>
      </RecordSidebarBlock>
    </>
  );

  return (
    <RecordPage
      title={asset.name}
      code={asset.tag ?? undefined}
      subtitle={[asset.category, asset.companyName].filter(Boolean).join(" · ") || undefined}
      status={<Badge tone={ASSET_STATUS_TONE[asset.status] ?? "default"}>{statusLabel}</Badge>}
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "history", label: "History", count: history.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      sections={tab === "overview" ? sections : undefined}
      sidebar={tab === "overview" ? sidebar : undefined}
    >
      {tab === "history" && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          {history.length === 0 ? (
            <p className="px-3 py-8 text-center text-base text-fg-muted">
              This asset has never been handed out.
            </p>
          ) : (
            <ul>
              {history.map((h) => (
                <li key={h.id} data-list-row className="flex items-center gap-2 border-b border-border px-3 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base">
                      {h.personId ? (
                        <Link href={`/people/${h.personId}`} className="hover:text-accent">
                          {h.personName ?? "Someone"}
                        </Link>
                      ) : (
                        (h.personName ?? "Someone")
                      )}
                    </span>
                    {h.notes && <span className="block truncate text-xs text-fg-subtle">{h.notes}</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular text-fg-muted">
                    {fmt(h.assignedAt)} → {h.returnedAt ? fmt(h.returnedAt) : "still has it"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </RecordPage>
  );
}
