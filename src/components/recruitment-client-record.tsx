"use client";

// One recruitment client. A thin client wrapper: it holds the server actions,
// because a server component cannot hand a plain closure to a client one.

import { AlertTriangle } from "lucide-react";
import { RecruitmentRecord } from "./recruitment-record";
import { CLIENT_FORM } from "@/lib/recruitment-fields";
import { toClientPatch, clientFormValues, type ClientRow } from "./recruitment-clients-list";
import { updateClientAction, archiveClientAction, deleteClientAction } from "@/app/recruitment/actions";
import { DangerZone } from "./recruitment-danger-zone";
import { clientPapersMissing, fmtDate } from "@/lib/recruitment-shared";

export type ClientRecordData = ClientRow & {
  contactEmail: string | null;
  contactPhone: string | null;
  localEmployees: number | null;
  foreignEmployees: number | null;
  notes: string | null;
  archived: boolean;
};

export function RecruitmentClientRecord({ client }: { client: ClientRecordData }) {
  const missing = clientPapersMissing(client);

  return (
    <RecruitmentRecord
      title={client.name}
      subtitle={[client.sector, client.city].filter(Boolean).join(" · ") || undefined}
      status={client.archived ? "Archived" : undefined}
      backHref="/recruitment/clients"
      backLabel="All clients"
      groups={CLIENT_FORM}
      values={clientFormValues(client)}
      archived={client.archived}
      onSave={(v) => updateClientAction(client.id, toClientPatch(v))}
      onArchive={(a) => archiveClientAction(client.id, a)}
      banner={
        missing.length > 0 ? (
          /* The profile's own words: "We do not begin sourcing before it is
             signed." So it is said at the top of the record, not buried in a
             date field halfway down. */
          <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft/50 px-3 py-2 text-[12px] text-fg">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            <span>
              <strong>{missing.join(" and ")}</strong> {missing.length === 1 ? "is" : "are"} not signed.
              Sourcing does not start until the Terms of Business is, and candidate details
              cannot lawfully be shared without the Data Sharing Agreement.
            </span>
          </p>
        ) : null
      }
      sidebar={
        <div className="space-y-3">
          <Panel title="Papers">
            <Row label="Terms of Business" value={fmtDate(client.termsSignedOn) ?? "Not signed"} bad={!client.termsSignedOn} />
            <Row label="Data Sharing Agreement" value={fmtDate(client.dsaSignedOn) ?? "Not signed"} bad={!client.dsaSignedOn} />
          </Panel>
          <Panel title="Roles">
            <Row label="Open roles" value={String(client.openOrders)} />
          </Panel>
          <DangerZone
            what="client"
            name={client.name}
            onDelete={() => deleteClientAction(client.id)}
            backHref="/recruitment/clients"
          />
        </div>
      }
    />
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <div className="border-b border-border bg-bg-subtle px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{title}</span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-fg-subtle">{label}</span>
      <span className={bad ? "text-[12px] font-medium text-warn" : "text-[12px] tabular"}>{value}</span>
    </div>
  );
}
