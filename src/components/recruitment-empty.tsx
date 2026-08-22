import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

/**
 * Shown when the agency company cannot be found.
 *
 * The company list is never hard-coded (CLAUDE.md's first rule), so the desk
 * looks Oracle Consultancy up by its `code_prefix`. If somebody renames or
 * removes it, this says so plainly instead of the page rendering empty and
 * looking like a system with no data in it.
 */
export function NoAgencyCompany() {
  return (
    <div className="space-y-4">
      <PageHeader title="Recruitment" sub="The agency desk." />
      <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft/50 px-3 py-3 text-base">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
        <div>
          <p className="font-medium">Oracle Consultancy Ltd was not found in the company list.</p>
          <p className="mt-1 text-sm text-fg-muted">
            The desk finds it by its two-letter prefix <span className="font-mono">OC</span>, or by
            its name. Check it is present and active on the{" "}
            <Link href="/companies" className="text-accent underline">Companies</Link> hub.
          </p>
        </div>
      </div>
    </div>
  );
}
