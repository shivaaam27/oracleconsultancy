import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { LedgerRecDetail } from "@/components/ledger-reconcile";
import { recWithCheck } from "@/lib/ledger-reconcile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const full = await recWithCheck(Number(id));
  return { title: full ? `${full.rec.statementDate} — Reconcile` : "Reconcile — Ledger" };
}

/**
 * One statement, ticked off against the books.
 *
 * ⚠️ Nothing on this page changes a `gl_entries` row. A tick writes a
 * `bank_rec_lines` row pointing at the entry, so the ledger's second rule holds
 * and un-ticking is simply removing that row.
 */
export default async function LedgerRecPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ co?: string }>;
}) {
  const [{ id }, { co }] = await Promise.all([params, searchParams]);
  const full = await recWithCheck(Number(id));
  if (!full) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Statement ${full.rec.statementDate}`}
        sub={full.rec.accountName ?? `Account #${full.rec.accountId}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/ledger/reconcile${co ? `?co=${co}` : ""}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All statements
        </Link>
        <span className={`inline-flex h-8 items-center rounded-md px-2.5 text-sm ${
          full.rec.status === "closed" ? "bg-success/10 text-success" : "bg-warn/10 text-warn"}`}>
          {full.rec.status === "closed" ? "Agreed and closed" : "Open"}
        </span>
      </div>
      <LedgerRecDetail rec={full.rec} entries={full.entries} check={full.check} />
    </div>
  );
}
