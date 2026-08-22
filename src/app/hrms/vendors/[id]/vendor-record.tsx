"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FilePlus } from "lucide-react";
import { RecordPage, RecordSidebarBlock, type RecordSection } from "@/components/record-page";
import { Badge, ButtonLink } from "@/components/ui";
import type { VendorRow } from "@/lib/vendors-shared";
import { cn } from "@/lib/cn";

type VendorDoc = { id: number; title: string; category: string | null; status: string; expiryLabel: string | null };

function V({ children }: { children: ReactNode }) {
  return children ? <>{children}</> : <span className="text-fg-subtle">—</span>;
}

export function VendorRecord({
  vendor,
  documents,
  assetCount,
}: {
  vendor: VendorRow;
  documents: VendorDoc[];
  assetCount: number;
}) {
  const [tab, setTab] = useState("overview");

  const sections: RecordSection[] = [
    {
      id: "detail",
      title: "Detail",
      fields: [
        { label: "Category", value: <V>{vendor.category}</V> },
        {
          label: "Company",
          value: (
            <V>
              {vendor.companyName && vendor.companyId ? (
                <Link href={`/companies/${vendor.companyId}`} className="text-accent hover:underline">
                  {vendor.companyName}
                </Link>
              ) : (
                vendor.companyName
              )}
            </V>
          ),
        },
        { label: "Location", value: <V>{vendor.location}</V> },
        { label: "Status", value: <V>{vendor.active ? "Active" : "Archived"}</V> },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      fields: [
        { label: "Contact name", value: <V>{vendor.contactName}</V> },
        { label: "Email", value: <V>{vendor.email}</V> },
        { label: "Phone", value: <V>{vendor.phone}</V> },
      ],
    },
    {
      id: "notes",
      title: "Notes",
      collapsible: true,
      defaultOpen: false,
      fields: [
        {
          label: "Notes",
          value: <V>{vendor.notes ? <span className="whitespace-pre-wrap">{vendor.notes}</span> : null}</V>,
          full: true,
        },
      ],
    },
  ];

  const sidebar = (
    <>
      <RecordSidebarBlock title="At a glance">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Contracts", value: vendor.docCount, tone: "" },
            { label: "Expired", value: vendor.expiredCount, tone: vendor.expiredCount > 0 ? "text-danger" : "" },
            { label: "Expiring", value: vendor.expiringCount, tone: vendor.expiringCount > 0 ? "text-warn" : "" },
            { label: "Assets", value: assetCount, tone: "" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-bg-subtle/50 px-2.5 py-2">
              <span className={cn("block text-lg font-semibold leading-none tabular", s.tone)}>{s.value}</span>
              <span className="mt-1 block text-xs text-fg-subtle">{s.label}</span>
            </div>
          ))}
        </div>
      </RecordSidebarBlock>

      <RecordSidebarBlock title="Manage">
        <p className="text-sm text-fg-muted">Editing and archiving happen on the vendor register.</p>
        <Link href="/hrms/assets?view=vendors" className="text-sm text-accent hover:underline">
          Open the register
        </Link>
      </RecordSidebarBlock>
    </>
  );

  return (
    <RecordPage
      title={vendor.name}
      subtitle={[vendor.category, vendor.location].filter(Boolean).join(" · ") || undefined}
      status={vendor.active ? <Badge tone="success">Active</Badge> : <Badge tone="default">Archived</Badge>}
      actions={
        <ButtonLink href={`/documents?newdoc=1&vendor=${vendor.id}&category=Contract`} variant="secondary" size="sm">
          <FilePlus size={13} /> Add contract
        </ButtonLink>
      }
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "contracts", label: "Contracts", count: documents.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      sections={tab === "overview" ? sections : undefined}
      sidebar={tab === "overview" ? sidebar : undefined}
    >
      {tab === "contracts" && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          {documents.length === 0 ? (
            <p className="px-3 py-8 text-center text-base text-fg-muted">No contracts filed against this vendor.</p>
          ) : (
            <ul>
              {documents.map((d) => (
                <li key={d.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/documents?q=${encodeURIComponent(d.title)}`}
                    data-list-row
                    className="group flex items-center gap-2 px-3 hover:bg-bg-subtle"
                  >
                    <span className="min-w-0 flex-1 truncate text-base group-hover:text-accent">{d.title}</span>
                    <span className="shrink-0 text-xs text-fg-muted">{d.category}</span>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        d.status === "Expired" ? "font-medium text-danger" : d.status === "Expiring" ? "text-warn" : "text-fg-subtle"
                      )}
                    >
                      {d.expiryLabel ?? d.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </RecordPage>
  );
}
