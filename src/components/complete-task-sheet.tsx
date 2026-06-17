"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Paperclip } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { CaretTextarea } from "./ui";
import { useToast } from "./toast";
import { portalCompleteTask } from "@/app/portal/actions";

/* The secure completion gate, as an iPhone sheet. Completing a task always
 * captures a note explaining what was done; if the task requires proof, a file
 * is mandatory. Calls the server `portalCompleteTask`, which re-enforces both. */
export function CompleteTaskSheet({
  open, onClose, taskId, code, requiresAttachment = false,
}: {
  open: boolean;
  onClose: () => void;
  taskId: number;
  code: string;
  requiresAttachment?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, start] = useTransition();

  const canSubmit = body.trim().length > 0 && (!requiresAttachment || !!file);

  function submit() {
    if (!canSubmit) return;
    const fd = new FormData();
    fd.set("taskId", String(taskId));
    fd.set("code", code);
    fd.set("body", body.trim());
    if (file) fd.set("attachment", file);
    start(async () => {
      const res = await portalCompleteTask(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Task completed.", { tone: "success" });
      setBody(""); setFile(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Mark complete"
      icon={<CheckCircle2 size={17} />}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={busy || !canSubmit}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-success py-3 text-sm font-medium text-white transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Complete task · {code}
        </button>
      }
    >
      <div className="flex flex-col gap-3.5">
        <p className="text-xs text-fg-muted">Finishing this task records what was done — a quick note keeps everyone in the loop.</p>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-fg-muted">What was done?</label>
          <CaretTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Explain what you completed…"
            wrapperClassName="rounded-xl ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40"
            className="px-3.5 py-3 text-sm"
          />
        </div>
        <div>
          <label className="flex items-center gap-2 rounded-xl bg-bg-subtle/40 px-3.5 py-3 text-sm text-fg-muted ring-1 ring-border cursor-pointer">
            <Paperclip size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {file ? file.name : requiresAttachment ? "Attach proof (required)" : "Attach a file (optional)"}
            </span>
            <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
          </label>
          {requiresAttachment && !file && (
            <p className="mt-1.5 text-[11px] text-warn">This task needs a file attached before it can be completed.</p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
