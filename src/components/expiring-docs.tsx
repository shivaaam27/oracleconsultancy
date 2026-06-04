import Link from "next/link";
import { FileWarning, ChevronRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { docStatusColor, type DocStatus } from "@/lib/documents-shared";

export type ExpiringDocItem = {
  id: number;
  title: string;
  companyName: string | null;
  expiryLabel: string | null;
  status: DocStatus; // "Expired" | "Expiring"
  urgent: boolean; // true = already expired
};

/**
 * Overview card: documents that have expired or are within their reminder
 * window. Hidden when empty so it adds no noise on a clear day. Tapping a row
 * deep-links to /documents (the row title is searchable there).
 */
export function ExpiringDocs({ items }: { items: ExpiringDocItem[] }) {
  if (items.length === 0) return null;
  const expired = items.filter((d) => d.urgent).length;

  return (
    <div className="glass elevated rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 text-sm">
          <FileWarning size={16} className="text-warn" />
          <span className="font-medium">Documents needing attention</span>
          <span className="text-fg-subtle">· {items.length}</span>
          {expired > 0 && (
            <span className="inline-flex items-center gap-1 text-danger text-xs">
              <ShieldCheck size={12} /> {expired} expired
            </span>
          )}
        </div>
        <Link href="/documents" className="inline-flex items-center gap-0.5 text-xs text-fg-muted hover:text-accent transition-colors">
          All <ChevronRight size={13} />
        </Link>
      </div>
      <div className="divide-y divide-border/60">
        {items.map((d) => (
          <Link
            key={d.id}
            href="/documents"
            className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-bg-muted/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug truncate">{d.title}</div>
              {d.companyName && <div className="text-xs text-fg-muted mt-0.5 truncate">{d.companyName}</div>}
            </div>
            {d.expiryLabel && (
              <span className={cn("shrink-0 text-[11px] font-medium", d.urgent ? "text-danger" : "text-warn")}>
                {d.expiryLabel}
              </span>
            )}
            <span className={cn("shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", docStatusColor[d.status])}>
              {d.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
