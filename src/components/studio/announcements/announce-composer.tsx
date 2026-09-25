"use client";

/**
 * "New announcement" — the Studio composer (mockup board Announcements, the
 * right-hand sheet). The same form fields as the old composer, so the same
 * server actions take it unchanged: the owner's `saveAnnouncementAction`
 * (draft / publish / schedule), or `portalCreateAnnouncement` for a director or
 * manager, which posts straight away and keeps them inside their own people.
 * ORI drafts and translates; nothing is sent until Publish is pressed.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2, Megaphone, Sparkles } from "lucide-react";
import { StudioSheet } from "@/components/studio/sheet";
import { stBtn } from "@/components/studio/kit";
import { useToast } from "@/components/toast";
import { ANNOUNCEMENT_TYPES, AUDIENCE_KINDS, type AudienceKind } from "@/lib/announcements-shared";
import { saveAnnouncementAction, portalCreateAnnouncement, draftAnnouncementAction, translateAnnouncementAction } from "@/app/announcements/actions";
import { cn } from "@/lib/cn";

export type Opt = { value: string; label: string };
export type ComposerLists = { companies: Opt[]; departments: Opt[]; sites: Opt[]; roles: Opt[]; personTypes: Opt[]; people: Opt[] };

const FIELD = "st-field w-full rounded-[10px] px-3 text-[13px] outline-none";
const LABEL = "text-xs text-[var(--sh-muted,var(--st-muted))]";

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("h-8 rounded-[9px] border px-3 text-xs transition-colors", on ? "border-[var(--sh-fg,var(--st-ink))] bg-[var(--sh-fg,var(--st-ink))] text-[var(--sh-bg,var(--st-surface))]" : "border-[var(--sh-chip-line,var(--st-line))] hover:bg-[var(--sh-hover,var(--st-page))]")}>
      {children}
    </button>
  );
}

function Tick({ name, value, label, hint, defaultChecked }: { name: string; value?: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[var(--sh-chip-line,var(--st-line))] text-transparent peer-checked:border-[var(--sh-fg,var(--st-ink))] peer-checked:bg-[var(--sh-fg,var(--st-ink))] peer-checked:text-[var(--sh-bg,#fff)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--st-blue)]">
        <Check size={11} strokeWidth={3} />
      </span>
      {label}{hint && <span className="text-[11px] text-[var(--sh-muted,var(--st-muted))]">{hint}</span>}
    </label>
  );
}

export function AnnounceComposer({ open, onClose, mode, lists, allowedKinds, seed }: {
  open: boolean;
  onClose: () => void;
  mode: "admin" | "portal";
  lists: ComposerLists;
  allowedKinds?: AudienceKind[];
  /** What was typed in the "Write one with ORI" box — drafted on open. */
  seed?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [type, setType] = useState("operational");
  const [kind, setKind] = useState<AudienceKind>(allowedKinds?.[0] ?? "all");
  const [values, setValues] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ai, setAi] = useState<null | "draft" | "sw" | "en">(null);
  const kinds = AUDIENCE_KINDS.filter((k) => !allowedKinds || allowedKinds.includes(k.value));
  const meta = AUDIENCE_KINDS.find((k) => k.value === kind);
  const options: Opt[] = kind === "company" ? lists.companies : kind === "department" ? lists.departments : kind === "site" ? lists.sites
    : kind === "role" ? lists.roles : kind === "person_type" ? lists.personTypes : kind === "people" ? lists.people : [];

  async function draft(text: string) {
    if (!text.trim()) return;
    setAi("draft");
    const r = await draftAnnouncementAction(text.trim()).catch(() => null);
    setAi(null);
    if (!r || !r.ok) { toast(r && !r.ok ? r.error : "ORI couldn't draft that — write it yourself.", { tone: "warn" }); return; }
    setTitle(r.title); setBody(r.body);
  }
  async function translate(to: "sw" | "en") {
    if (!body.trim()) return;
    setAi(to);
    const r = await translateAnnouncementAction(body, to).catch(() => null);
    setAi(null);
    if (!r || !r.ok) { toast(r && !r.ok ? r.error : "Couldn't translate.", { tone: "warn" }); return; }
    setBody(r.text);
  }

  // Opened from the ORI box: draft straight away.
  useEffect(() => {
    if (!open) return;
    if (seed?.trim()) { setPrompt(seed); void draft(seed); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(action: "draft" | "publish") {
    const el = form.current;
    if (!el) return;
    if (!title.trim()) { toast("Give it a title.", { tone: "warn" }); return; }
    if (meta?.needsValues && values.length === 0) { toast(`Choose ${meta.label.toLowerCase().replace(/^a |^an /, "which ")}.`, { tone: "warn" }); return; }
    const fd = new FormData(el);
    fd.set("action", action);
    start(async () => {
      const res = mode === "admin" ? await saveAnnouncementAction(fd) : await portalCreateAnnouncement(fd);
      if (!res.ok) { toast(res.error, { tone: "warn" }); return; }
      toast(action === "draft" ? "Saved as a draft." : "Published — it reaches people now.", { tone: "success" });
      setTitle(""); setBody(""); setPrompt(""); setValues([]); setKind(allowedKinds?.[0] ?? "all"); setType("operational");
      onClose();
      router.refresh();
    });
  }

  return (
    <StudioSheet open={open} onClose={onClose} title="New announcement" icon={<Megaphone size={16} />} width={560}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 px-3 text-[13px] text-[var(--sh-sub,var(--st-sub))]">Cancel</button>
          {mode === "admin" && <button type="button" disabled={pending} onClick={() => submit("draft")} className={cn(stBtn.ghost, "h-9 text-[13px]")}>Save draft</button>}
          <button type="button" disabled={pending} onClick={() => submit("publish")} className={cn(stBtn.dark, "h-9 text-[13px]")}>{pending && <Loader2 size={13} className="animate-spin" />}Publish</button>
        </div>
      }>
      <form ref={form} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
        <div className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--sh-fg,var(--st-ink))] pl-3 pr-1.5">
          <Sparkles size={14} className="shrink-0" />
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void draft(prompt); } }}
            placeholder="Say what people should know — ORI drafts it"
            className="bare-field h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none" />
          <button type="button" disabled={!prompt.trim() || ai !== null} onClick={() => draft(prompt)} className="flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--sh-fg,var(--st-ink))] px-2.5 text-xs font-medium text-[var(--sh-bg,#fff)] disabled:opacity-40">
            {ai === "draft" && <Loader2 size={12} className="animate-spin" />}Draft with AI
          </button>
        </div>

        <label className="flex flex-col gap-1.5"><span className={LABEL}>Title</span>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className={cn(FIELD, "h-10 text-[14px] font-medium")} />
        </label>
        <label className="flex flex-col gap-1.5"><span className={LABEL}>Message</span>
          <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={cn(FIELD, "resize-y py-2.5 leading-relaxed")} />
          <span className="flex gap-1.5">
            {(["sw", "en"] as const).map((to) => (
              <button key={to} type="button" disabled={!body.trim() || ai !== null} onClick={() => translate(to)} className="flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--sh-hover,var(--st-page))] px-2.5 text-xs disabled:opacity-40">
                {ai === to ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}{to === "sw" ? "Translate to Swahili" : "To English"}
              </button>
            ))}
          </span>
        </label>

        <div className="flex flex-col gap-1.5"><span className={LABEL}>Type</span>
          <input type="hidden" name="type" value={type} />
          <div className="flex flex-wrap gap-1.5">{ANNOUNCEMENT_TYPES.map((t) => <Chip key={t.value} on={type === t.value} onClick={() => setType(t.value)}>{t.label}</Chip>)}</div>
        </div>

        <div className="flex flex-col gap-1.5"><span className={LABEL}>Who sees it</span>
          <input type="hidden" name="audienceKind" value={kind} />
          <div className="flex flex-wrap gap-1.5">{kinds.map((k) => <Chip key={k.value} on={kind === k.value} onClick={() => { setKind(k.value); setValues([]); }}>{k.label}</Chip>)}</div>
          {meta?.needsValues && (
            <div className="st-scroll mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-[10px] border border-[var(--sh-chip-line,var(--st-line))] p-2">
              {options.length === 0 && <span className="text-xs text-[var(--sh-muted,var(--st-muted))]">Nothing to choose from.</span>}
              {options.map((o) => {
                const on = values.includes(o.value);
                return <Chip key={o.value} on={on} onClick={() => setValues((v) => (on ? v.filter((x) => x !== o.value) : [...v, o.value]))}>{o.label}</Chip>;
              })}
            </div>
          )}
          {values.map((v) => <input key={v} type="hidden" name="audienceValues" value={v} />)}
        </div>

        <div className="flex flex-col gap-2">
          <Tick name="pinned" label="Pin to the top" />
          <Tick name="requireAck" label="Ask people to acknowledge it" />
          {mode === "admin" && <Tick name="takeover" label="Urgent takeover" hint="a full-screen card when they open the portal" />}
        </div>

        {mode === "admin" && <>
          <div className="flex flex-col gap-1.5"><span className={LABEL}>Also send by</span>
            <div className="flex gap-4"><Tick name="deliverChannels" value="email" label="Email draft" /><Tick name="deliverChannels" value="whatsapp" label="WhatsApp draft" /></div>
            <span className="text-[11px] text-[var(--sh-muted,var(--st-muted))]">Drafts go to the Outbox for you to send. Push and in-app are automatic.</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5"><span className={LABEL}>Publish at (optional)</span><input type="datetime-local" name="publishAt" className={cn(FIELD, "h-10")} /></label>
            <label className="flex flex-col gap-1.5"><span className={LABEL}>Expires (optional)</span><input type="datetime-local" name="expiresAt" className={cn(FIELD, "h-10")} /></label>
          </div>
        </>}
      </form>
    </StudioSheet>
  );
}
