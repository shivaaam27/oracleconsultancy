"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, Trash2 } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Button, CONTROL_BOX } from "./ui";
import { FluidSelect } from "./fluid-select";
import { Combobox } from "./combobox";
import { useToast } from "./toast";
import { parseCaptureLines, createCaptureTask, type ParsedLine } from "@/app/capture/actions";
import { PRIORITIES } from "@/lib/constants";
import { cn } from "@/lib/cn";
import type { QuickTaskCompany } from "./quick-task-popover";

/* ------------------------------------------------------------------ *
 * PasteTasks — a list becomes tasks.
 *
 * Paste one task per line (a WhatsApp list, meeting notes, "1. … 2. …").
 * Each line is read by the same parser the capture wizard uses, so a company
 * or a person NAMED in the line is picked out and the words removed from the
 * title. What it could not tell is filled from the quick-add row's sticky
 * context (the company you are filtered to, the person you picked). Then a
 * preview table you correct, and ONE button creates them all — through the
 * same door as every other task, so each notifies its assignee and audits.
 *
 * Two steps on purpose: a guess you cannot see before it saves is a task on
 * the wrong company.
 * ------------------------------------------------------------------ */

type Draft = ParsedLine & { key: number };

export function PasteTasks({
  open,
  onClose,
  companies,
  people,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  companies: QuickTaskCompany[];
  people: string[];
  /** The quick-add row's sticky context — fills what a line does not say. */
  defaults: { companyId?: number; assignees: string[]; deadline: string; priority: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [parsing, startParse] = useTransition();
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const lineCount = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;

  function preview() {
    const lines = text.split(/\r?\n/);
    startParse(async () => {
      const parsed = await parseCaptureLines(lines);
      setRows(parsed.map((p, i) => ({
        ...p,
        key: i,
        companyId: p.companyId ?? defaults.companyId ?? null,
        assigneeNames: p.assigneeNames.length ? p.assigneeNames : defaults.assignees,
        deadline: p.deadline ?? (defaults.deadline || null),
        priority: p.priority !== "Medium" ? p.priority : (defaults.priority || "Medium"),
      })));
    });
  }

  function patch(key: number, part: Partial<Draft>) {
    setRows((cur) => (cur ?? []).map((r) => (r.key === key ? { ...r, ...part } : r)));
  }

  const ready = (rows ?? []).filter((r) => r.actionItem.trim() && r.companyId);
  const missingCompany = (rows ?? []).filter((r) => r.actionItem.trim() && !r.companyId).length;

  async function saveAll() {
    if (!rows || ready.length === 0) return;
    setSaving(true);
    setProgress(0);
    const made: string[] = [];
    const failed: string[] = [];
    for (const r of ready) {
      const res = await createCaptureTask({
        companyId: r.companyId!,
        actionItem: r.actionItem.trim(),
        priority: r.priority,
        status: "Not Started",
        deadline: r.deadline,
        assignees: r.assigneeNames.join(", ") || undefined,
        createdBy: "web-ui",
      });
      if (res.ok && res.code) made.push(res.code); else failed.push(r.actionItem.slice(0, 40));
      setProgress(made.length + failed.length);
    }
    setSaving(false);
    if (failed.length) {
      toast(`${made.length} added, ${failed.length} failed: ${failed.join("; ")}`, { tone: "warn", duration: 10000 });
    } else {
      toast(`${made.length} task${made.length === 1 ? "" : "s"} added (${made[0]}${made.length > 1 ? ` … ${made[made.length - 1]}` : ""}).`, { tone: "success", duration: 8000 });
    }
    setText("");
    setRows(null);
    router.refresh();
    onClose();
  }

  function reset() { setRows(null); }

  const companyOptions = companies.map((c) => ({ value: String(c.id), label: c.name }));
  const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: p }));

  return (
    <BottomSheet
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Paste a list"
      icon={<ClipboardList size={16} />}
      maxWidth={rows ? "sm:max-w-4xl" : "sm:max-w-lg"}
      footer={
        rows ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={saving}>Back to the text</Button>
            <span className="ml-auto text-xs text-fg-muted">
              {saving ? `Adding ${progress} of ${ready.length}…` : missingCompany ? `${missingCompany} need a company` : `${ready.length} ready`}
            </span>
            <Button type="button" onClick={saveAll} disabled={saving || ready.length === 0} loading={saving}>
              Add {ready.length} task{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">{lineCount ? `${lineCount} line${lineCount === 1 ? "" : "s"}` : "One task per line"}</span>
            <Button type="button" className="ml-auto" onClick={preview} disabled={parsing || lineCount === 0} loading={parsing}>
              Preview {lineCount || ""}
            </Button>
          </div>
        )
      }
    >
      {!rows ? (
        <div className="space-y-2 p-4">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={"Renew the TRA licence for DSC by Friday — Vishal\nChase the Clifford invoice, MES, urgent\nBook the audit meeting next week"}
            className="w-full resize-y rounded-md border border-border bg-bg-elev px-3 py-2 text-sm leading-relaxed placeholder:text-fg-subtle focus:border-accent/50 focus:outline-none"
          />
          <p className="text-xs leading-snug text-fg-muted">
            Name a company or a person in a line and it is picked out. Words like &ldquo;urgent&rdquo;, &ldquo;by Friday&rdquo; or
            &ldquo;next week&rdquo; set the priority and deadline. Anything a line does not say comes from the quick-add row&rsquo;s
            chips. Numbering and dashes are ignored.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                <th className="px-3 py-1.5">Task</th>
                <th className="w-44 px-2 py-1.5">Company</th>
                <th className="w-40 px-2 py-1.5">Who</th>
                <th className="w-32 px-2 py-1.5">Deadline</th>
                <th className="w-28 px-2 py-1.5">Priority</th>
                <th className="w-9 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className={cn(!r.companyId && "bg-warn-soft/30")}>
                  <td className="px-3 py-1.5">
                    <input
                      value={r.actionItem}
                      onChange={(e) => patch(r.key, { actionItem: e.target.value })}
                      className={cn(CONTROL_BOX, "w-full border border-border bg-bg-elev px-2")}
                    />
                    {r.raw !== r.actionItem && <p className="mt-0.5 truncate text-xs text-fg-subtle" title={r.raw}>from: {r.raw}</p>}
                  </td>
                  <td className="px-2 py-1.5">
                    <FluidSelect
                      value={r.companyId ? String(r.companyId) : ""}
                      options={companyOptions}
                      onSelect={(v) => patch(r.key, { companyId: Number(v) })}
                      placeholder="Pick…"
                      className="w-full"
                      buttonClassName={cn("w-full justify-between", !r.companyId && "border-warn/50")}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <Combobox
                      options={people}
                      defaultValue={r.assigneeNames[0] ?? ""}
                      placeholder="—"
                      onCommit={(v) => patch(r.key, { assigneeNames: v ? [v] : [] })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="date"
                      value={r.deadline ?? ""}
                      onChange={(e) => patch(r.key, { deadline: e.target.value || null })}
                      className={cn(CONTROL_BOX, "w-full border border-border bg-bg-elev px-2")}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <FluidSelect value={r.priority} options={priorityOptions} onSelect={(v) => patch(r.key, { priority: v })} className="w-full" buttonClassName="w-full justify-between" />
                  </td>
                  <td className="px-1 py-1.5">
                    <button
                      type="button"
                      aria-label="Remove this line"
                      onClick={() => setRows((cur) => (cur ?? []).filter((x) => x.key !== r.key))}
                      className="grid h-7 w-7 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-fg-muted">Nothing left to add.</td></tr>
              )}
            </tbody>
          </table>
          {parsing && <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-fg-subtle" /></div>}
        </div>
      )}
    </BottomSheet>
  );
}
