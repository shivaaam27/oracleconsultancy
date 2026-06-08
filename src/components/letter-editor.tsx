"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, FileCheck2, Printer, Copy, Send, Trash2, Loader2, ExternalLink, Lock } from "lucide-react";
import { Badge, Button } from "./ui";
import { useToast } from "./toast";
import type { LetterDetail } from "@/lib/letters";
import {
  saveLetterDraftAction, issueLetterAction, duplicateLetterAction, deleteLetterAction, letterOutboxDraftAction,
} from "@/app/letters/actions";

type Lite = { id: number; name: string };

export function LetterEditor({ letter, companies }: { letter: LetterDetail; companies: Lite[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const issued = letter.status === "Issued";

  const [companyId, setCompanyId] = useState<string>(letter.companyId ? String(letter.companyId) : "");
  const [ref, setRef] = useState(letter.ref ?? "");
  const [date, setDate] = useState(letter.letterDate ? letter.letterDate.slice(0, 10) : "");
  const [addressee, setAddressee] = useState(letter.addressee ?? "");
  const [subject, setSubject] = useState(letter.subject ?? "");
  const [body, setBody] = useState(letter.body ?? "");

  function fields() {
    return {
      companyId: companyId ? parseInt(companyId, 10) : null,
      ref, addressee, subject, body,
      letterDate: date ? new Date(`${date}T00:00:00Z`).toISOString() : null,
    };
  }

  async function save(): Promise<boolean> {
    const res = await saveLetterDraftAction(letter.id, fields());
    if (!res.ok) { toast(res.error, { tone: "danger" }); return false; }
    return true;
  }

  function onSave() { start(async () => { if (await save()) { toast("Draft saved.", { tone: "success" }); router.refresh(); } }); }

  function onPreview() {
    start(async () => { if (await save()) window.open(`/letters/${letter.id}/print`, "_blank", "noopener,noreferrer"); });
  }

  function onDownloadPdf() {
    start(async () => {
      if (!(await save())) return;
      const url = `/letters/${letter.id}/print`;
      const existing = document.getElementById("letter-print-frame");
      if (existing) existing.remove();
      const iframe = document.createElement("iframe");
      iframe.id = "letter-print-frame";
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      iframe.src = url;
      iframe.onload = () => setTimeout(() => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { window.open(url, "_blank"); } }, 500);
      document.body.appendChild(iframe);
    });
  }

  function onIssue() {
    start(async () => {
      if (!(await save())) return;
      const res = await issueLetterAction(letter.id);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Letter issued — letterhead frozen.", { tone: "success" });
      router.refresh();
    });
  }
  function onDuplicate() {
    start(async () => {
      const res = await duplicateLetterAction(letter.id);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      if (res.id) router.push(`/letters/${res.id}`);
    });
  }
  function onOutbox() {
    start(async () => {
      const res = await letterOutboxDraftAction(letter.id);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Outbox draft created — attach the PDF and send.", { tone: "success" });
    });
  }
  function onDelete() {
    start(async () => {
      const res = await deleteLetterAction(letter.id);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      router.push("/letters");
    });
  }

  const input = "w-full rounded-lg border border-border bg-bg-subtle/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-70";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";
  const lh = letter.letterhead;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/letters" className="text-sm text-fg-muted hover:text-accent">‹ Letters</Link>
        <h1 className="text-lg font-semibold truncate flex-1 min-w-0">{letter.title}</h1>
        <Badge tone={issued ? "success" : "warn"}>{issued ? "Issued" : "Draft"}</Badge>
      </div>

      {issued && (
        <div className="flex items-center gap-2 rounded-xl bg-success-soft/40 ring-1 ring-success/25 px-3 py-2 text-xs text-success">
          <Lock size={13} /> Issued {letter.issuedAt ? `on ${new Date(letter.issuedAt).toLocaleDateString("en-GB")}` : ""} — content is locked. Duplicate to revise.
        </div>
      )}

      <div className="glass elevated rounded-2xl p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Company (letterhead)</label>
            <select disabled={issued} value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input}>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {lh && (
              <p className="mt-1 text-[11px] text-fg-subtle">
                {lh.mode === "typed" ? "Typed letterhead" : lh.mode === "images" ? "Designed header/footer" : "Full-page background"}
                {" · "}<Link href="/letterheads" className="text-accent hover:underline">edit letterhead</Link>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Reference</label><input disabled={issued} value={ref} onChange={(e) => setRef(e.target.value)} className={input} /></div>
            <div><label className={label}>Date</label><input disabled={issued} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} /></div>
          </div>
        </div>
        <div>
          <label className={label}>Addressee</label>
          <textarea disabled={issued} value={addressee} onChange={(e) => setAddressee(e.target.value)} rows={2} className={input} />
        </div>
        <div>
          <label className={label}>Subject (RE) — optional</label>
          <input disabled={issued} value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Body</label>
          <textarea disabled={issued} value={body} onChange={(e) => setBody(e.target.value)} rows={20}
            className={`${input} font-mono text-[13px] leading-relaxed`} />
          <p className="mt-1 text-[11px] text-fg-subtle">Edit anything — fill the [bracketed] placeholders. The letterhead, ref and date print automatically.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!issued && <Button size="sm" onClick={onSave} loading={pending}><Save size={14} /> Save draft</Button>}
        <Button size="sm" variant="secondary" onClick={onPreview} loading={pending}><ExternalLink size={14} /> Preview</Button>
        <Button size="sm" variant="secondary" onClick={onDownloadPdf} loading={pending}><Printer size={14} /> Download PDF</Button>
        {!issued && <Button size="sm" onClick={onIssue} loading={pending}><FileCheck2 size={14} /> Issue</Button>}
        <Button size="sm" variant="secondary" onClick={onDuplicate} loading={pending}><Copy size={14} /> Duplicate</Button>
        <Button size="sm" variant="secondary" onClick={onOutbox} loading={pending}><Send size={14} /> Outbox draft</Button>
        <button type="button" onClick={onDelete} disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md text-fg-muted hover:text-danger transition-colors disabled:opacity-50">
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
        </button>
      </div>
    </div>
  );
}
