import { KeyRound } from "lucide-react";
import type { KeyDocumentRow } from "@/lib/company-profile";
import type { DocStatus } from "@/lib/documents-shared";

const STATUS_BADGE: Record<DocStatus, string> = {
  Valid: "bg-success-soft text-success",
  Expiring: "bg-warn-soft text-warn",
  Expired: "bg-danger-soft text-danger",
  "No expiry": "bg-bg-muted text-fg-muted",
  Archived: "bg-bg-muted text-fg-subtle",
};

/**
 * Read-only "Key documents" panel — derived live from the company's filed
 * documents (+ typed profile numbers). Surfaces each headline number and its
 * expiry so compliance info is readable at a glance, even with no dedicated
 * field. Auto-fills itself the moment a matching document is added.
 */
export function CompanyKeyDocuments({ rows }: { rows: KeyDocumentRow[] }) {
  return (
    <section className="glass elevated rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <KeyRound size={15} className="text-accent" />
        <h2 className="text-sm font-semibold">Key documents</h2>
        <span className="text-[11px] text-fg-subtle">pulled from filed documents</span>
      </div>
      <ul className="divide-y divide-border/50">
        {rows.map((r) => {
          const onFile = r.documentId != null;
          return (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  {r.value
                    ? `${r.value}${r.documentTitle ? ` · ${r.documentTitle}` : ""}${r.expiryLabel ? ` · ${r.expiryLabel}` : ""}`
                    : onFile
                    ? [r.documentTitle, r.expiryLabel].filter(Boolean).join(" · ")
                    : "Not on file"}
                </span>
              </span>
              {r.status ? (
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[r.status]}`}>
                  {r.status}
                </span>
              ) : r.value ? (
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-bg-muted text-fg-muted">
                  Recorded
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-fg-subtle">—</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
