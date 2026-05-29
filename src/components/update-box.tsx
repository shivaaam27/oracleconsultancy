"use client";

import { useRef, useState, useTransition } from "react";
import { Send, Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { addTaskUpdate } from "@/app/task/actions";
import { polishDictation } from "@/app/voice/actions";
import { VoiceButton } from "./voice-button";

const STATUSES = ["Not Started","In Progress","Under Review","Blocked","Waiting External","Escalated","Completed","Closed"];

type Props = {
  taskId: number;
  taskCode: string;
  currentStatus: string;
  /** Called after a successful post — used by TaskDrawer to trigger a re-fetch. */
  onSuccess?: () => void;
};

export function UpdateBox({ taskId, taskCode, currentStatus, onSuccess }: Props) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isPolishing, startPolish] = useTransition();
  const [success, setSuccess] = useState(false);
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null);
  const [lastRawVoice, setLastRawVoice] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef("");

  function updateBody(next: string) {
    bodyRef.current = next;
    setBody(next);
  }

  function appendVoice(chunk: string) {
    const next = bodyRef.current ? `${bodyRef.current} ${chunk}` : chunk;
    updateBody(next);
  }

  // Live captions: show committed text + interim in the field without committing it.
  function showVoiceInterim(chunk: string) {
    setBody(bodyRef.current ? `${bodyRef.current} ${chunk}` : chunk);
  }

  function handleVoiceStop() {
    const raw = bodyRef.current;
    if (!raw.trim()) return;
    setLastRawVoice(raw);
    setVoiceInfo("Cleaning dictated update...");
    startPolish(async () => {
      const result = await polishDictation({
        text: raw,
        mode: "update",
        context: `Task ${taskCode}. Current status: ${currentStatus}.`,
      });
      updateBody(result.polished);
      const tidied = result.changes ? ` Tidied ${result.changes} thing${result.changes === 1 ? "" : "s"}.` : "";
      if (result.source === "ai") setVoiceInfo(`Dictation polished by COS.${tidied}`);
      else if (result.source === "no-key") setVoiceInfo("AI is off, so COS applied basic clean-up.");
      else if (result.source === "error") setVoiceInfo("AI clean-up failed, so COS applied basic clean-up.");
      else setVoiceInfo("Dictation cleaned.");
    });
  }

  function handleSubmit() {
    if (!body.trim()) return;
    startTransition(async () => {
      await addTaskUpdate(taskId, taskCode, body, status || undefined);
      updateBody("");
      setStatus("");
      setSuccess(true);
      setVoiceInfo(null);
      setLastRawVoice(null);
      onSuccess?.();
      setTimeout(() => setSuccess(false), 2000);
    });
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-accent" />
        <span className="text-sm font-medium">Post Update</span>
      </div>

      <textarea
        ref={ref}
        rows={2}
        value={body}
        onChange={e => updateBody(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit(); }}
        placeholder="What happened? e.g. Called supplier, confirmed delivery by Friday…"
        className="w-full rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-sm placeholder:text-fg-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 text-fg-muted"
        >
          <option value="">Keep status ({currentStatus})</option>
          {STATUSES.filter(s => s !== currentStatus).map(s => (
            <option key={s} value={s}>Change to: {s}</option>
          ))}
        </select>

        <VoiceButton
          disabled={isPending || isPolishing}
          onResult={appendVoice}
          onInterim={showVoiceInterim}
          onStop={handleVoiceStop}
          title="Dictate update"
          className="border border-border"
        />

        <button
          onClick={handleSubmit}
          disabled={!body.trim() || isPending}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : success ? <CheckCircle2 size={13} /> : <Send size={13} />}
          {isPending ? "Posting…" : success ? "Posted!" : "Post Update"}
        </button>
      </div>
      {(voiceInfo || lastRawVoice) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {isPolishing && <Loader2 size={12} className="animate-spin" />}
          {voiceInfo && <span>{voiceInfo}</span>}
          {lastRawVoice && (
            <button type="button" onClick={() => updateBody(lastRawVoice)} className="text-accent hover:underline">
              Use raw
            </button>
          )}
        </div>
      )}
    </div>
  );
}
