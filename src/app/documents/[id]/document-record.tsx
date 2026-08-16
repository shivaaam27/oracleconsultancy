"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Pencil } from "lucide-react";
import { RecordPage, RecordSidebarBlock, type RecordSection } from "@/components/record-page";
import { Badge, ButtonLink } from "@/components/ui";
import { taskHref } from "@/lib/task-href";
import { cn } from "@/lib/cn";

type D = {
  id: number;
  title: string;
  category: string | null;
  docType: string | null;
  issuer: string | null;
  referenceNo: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  reminderLeadDays: number;
  notes: string | null;
  archived: boolean;
  fileName: string | null;
  companyId: number | null;
  companyName: string | null;
  personId: number | null;
  personName: string | null;
  vendorId: number | null;
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

function V({ children }: { children: ReactNode }) {
  return children ? <>{children}</> : <span className="text-fg-subtle">—</span>;
}

const STATUS_TONE: Record<string, "danger" | "warn" | "success" | "default"> = {
  Expired: "danger",
  Expiring: "warn",
  Valid: "success",
};

export function DocumentRecord({
  doc,
  status,
  expiry,
  fileUrl,
  tasks,
}: {
  doc: D;
  status: string;
  expiry: string | null;
  fileUrl: string | null;
  tasks: Array<{ code: string; status: string; title: string }>;
}) {
  const [tab, setTab] = useState("overview");

  const sections: RecordSection[] = [
    {
      id: "detail",
      title: "Detail",
      fields: [
        { label: "Category", value: <V>{doc.category}</V> },
        { label: "Type", value: <V>{doc.docType}</V> },
        { label: "Issued by", value: <V>{doc.issuer}</V> },
        { label: "Reference no.", value: <V>{doc.referenceNo}</V> },
        { label: "Issued on", value: <V>{fmt(doc.issueDate)}</V> },
        {
          label: "Expires",
          value: (
            <V>
              {doc.expiryDate ? (
                <span className={cn(status === "Expired" && "font-medium text-danger", status === "Expiring" && "text-warn")}>
                  {fmt(doc.expiryDate)}
                  {expiry && <span className="ml-1 text-[11px] text-fg-subtle">({expiry})</span>}
                </span>
              ) : null}
            </V>
          ),
        },
      ],
    },
    {
      id: "filed",
      title: "Filed under",
      fields: [
        {
          label: "Company",
          value: (
            <V>
              {doc.companyName && doc.companyId ? (
                <Link href={`/companies/${doc.companyId}`} className="text-accent hover:underline">
                  {doc.companyName}
                </Link>
              ) : (
                doc.companyName
              )}
            </V>
          ),
        },
        {
          label: "Person",
          value: (
            <V>
              {doc.personName && doc.personId ? (
                <Link href={`/people/${doc.personId}`} className="text-accent hover:underline">
                  {doc.personName}
                </Link>
              ) : (
                doc.personName
              )}
            </V>
          ),
        },
        {
          label: "Vendor",
          value: (
            <V>
              {doc.vendorId ? (
                <Link href={`/hrms/vendors/${doc.vendorId}`} className="text-accent hover:underline">
                  View vendor
                </Link>
              ) : null}
            </V>
          ),
        },
        { label: "File", value: <V>{doc.fileName}</V> },
        {
          label: "Notes",
          value: <V>{doc.notes ? <span className="whitespace-pre-wrap">{doc.notes}</span> : null}</V>,
          full: true,
        },
      ],
    },
  ];

  const sidebar = (
    <>
      <RecordSidebarBlock title="Renewal">
        {doc.expiryDate ? (
          <>
            <p className={cn("text-[13px]", status === "Expired" ? "text-danger" : status === "Expiring" ? "text-warn" : "")}>
              {expiry ?? status}
            </p>
            <p className="text-[11px] text-fg-subtle">Reminds {doc.reminderLeadDays} days before.</p>
          </>
        ) : (
          <p className="text-[12px] text-fg-muted">No expiry date — nothing to chase.</p>
        )}
      </RecordSidebarBlock>

      <RecordSidebarBlock title="Manage">
        <p className="text-[12px] text-fg-muted">Editing, archiving and replacing the file happen in the library.</p>
        <Link href={`/documents?doc=${doc.id}`} className="text-[12px] text-accent hover:underline">
          Open the editor
        </Link>
      </RecordSidebarBlock>
    </>
  );

  return (
    <RecordPage
      title={doc.title}
      subtitle={[doc.docType, doc.companyName ?? doc.personName].filter(Boolean).join(" · ") || undefined}
      status={
        doc.archived ? (
          <Badge tone="default">Archived</Badge>
        ) : (
          <Badge tone={STATUS_TONE[status] ?? "default"}>{status}</Badge>
        )
      }
      actions={
        <>
          {fileUrl && (
            <ButtonLink href={fileUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">
              <ExternalLink size={13} /> Open file
            </ButtonLink>
          )}
          {/* The editor is a dialog owned by the library workspace, which only
              exists on /documents — dispatching its event from here would have
              done nothing. `?doc=<id>` is the deep link it already understands. */}
          <ButtonLink href={`/documents?doc=${doc.id}`} size="sm">
            <Pencil size={13} /> Edit
          </ButtonLink>
        </>
      }
      tabs={[
        { id: "overview", label: "Overview" },
        { id: "tasks", label: "Tasks", count: tasks.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      sections={tab === "overview" ? sections : undefined}
      sidebar={tab === "overview" ? sidebar : undefined}
    >
      {tab === "tasks" && (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elev">
          {tasks.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-fg-muted">No tasks raised against this document.</p>
          ) : (
            <ul>
              {tasks.map((t) => (
                <li key={t.code} className="border-b border-border last:border-0">
                  <Link href={taskHref(t.code)} data-list-row className="group flex items-center gap-2 px-3 hover:bg-bg-subtle">
                    <span className="shrink-0 text-[11px] tabular text-fg-subtle">{t.code}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] group-hover:text-accent">{t.title}</span>
                    <span className="shrink-0 text-[11px] text-fg-muted">{t.status}</span>
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
