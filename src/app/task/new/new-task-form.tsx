import { createTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { ActionItemField } from "@/components/action-item-field";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";

/**
 * The New Task form body — shared by the full-page route and the modal
 * (intercepting route) so there's one source of truth. `returnTo`, when set,
 * is submitted as a hidden field so `createTask` redirects back to the
 * originating section instead of the standalone task page.
 */
export function NewTaskForm({
  companies,
  presetCompany,
  returnTo,
}: {
  companies: Array<{ id: number; name: string }>;
  presetCompany?: number;
  returnTo?: string;
}) {
  const cancelHref = returnTo || "/?tab=tasks";
  return (
    <form action={createTask} className="space-y-4">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      {/* Primary card */}
      <div className="glass elevated relative overflow-hidden rounded-3xl p-5 space-y-4">
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

        <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Company</FieldLabel>
            <Select name="companyId" defaultValue={presetCompany} required>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
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
          <div>
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
          <span className="text-fg-subtle normal-case tracking-normal font-normal">status, category, risk &amp; notes</span>
        </summary>
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <FieldLabel>Meeting Date</FieldLabel>
              <Input name="meetingDate" type="date" />
            </div>
          </div>
          <div>
            <FieldLabel>Latest Update</FieldLabel>
            <Input name="latestUpdate" placeholder="Optional opening note" />
          </div>
          <div>
            <FieldLabel>Comments</FieldLabel>
            <Textarea name="comments" rows={3} />
          </div>
        </div>
      </details>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className="px-4 py-2 text-sm rounded-full text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">Cancel</Link>
        <Button type="submit" className="rounded-full"><Plus size={14} /> Create task</Button>
      </div>
    </form>
  );
}
