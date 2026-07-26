"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";
import { wipeAllDocumentsAction, getWipeBackupLinkAction, type WipeResult } from "@/app/documents/wipe-actions";

const CONFIRM_PHRASE = "DELETE ALL DOCUMENTS";

type Preview = { documents: number; inbox: number; files: number; indexEntries: number; compliance: number };

/**
 * The one irreversible button in the app. Deliberately verbose: it states what
 * goes, what survives, and what stops working, then requires the phrase typed
 * out in full. A backup is written server-side before anything is deleted — it
 * is not optional and not the owner's job to remember.
 */
export function WipeDocuments({ preview }: { preview: Preview }) {
  const { toast } = useToast();
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Extract<WipeResult, { ok: true }> | null>(null);

  const armed = typed.trim() === CONFIRM_PHRASE;

  function run() {
    if (!armed) return;
    start(async () => {
      const res = await wipeAllDocumentsAction(typed);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setDone(res);
      setTyped("");
      toast(`${res.documents} documents erased. Backup saved.`, { tone: "success" });
    });
  }

  async function downloadBackup() {
    if (!done) return;
    const url = await getWipeBackupLinkAction(done.backupPath);
    if (!url) { toast("Couldn't create the download link — the backup is still saved.", { tone: "warn" }); return; }
    window.open(url, "_blank", "noopener");
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-xl bg-success/5 p-4 ring-1 ring-success/30">
        <p className="text-sm font-medium text-success">Done — you&apos;re starting fresh.</p>
        <ul className="space-y-1 text-xs text-fg-muted">
          <li>{done.documents} documents and {done.inbox} inbox items erased</li>
          <li>{done.filesDeleted} stored files deleted{done.filesKeptForChat > 0 && ` (${done.filesKeptForChat} kept — still shown in Chat)`}</li>
          <li>{done.indexEntries} search entries cleared, so nothing can be quoted back</li>
          <li>{done.complianceReset} compliance ticks reset to &ldquo;missing&rdquo;</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={downloadBackup}><Download size={13} /> Download the backup</Button>
          <span className="text-[11px] text-fg-subtle">Keep this file somewhere safe — it is the only copy.</span>
        </div>
        <p className="text-[11px] text-fg-subtle">
          Expiry alerts stay silent until documents are back in. Upload a few and everything
          re-indexes itself — there is nothing else to run.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-danger/5 p-4 ring-1 ring-danger/30">
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-danger" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-danger">Erase every document and start fresh</p>
          <p className="text-xs text-fg-muted">
            Permanent. There is no undo button — only the backup this saves first.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-bg-subtle/60 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">What goes</p>
          <ul className="space-y-0.5 text-xs text-fg-muted">
            <li>{preview.documents} documents</li>
            <li>{preview.files} stored files</li>
            <li>{preview.inbox} inbox items</li>
            <li>{preview.indexEntries} search entries</li>
            <li>{preview.compliance} compliance ticks reset</li>
          </ul>
        </div>
        <div className="rounded-lg bg-bg-subtle/60 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">What stays</p>
          <ul className="space-y-0.5 text-xs text-fg-muted">
            <li>Tasks, people, companies</li>
            <li>Attendance, chat, calendar</li>
            <li>Company logos &amp; settings</li>
            <li>Everything the AI has learned</li>
            <li>Chat attachments keep working</li>
          </ul>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-warn/10 p-2.5 ring-1 ring-warn/25">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-[11px] text-fg-muted">
          Compliance drops to 0% and <b>expiry alerts go silent</b> until documents are back in.
          Nothing will warn you about an expiring licence in the meantime.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-fg-muted" htmlFor="wipe-confirm">
          Type <b className="text-fg">{CONFIRM_PHRASE}</b> to enable the button
        </label>
        <input
          id="wipe-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={CONFIRM_PHRASE}
          autoComplete="off"
          className="w-full max-w-sm rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:border-danger focus:outline-none"
        />
        <Button
          size="sm"
          onClick={run}
          disabled={!armed || pending}
          className="bg-danger text-white hover:bg-danger/90 disabled:opacity-40"
        >
          {pending ? <><Loader2 size={13} className="animate-spin" /> Erasing…</> : <>Back up, then erase everything</>}
        </Button>
      </div>
    </div>
  );
}
