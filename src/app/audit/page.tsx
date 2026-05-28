import { sb } from "@/db/supabase";
import { PageHeader } from "@/components/ui";
import { ResyncLatestUpdateButton } from "./resync-button";
import { AuditTable } from "@/components/audit-table";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Sp = {
  /** "30" | "7" | "all" — defaults to 30 */
  range?: string;
  /** "1" to include soft-deleted rows */
  deleted?: string;
};

type AuditRow = {
  id: number;
  task_code: string | null;
  company_id: number | null;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  change_reason: string | null;
  entry_type: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
};

function parseRange(v: string | undefined): 7 | 30 | "all" {
  if (v === "7") return 7;
  if (v === "all") return "all";
  return 30;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Sp>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const showDeleted = sp.deleted === "1";

  // Build the query
  let q = sb
    .from("audit_log")
    .select(
      "id,task_code,company_id,field,old_value,new_value,change_reason,entry_type,created_at,created_by,deleted_at"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (!showDeleted) q = q.is("deleted_at", null);

  if (range !== "all") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range);
    q = q.gte("created_at", cutoff.toISOString());
  }

  const [{ data: rowsRaw }, { data: companiesRaw }] = await Promise.all([
    q,
    sb.from("companies").select("id,name"),
  ]);
  const rows = (rowsRaw ?? []) as AuditRow[];
  const cMap = new Map((companiesRaw ?? []).map((c) => [c.id as number, c.name as string]));

  const deletedInWindow = rows.filter((r) => r.deleted_at).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        sub={`${rows.length} entries · ${range === "all" ? "all time" : `last ${range} days`}${showDeleted ? ` (incl. ${deletedInWindow} deleted)` : ""}`}
        action={<ResyncLatestUpdateButton />}
      />

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-fg-muted">Range:</span>
        {[
          { key: "7", label: "Last 7 days" },
          { key: "30", label: "Last 30 days" },
          { key: "all", label: "All time" },
        ].map(({ key, label }) => {
          const active = (key === "30" && !sp.range) || sp.range === key;
          const params = new URLSearchParams();
          if (key !== "30") params.set("range", key);
          if (showDeleted) params.set("deleted", "1");
          const href = params.toString() ? `/audit?${params.toString()}` : "/audit";
          return (
            <Link
              key={key}
              href={href}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-fg font-medium"
                  : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted"
              }`}
            >
              {label}
            </Link>
          );
        })}

        <span className="mx-2 text-fg-subtle">·</span>

        <Link
          href={(() => {
            const params = new URLSearchParams();
            if (sp.range && sp.range !== "30") params.set("range", sp.range);
            if (!showDeleted) params.set("deleted", "1");
            return params.toString() ? `/audit?${params.toString()}` : "/audit";
          })()}
          className={`px-2.5 py-1 rounded-full border transition-colors ${
            showDeleted
              ? "border-warn/40 bg-warn/10 text-warn font-medium"
              : "border-border text-fg-muted hover:text-fg hover:bg-bg-muted"
          }`}
        >
          {showDeleted ? "✓ Showing deleted" : "Show deleted"}
        </Link>
      </div>

      <AuditTable rows={rows} cMap={Object.fromEntries(cMap)} showDeleted={showDeleted} />
    </div>
  );
}
