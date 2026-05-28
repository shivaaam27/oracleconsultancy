import { sb } from "@/db/supabase";
import Link from "next/link";
import { createTask } from "../actions";
import { STATUSES, PRIORITIES, RISKS } from "@/lib/constants";
import { Card, PageHeader, Button, FieldLabel, Input, Select, Textarea } from "@/components/ui";
import { ActionItemField } from "@/components/action-item-field";
import { ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const sp = await searchParams;
  const { data: rows } = await sb.from("companies").select("id,name").order("name");
  const companies = (rows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const presetCompany = sp.companyId ? parseInt(sp.companyId, 10) : companies[0]?.id;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <Link href="/registry" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft size={12} /> Registry
        </Link>
      </div>

      <PageHeader title="New Task" sub="Create an action item tracked in the registry." />

      <Card className="p-6">
        <form action={createTask} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Company *</FieldLabel>
              <Select name="companyId" defaultValue={presetCompany} required>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Department</FieldLabel>
              <Input name="department" />
            </div>
          </div>

          <div>
            <FieldLabel>Action Item * <span className="text-fg-subtle normal-case font-normal">— click ✦ to polish</span></FieldLabel>
            <ActionItemField name="actionItem" required placeholder="What needs to happen?" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <FieldLabel>Status</FieldLabel>
              <Select name="status" defaultValue="Not Started">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <FieldLabel>Priority</FieldLabel>
              <Select name="priority" defaultValue="Low">
                {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
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
              <FieldLabel>Category</FieldLabel>
              <Input name="category" />
            </div>
            <div>
              <FieldLabel>Meeting Date</FieldLabel>
              <Input name="meetingDate" type="date" />
            </div>
            <div>
              <FieldLabel>Deadline</FieldLabel>
              <Input name="deadline" type="date" />
            </div>
            <div className="col-span-2">
              <FieldLabel>Accountable (comma-separated)</FieldLabel>
              <Input name="accountable" placeholder="e.g. Jitesh, Vishal" />
            </div>
          </div>

          <div>
            <FieldLabel>Latest Update</FieldLabel>
            <Input name="latestUpdate" />
          </div>

          <div>
            <FieldLabel>Comments</FieldLabel>
            <Textarea name="comments" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Link href="/registry" className="px-3 py-1.5 text-sm rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted">Cancel</Link>
            <Button type="submit"><Plus size={13} /> Create task</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
