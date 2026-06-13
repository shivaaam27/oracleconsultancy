"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X, FileText, Loader2 } from "lucide-react";
import { Badge, Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { LETTER_TEMPLATES, type LetterRow } from "@/lib/letters-shared";
import { createLetterAction } from "@/app/letters/actions";

type Lite = { id: number; name: string };

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function LettersList({ letters, companies, people }: { letters: LetterRow[]; companies: Lite[]; people: Lite[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> New letter</Button>
      </div>

      {letters.length ? (
        <div className="glass elevated rounded-2xl overflow-hidden divide-y divide-border/60">
          {letters.map((l) => (
            <Link key={l.id} href={`/letters/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-muted/40 transition-colors">
              <FileText size={15} className="text-fg-subtle shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{l.title}</div>
                <div className="text-[11px] text-fg-muted truncate">
                  {[l.ref, l.companyName, l.personName].filter(Boolean).join(" · ")}{l.issuedAt ? ` · issued ${fmt(l.issuedAt)}` : ` · updated ${fmt(l.updatedAt)}`}
                </div>
              </div>
              <Badge tone={l.status === "Issued" ? "success" : "warn"}>{l.status}</Badge>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass elevated rounded-2xl text-center py-12 text-fg-muted text-sm">No letters yet. Create your first.</div>
      )}

      <NewLetterDialog open={open} onOpenChange={setOpen} companies={companies} people={people} />
    </div>
  );
}

function NewLetterDialog({ open, onOpenChange, companies, people }: { open: boolean; onOpenChange: (o: boolean) => void; companies: Lite[]; people: Lite[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [type, setType] = useState("invitation");
  const [companyId, setCompanyId] = useState("");
  const [personId, setPersonId] = useState("");

  const tpl = LETTER_TEMPLATES.find((t) => t.id === type);
  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  function create() {
    if (tpl?.needsPerson && !personId) { toast("This letter needs a person.", { tone: "warn" }); return; }
    start(async () => {
      const res = await createLetterAction(type, companyId ? parseInt(companyId, 10) : null, personId ? parseInt(personId, 10) : null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      onOpenChange(false);
      if (res.id) router.push(`/letters/${res.id}`);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[51] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl glass glass-menu elevated outline-none">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <Dialog.Title className="text-sm font-semibold">New letter</Dialog.Title>
            <Dialog.Close className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle"><X size={14} /></Dialog.Close>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className={label}>Letter type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={input}>
                {LETTER_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Company (letterhead)</label>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={input}>
                <option value="">— Choose company</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className={cn(label, !tpl?.needsPerson && "opacity-60")}>Person {tpl?.needsPerson ? "*" : "(optional)"}</label>
              <select value={personId} onChange={(e) => setPersonId(e.target.value)} className={input}>
                <option value="">{tpl?.needsPerson ? "Choose…" : "— None"}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={create} loading={pending}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Create draft</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
