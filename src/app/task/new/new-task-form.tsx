import { createTask } from "../actions";
import { STATUSES, RISKS, CATEGORIES } from "@/lib/constants";
import { Button, FieldLabel, Input } from "@/components/ui";
import { SelectField } from "@/components/select-field";
import { FormSwitch } from "@/components/form-switch";
import { Combobox } from "@/components/combobox";
import { SubmitTextarea, EnterHint } from "@/components/form-keys";
import { ActionItemField } from "@/components/action-item-field";
import { PersonPicker, type PickerPerson } from "@/components/person-picker";
import { PrioritySegment, DeadlineQuickPick, CompanySelectField, RepeatSection } from "@/components/task-form-fields";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The New Task form body — shared by the full-page route and the modal
 * (intercepting route) so there's one source of truth.
 *
 * Desk layout (Sept 2026): one white card with a hairline, the title first,
 * then a two-column field grid at `sm`+ — company and priority, deadline and
 * who — the description, and the two switches that change what the task
 * DEMANDS (a lead, a file). The rarely-needed fields fold under "More details".
 * Every control is the ONE control box (`h-8 rounded-md`); nothing is a pill.
 *
 * ⚠️ NO NATIVE `<select>` and NO FREE TEXT AGAINST A FIXED LIST. Status, risk,
 * escalation and category are `SelectField`s; the department is a `Combobox`
 * over the departments that already exist (a new one can still be typed — the
 * core creates it — but the list is offered FIRST, so "Operations" does not
 * become "operations", "Ops" and "Operation" by the end of the month).
 *
 * - `returnTo`, when set, is submitted as a hidden field so `createTask`
 *   redirects back to the originating section instead of the standalone page.
 * - `variant="modal"` lays the form out as a flex column with a scrollable field
 *   area and a sticky, full-width "Create task" footer (the modal's X handles
 *   cancel). `variant="page"` keeps the classic inline Cancel + Create row.
 */
export function NewTaskForm({
  companies,
  people,
  departments = [],
  presetCompany,
  defaultAccountable,
  defaultTitle,
  defaultDeadline,
  returnTo,
  variant = "page",
}: {
  companies: Array<{ id: number; name: string }>;
  people: PickerPerson[];
  /** Existing department names, offered first in the Department box. */
  departments?: string[];
  presetCompany?: number;
  /** Pre-select these people in the Accountable picker (e.g. opening from a
   *  person's drawer so their name fills in). */
  defaultAccountable?: string[];
  /** Carry the quick-add row's typed title in (Enter → this form). */
  defaultTitle?: string;
  /** yyyy-mm-dd from the quick-add row's deadline circle. */
  defaultDeadline?: string;
  returnTo?: string;
  variant?: "page" | "modal";
}) {
  const cancelHref = returnTo || "/?tab=tasks";

  const fields = (
    <>
      {/* Primary card */}
      <div className="rounded-lg border border-border bg-bg-elev">
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <FieldLabel>Action Item <span className="text-fg-subtle normal-case font-normal tracking-normal">— click ✦ to polish the wording</span></FieldLabel>
            <ActionItemField name="actionItem" required placeholder="What needs to happen?" defaultValue={defaultTitle} />
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Company</FieldLabel>
              <CompanySelectField companies={companies} defaultValue={presetCompany} />
            </div>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <PrioritySegment />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Deadline</FieldLabel>
              <DeadlineQuickPick defaultValue={defaultDeadline} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Accountable</FieldLabel>
              <PersonPicker people={people} defaultNames={defaultAccountable} placeholder="Search people, or type a new name…" />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <SubmitTextarea name="comments" rows={3} placeholder="Add any context or detail…" />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2 sm:p-5">
          <FormSwitch
            name="leadMode"
            label="The first person is the lead"
            hint="Only they carry the overdue. Off: everyone on it shares it."
          />
          <FormSwitch
            name="requiresAttachment"
            label="Needs a file to complete"
            hint="Completing on the portal refuses without an attachment."
          />
          <div className="sm:col-span-2">
            <RepeatSection />
          </div>
        </div>
      </div>

      {/* Advanced — collapsible, keeps the form minimal */}
      <details className="group rounded-lg border border-border bg-bg-elev">
        {/* `More details` was a bare text node, so it was a flex item that could
            wrap — and at 375px it did, stacking as "MORE" / "DETAILS" beside its
            own description. It is the label of the row; it stays on one line and
            the description takes what is left. */}
        <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 sm:px-5 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted select-none hover:text-fg">
          <ChevronRight size={14} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-90" />
          <span className="shrink-0">More details</span>
          <span className="min-w-0 truncate text-fg-subtle normal-case tracking-normal font-normal">status, risk, escalation, meeting date, department &amp; category</span>
        </summary>
        <div className="border-t border-border px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
            <Field label="Status">
              <SelectField name="status" defaultValue="Not Started" options={STATUSES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Risk">
              <SelectField name="risk" defaultValue="" placeholder="—" options={[{ value: "", label: "—" }, ...RISKS.map((s) => ({ value: s, label: s }))]} />
            </Field>
            <Field label="Escalation">
              <SelectField name="escalation" defaultValue="No" options={[{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }]} />
            </Field>
            <Field label="Meeting Date">
              <Input name="meetingDate" type="date" className="h-8 rounded-md px-2.5" />
            </Field>
            <Field label="Department">
              <Combobox name="department" options={departments} placeholder="Pick, or type a new one" />
            </Field>
            <Field label="Category">
              <SelectField name="category" defaultValue="" placeholder="—" options={[{ value: "", label: "—" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
            </Field>
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
          {fields}
        </div>
        <div className="shrink-0 border-t border-border bg-bg-elev px-4 sm:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] space-y-2">
          <EnterHint className="text-center" verb="create" />
          <Button type="submit" className="w-full justify-center"><Plus size={15} /> Create task</Button>
        </div>
      </form>
    );
  }

  // Full page: classic inline Cancel + Create.
  return (
    <form action={createTask} className="space-y-3">
      {hidden}
      {fields}
      <div className="flex items-center justify-end gap-2">
        <EnterHint className="mr-auto" verb="create" />
        <Link href={cancelHref} className="h-8 inline-flex items-center rounded-md px-3 text-sm text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors">Cancel</Link>
        <Button type="submit"><Plus size={14} /> Create task</Button>
      </div>
    </form>
  );
}

/* ⚠️ `justify-end`, AND IT IS NOT COSMETIC. A grid cell stretches to the
   tallest row, so a label that wraps pushed ITS control down while a one-line
   label left its control at the top. Label and control sit at the BOTTOM of
   the cell, so every control in a row lines up whatever the labels do. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-end">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}
