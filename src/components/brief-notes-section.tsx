"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StickyNote, Plus, Trash2, Loader2, Pencil, Check, X, Eye, EyeOff } from "lucide-react";
import { Card, Button, Textarea, Select } from "@/components/ui";
import { useToast } from "@/components/toast";
import { createBriefNoteAction, updateBriefNoteAction, deleteBriefNoteAction } from "@/app/brief/actions";
import type { BriefNote } from "@/lib/brief-notes";

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

const HIDE_KEY = "v2.briefNotesHideCompany";
const HIDE_CLASS = "hide-brief-note-company";

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editCompanyId, setEditCompanyId] = useState<string>("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [hideCompany, setHideCompany] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  // Hide-company is a display preference persisted locally; it toggles a class on
  // <html> so the same rule hides the column in the printed PDF (window.print()
  // prints the live DOM). Read once on mount.
  useEffect(() => {
    const on = localStorage.getItem(HIDE_KEY) === "true";
    setHideCompany(on);
    document.documentElement.classList.toggle(HIDE_CLASS, on);
  }, []);

  function toggleHideCompany() {
    const next = !hideCompany;
    setHideCompany(next);
    localStorage.setItem(HIDE_KEY, String(next));
    document.documentElement.classList.toggle(HIDE_CLASS, next);
  }

  function add() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await createBriefNoteAction({ body: text, companyId: companyId ? Number(companyId) : null });
      if (!res.ok) { toast(res.error, { tone: "warn", duration: 4000 }); return; }
      setBody("");
      setOpen(false);
      toast("Note added to the brief.", { tone: "success", duration: 3000 });
      router.refresh();
    });
  }

  function startEdit(n: BriefNote) {
    setEditingId(n.id);
    setEditBody(n.body);
    setEditCompanyId(n.companyId ? String(n.companyId) : "");
    setOpen(false);
  }

  function saveEdit() {
    const text = editBody.trim();
    if (!text || editingId == null) return;
    startTransition(async () => {
      const res = await updateBriefNoteAction({ id: editingId, body: text, companyId: editCompanyId ? Number(editCompanyId) : null });
      if (!res.ok) { toast(res.error, { tone: "warn", duration: 4000 }); return; }
      setEditingId(null);
      toast("Note updated.", { tone: "success", duration: 2500 });
      router.refresh();
    });
  }

  function remove(n: BriefNote) {
    setConfirmingId(null);
    startTransition(async () => {
      const res = await deleteBriefNoteAction(n.id);
      if (!res.ok) { toast(res.error, { tone: "warn", duration: 4000 }); return; }
      router.refresh();
      // Offer an Undo: re-create the note with its original text, company and date.
      toast("Note removed.", {
        tone: "default",
        duration: 7000,
        action: {
          label: "Undo",
          onClick: async () => {
            const back = await createBriefNoteAction({
              body: n.body,
              companyId: n.companyId,
              noteDate: n.noteDate.toISOString(),
            });
            if (!back.ok) { toast(back.error, { tone: "warn", duration: 4000 }); return; }
            router.refresh();
            toast("Note restored.", { tone: "success", duration: 2500 });
          },
        },
      });
    });
  }

  return (
    <div className="print-hidden">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted flex items-center gap-1.5">
          <StickyNote size={13} className="text-accent" /> Admin &amp; HR updates · {notes.length}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleHideCompany}
            title={hideCompany ? "Show the company column" : "Hide the company column"}
          >
            {hideCompany ? <EyeOff size={14} /> : <Eye size={14} />}
            {hideCompany ? "Company hidden" : "Company shown"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen((o) => !o); setEditingId(null); }}>
            <Plus size={14} /> Add note
          </Button>
        </div>
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
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setBody(""); }} disabled={pending}>Cancel</Button>
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
          {notes.map((n) =>
            editingId === n.id ? (
              <div key={n.id} className="px-4 py-3 space-y-2">
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} autoFocus />
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={editCompanyId} onChange={(e) => setEditCompanyId(e.target.value)} className="text-sm">
                    <option value="">Whole portfolio</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <div className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={pending}>
                    <X size={14} /> Cancel
                  </Button>
                  <Button size="sm" onClick={saveEdit} disabled={pending || !editBody.trim()}>
                    {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
                  </Button>
                </div>
              </div>
            ) : (
              <div key={n.id} className="flex items-start gap-2.5 px-4 py-2.5 group">
                <StickyNote size={14} className="text-accent shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm whitespace-pre-wrap break-words">{n.body}</div>
                  <div className="text-[11px] text-fg-subtle mt-0.5">
                    {n.companyName && <span className="brief-note-company">{n.companyName} · </span>}
                    {fmtDay(n.noteDate)}
                  </div>
                </div>
                {confirmingId === n.id ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-fg-muted">Delete?</span>
                    <button
                      onClick={() => remove(n)}
                      disabled={pending}
                      className="text-danger hover:opacity-80 transition-opacity disabled:opacity-50"
                      aria-label="Confirm delete note"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={pending}
                      className="text-fg-subtle hover:text-fg transition-colors disabled:opacity-50"
                      aria-label="Cancel delete"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => { setConfirmingId(null); startEdit(n); }}
                      disabled={pending}
                      className="text-fg-subtle hover:text-accent transition-colors shrink-0 disabled:opacity-50"
                      aria-label="Edit note"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmingId(n.id)}
                      disabled={pending}
                      className="text-fg-subtle hover:text-danger transition-colors shrink-0 disabled:opacity-50"
                      aria-label="Delete note"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            )
          )}
        </Card>
      )}
    </div>
  );
}
