"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, Plus, Trash2, Loader2 } from "lucide-react";
import { Card, Button, Textarea, Select } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createBriefNoteAction, deleteBriefNoteAction } from "@/app/brief/actions";
import type { BriefNote } from "@/lib/brief-notes";

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

export function BriefNotesSection({
  notes,
  monthLabel,
  companyOptions,
  selectedCompanyId,
}: {
  notes: BriefNote[];
  monthLabel: string;
  companyOptions: Array<{ id: number; name: string }>;
  selectedCompanyId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [companyId, setCompanyId] = useState<string>(selectedCompanyId ? String(selectedCompanyId) : "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function add() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await createBriefNoteAction({
        body: text,
        companyId: companyId ? Number(companyId) : null,
      });
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      setBody("");
      setOpen(false);
      toast("Note added to the brief.", { tone: "success", duration: 3000 });
      router.refresh();
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await deleteBriefNoteAction(id);
      if (!res.ok) {
        toast(res.error, { tone: "warn", duration: 4000 });
        return;
      }
      router.refresh();
      toast("Note removed.", { tone: "default", duration: 2500 });
    });
  }

  return (
    <div className="print-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted flex items-center gap-1.5">
          <StickyNote size={13} className="text-accent" /> Admin &amp; HR updates · {notes.length}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus size={14} /> Add note
        </Button>
      </div>

      {open && (
        <Card className="p-3 mb-3 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`What else happened in ${monthLabel}? e.g. "Renewed the office lease for OECR".`}
            rows={2}
            autoFocus
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="text-sm">
              <option value="">Whole portfolio</option>
              {companyOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setBody(""); }} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={add} disabled={pending || !body.trim()}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </Button>
          </div>
        </Card>
      )}

      {notes.length === 0 ? (
        !open && (
          <Card className="p-4 text-sm text-fg-muted">
            No updates yet. Use “Add note” to record Admin/HR things that aren’t tasks.
          </Card>
        )
      ) : (
        <Card className="divide-y divide-border/70">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start gap-2.5 px-4 py-2.5">
              <StickyNote size={14} className="text-accent shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm whitespace-pre-wrap break-words">{n.body}</div>
                <div className="text-[11px] text-fg-subtle mt-0.5">
                  {n.companyName ? `${n.companyName} · ` : ""}{fmtDay(n.noteDate)}
                </div>
              </div>
              <button
                onClick={() => remove(n.id)}
                disabled={pending}
                className="text-fg-subtle hover:text-danger transition-colors shrink-0 disabled:opacity-50"
                aria-label="Delete note"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
