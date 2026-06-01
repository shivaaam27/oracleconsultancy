import { createTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { ActionItemField } from "@/components/action-item-field";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";

/**
 * The New Task form body — shared by the full-page route and the modal
 * (intercepting route) so there's one source of truth.
 *
 * - `returnTo`, when set, is submitted as a hidden field so `createTask`
 *   redirects back to the originating section instead of the standalone page.
 * - `variant="modal"` lays the form out as a flex column with a scrollable field
 *   area and a sticky, full-width "Create task" footer (the modal's X handles
 *   cancel). `variant="page"` keeps the classic inline Cancel + Create row.
 */
export function NewTaskForm({
  companies,
  presetCompany,
  returnTo,
  variant = "page",
}: {
  companies: Array<{ id: number; name: string }>;
  presetCompany?: number;
  returnTo?: string;
  variant?: "page" | "modal";
}) {
  const cancelHref = returnTo || "/?tab=tasks";

  const fields = (
    <>
      {/* Primary card */}
      <div className="glass elevated relative overflow-hidden rounded-3xl p-4 sm:p-5 space-y-3 sm:space-y-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full blur-3xl opacity-50"
          style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.30), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, hsl(142 60% 45% / 0.22), transparent 70%)" }}
        />
        <div className="relative">
          <FieldLabel>Action Item <span className="text-fg-subtle normal-case font-normal">— click ✦ to polish</span></FieldLabel>
          <ActionItemField name="actionItem" required placeholder="What needs to happen?" />
        </div>

        {/* Description (stored as the task's comments). Sits up top, by the action. */}
        <div className="relative">
          <FieldLabel>Description</FieldLabel>
          <Textarea name="comments" rows={2} placeholder="Add any context or detail…" />
        </div>

        {/* Short fields sit two-per-row; full-width fields span both columns. */}
        <div className="relative grid grid-cols-2 gap-2.5 sm:gap-3">
          <div>
            <FieldLabel>Company</FieldLabel>
            <Select name="companyId" defaultValue={presetCompany} required>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Meeting Date</FieldLabel>
            <Input name="meetingDate" type="date" />
          </div>
          <div>
            <FieldLabel>Priority</FieldLabel>
            <Select name="priority" defaultValue="Low">
              {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <FieldLabel>Deadline</FieldLabel>
            <Input name="deadline" type="date" />
          </div>
          <div className="col-span-2">
            <FieldLabel>Accountable</FieldLabel>
            <Input name="accountable" placeholder="e.g. Jitesh, Vishal" />
          </div>
        </div>
      </div>

      {/* Advanced — collapsible, keeps the form minimal */}
      <details className="group glass elevated rounded-3xl overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-2 px-5 py-4 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
          <ChevronRight size={14} className="text-fg-subtle transition-transform group-open:rotate-90" />
          More details
          <span className="text-fg-subtle normal-case tracking-normal font-normal">status, risk, category &amp; department</span>
        </summary>
        <div className="px-5 pb-5 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <div>
              <FieldLabel>Status</FieldLabel>
              <Select name="status" defaultValue="Not Started">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Risk</FieldLabel>
              <Select name="risk" defaultValue="">
                <option value="">—</option>
                {RISKS.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Escalation</FieldLabel>
              <Select name="escalation" defaultValue="No">
                <option>No</option>
                <option>Yes</option>
              </Select>
            </div>
            <div>
              <FieldLabel>Department</FieldLabel>
              <Input name="department" />
            </div>
            <div>
              <FieldLabel>Category</FieldLabel>
              <Input name="category" />
            </div>
          </div>
        </div>
      </details>
    </>
  );

  const hidden = returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null;

  // Modal: flex column — scrollable fields + sticky full-width Create footer.
  if (variant === "modal") {
    return (
      <form action={createTask} className="flex flex-col min-h-0 flex-1">
        {hidden}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-3 sm:space-y-4">
          {fields}
        </div>
        <div className="shrink-0 border-t border-border/60 px-4 sm:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-bg-elev/70 backdrop-blur-md">
          <Button type="submit" className="w-full justify-center rounded-full"><Plus size={15} /> Create task</Button>
        </div>
      </form>
    );
  }

  // Full page: classic inline Cancel + Create.
  return (
    <form action={createTask} className="space-y-4">
      {hidden}
      {fields}
      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className="px-4 py-2 text-sm rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">Cancel</Link>
        <Button type="submit" className="rounded-full"><Plus size={14} /> Create task</Button>
      </div>
    </form>
  );
}
