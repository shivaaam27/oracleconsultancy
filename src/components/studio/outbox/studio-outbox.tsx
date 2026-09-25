"use client";

/**
 * Studio Outbox (mockup `Outbox`, Sept 2026) — the owner's and a director's.
 *
 * Header (All · Reminders · Drafts · Sent, the sent log, send all), two dark
 * cards (today's chasing; automatic sending), then a list beside the one item
 * it has open. A reminder is one person and every open task of theirs; a draft
 * is a saved message; sent is today's log.
 *
 * `viewer="director"`: their companies only (the page scopes the data), no saved
 * drafts, no snoozing, no undo, and the automation card is there to read — the
 * server refuses all of it anyway (`app/outbox/actions.ts`).
 */
import { PersonFace } from "@/components/studio/face";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronLeft, Copy, History, Loader2, Mail, MessageCircle, Search, Send, X } from "lucide-react";
import type { OutboxDraft, Channel } from "@/lib/outbox/gen";
import type { OutboxDraftRow } from "@/lib/outbox/drafts";
import type { LastChased } from "@/lib/outbox/history";
import { labelForSource } from "@/lib/automation/meta";
import { waLink, linkFor } from "@/lib/outbox/links";
import { taskHref } from "@/lib/task-href";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, Ring, StudioPill, stBtn } from "@/components/studio/kit";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { avatarTint, initials, ago, deadlineWords } from "@/components/studio/tasks/task-words";
import {
  recordSent, snoozePerson, unsnoozePerson, sendReminderEmail,
  sendAllEmailDrafts, sendDraft, sendDraftEmail, updateDraft, deleteDraft,
} from "@/app/outbox/actions";

export type SentRow = { id: number; channel: string; recipientName: string | null; recipientContact: string | null; sentAt: string | null };
type Auto = {
  paused: boolean; allOff: boolean; windowStartHour: number; windowEndHour: number; dailyCap: number;
  categories: { label: string; mode: string }[];
};

type Seg = "all" | "reminders" | "drafts" | "sent";
type Base = { key: string; name: string; sub: string; dot: string; companies: string[]; rank: number };
type Item =
  | (Base & { kind: "reminder"; draft: OutboxDraft; overdue: number })
  | (Base & { kind: "draft"; row: OutboxDraftRow; auto: boolean })
  | (Base & { kind: "sent"; entry: SentRow });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isLate = (t: OutboxDraft["tasks"][number]) => t.flag === "overdue" || t.flag === "escalate-now";
const chLabel = (c: string | null | undefined) => (c?.toUpperCase() === "WHATSAPP" ? "WhatsApp" : c?.toUpperCase() === "EMAIL" ? "Email" : c?.toUpperCase() === "SMS" ? "SMS" : c || "—");
const timeOf = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" }) : "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const plain = (s: string) => s.replace(/\*([^*\n]+)\*/g, "$1");
const MODE: Record<string, string> = { off: "off", prepare: "drafts", auto: "sends" };

export function StudioOutbox({
  viewer, reminders, drafts, sent, log, lastChased, snoozed, doneToday, automation, scopeLabel,
}: {
  viewer: "owner" | "director";
  reminders: OutboxDraft[];
  drafts: OutboxDraftRow[];
  sent: SentRow[];
  log: { label: string; entries: SentRow[] }[];
  lastChased: Record<string, LastChased>;
  snoozed: { id: number; name: string }[];
  doneToday: number;
  automation: Auto;
  scopeLabel: string;
}) {
  const owner = viewer === "owner";
  const router = useRouter();
  const { toast } = useToast();
  const [seg, setSeg] = useState<Seg>("all");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [selKey, setSelKey] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  // Phone: the open item covers the screen, with a way back (mockup M_Outbox).
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [bulk, startBulk] = useTransition();
  const body = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  useFitFrame(body, { minimum: 460 });

  const all = useMemo<Item[]>(() => {
    const r: Item[] = reminders.map((d) => {
      const overdue = d.tasks.filter(isLate).length;
      const chased = lastChased[d.recipientName.trim().toLowerCase()];
      return {
        kind: "reminder", key: `r:${d.recipientName}`, name: d.recipientName, draft: d, overdue,
        sub: `${plural(d.tasks.length, "task")}${overdue ? ` · ${overdue} overdue` : ""} · ${chased ? `chased ${ago(chased.sentAt)}` : "not chased yet"}`,
        dot: overdue >= 3 ? "var(--st-late)" : overdue ? "var(--st-soon)" : "var(--st-ok)",
        companies: [...new Set(d.tasks.map((t) => t.companyName).filter(Boolean))] as string[],
        rank: overdue ? -overdue : 1,
      };
    });
    const dr: Item[] = drafts.map((row) => {
      const auto = !!row.source?.startsWith("automation");
      return {
        kind: "draft", key: `d:${row.id}`, row, auto,
        name: row.recipientName || row.recipientContact || "Draft",
        sub: labelForSource(row.source) ?? (row.subject || chLabel(row.channel)),
        dot: "var(--st-violet)", companies: row.company ? [row.company] : [], rank: 2,
      };
    });
    const s: Item[] = sent.map((e) => ({
      kind: "sent", key: `s:${e.id}`, entry: e, name: e.recipientName || "Unknown",
      sub: `Sent ${timeOf(e.sentAt)} · ${chLabel(e.channel)}`, dot: "var(--st-ok)", companies: [], rank: 9,
    }));
    return [...r, ...dr, ...s];
  }, [reminders, drafts, sent, lastChased]);

  const live = all.filter((i) => !removed.has(i.key));
  const counts = {
    all: live.filter((i) => i.kind !== "sent").length,
    reminders: live.filter((i) => i.kind === "reminder").length,
    drafts: live.filter((i) => i.kind === "draft").length,
    sent: all.filter((i) => i.kind === "sent").length,
  };
  const companies = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of all) if (i.kind !== "sent") for (const c of i.companies) m.set(c, (m.get(c) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const needle = q.trim().toLowerCase();
  const shown = live
    .filter((i) => (seg === "sent" ? i.kind === "sent" : i.kind !== "sent" && (seg === "all" || (seg === "reminders") === (i.kind === "reminder"))))
    .filter((i) => !company || i.companies.includes(company))
    .filter((i) => !needle || i.name.toLowerCase().includes(needle) || i.sub.toLowerCase().includes(needle)
      || (i.kind === "draft" && i.row.body.toLowerCase().includes(needle)))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const sel = shown.find((i) => i.key === selKey) ?? shown[0] ?? null;

  function pick(key: string) {
    setSelKey(key);
    if (!window.matchMedia("(min-width: 768px)").matches) setPhoneOpen(true);
  }
  function resolve(key: string) {
    const i = shown.findIndex((x) => x.key === key);
    const next = shown[i + 1] ?? shown[i - 1] ?? null;
    setSelKey(next?.key ?? null);
    setRemoved((s) => new Set(s).add(key));
  }

  const emailDrafts = drafts.filter((d) => d.channel === "EMAIL" && !removed.has(`d:${d.id}`) && (d.recipientContact ?? "").split(/[;,]/).every((a) => EMAIL_RE.test(a.trim()))).length;
  function sendAll() {
    startBulk(async () => {
      const res = await sendAllEmailDrafts();
      if (res.notConfigured && res.sent === 0) { toast("Email sending isn't switched on — open each draft instead.", { tone: "warn", duration: 6000 }); return; }
      toast([`${plural(res.sent, "email")} sent`, res.failed ? `${res.failed} failed` : ""].filter(Boolean).join(" · "), { tone: res.failed ? "warn" : "success", duration: 5000 });
      router.refresh();
    });
  }

  const total = reminders.length + doneToday;
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  const segs: [Seg, string, number][] = [["all", "All", counts.all], ["reminders", "Reminders", counts.reminders], ...(owner ? [["drafts", "Drafts", counts.drafts] as [Seg, string, number]] : []), ["sent", "Sent", counts.sent]];

  return (
    <StudioScope className="space-y-5">
      <StudioHeader
        title="Outbox"
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label="Show">
              {segs.map(([k, l, n]) => (
                <button key={k} type="button" role="tab" aria-selected={seg === k} onClick={() => { setSeg(k); setSelKey(null); }}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors",
                    seg === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l}<span className="tabular-nums text-[var(--st-muted)]">{n}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setLogOpen(true)} aria-label="Sent log" className={stBtn.ghost}><History size={14} /><span className="hidden sm:inline">Sent log</span></button>
            {owner && emailDrafts > 0 && (
              <button type="button" onClick={sendAll} disabled={bulk} title="Send every email draft now" className={stBtn.dark}>
                {bulk ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send all email · {emailDrafts}
              </button>
            )}
          </>
        }
      />

      <StudioCardRow>
        <StudioCard className="min-h-[170px] md:min-h-[210px]">
          <CardHead label="Today" right={<span className="text-[var(--st-on-card-muted)]">{scopeLabel}</span>} />
          <div className="mt-auto flex items-end gap-7 pt-4">
            <div>
              <span className="contents sm:hidden"><BigNumber value={counts.reminders} unit="to chase" size={56} /></span>
              <span className="hidden sm:contents"><BigNumber value={counts.reminders} unit="to chase" /></span>
              <div className="mt-3 flex flex-wrap gap-3.5 text-xs text-[var(--st-on-card-muted)]">
                {owner && <span>{plural(counts.drafts, "draft")} waiting</span>}
                <span>{sent.length} sent</span>
                {owner && snoozed.length > 0 && <span>{snoozed.length} skipped today</span>}
              </div>
            </div>
            <span className="flex-1" />
            <span className="contents sm:hidden"><Ring value={pct} size={84} stroke={9} track="var(--st-card-line)" label={`${pct}%`} sub="done" /></span>
            <span className="hidden sm:contents"><Ring value={pct} size={116} stroke={12} track="var(--st-card-line)" label={`${pct}%`} sub="done today" /></span>
          </div>
        </StudioCard>

        <StudioCard texture="hatch" className="min-h-[210px]">
          <CardHead
            label="Automatic sending"
            right={automation.paused ? <StudioPill onCard dot="var(--st-soon)" className="text-[#F5B94E]">Paused</StudioPill>
              : automation.allOff ? <StudioPill onCard>Off</StudioPill>
              : <StudioPill onCard dot="var(--st-ok)">On</StudioPill>}
          />
          <div className="mt-auto grid grid-cols-1 items-end gap-x-6 gap-y-3 pt-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            {/* Phone: the categories two across, so the card matches its neighbour. */}
            <div className="max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-4">
              {automation.categories.map((c) => (
                <div key={c.label} className="flex min-w-0 items-center justify-between gap-2 border-b border-[#222428] py-[5px] text-xs last:border-0 max-sm:[&:nth-last-child(2)]:border-0">
                  <span className="truncate text-[#C9CBCF]">{c.label.replace(/\s*\(to you\)$/, "")}</span>
                  <span className="shrink-0 text-[var(--st-on-card-muted)]">{automation.paused && c.mode !== "off" ? "held" : MODE[c.mode] ?? c.mode}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs leading-[1.45] text-[var(--st-muted)] max-sm:line-clamp-2">
                {automation.paused ? "Nothing goes out on its own while paused." : automation.allOff ? "Nothing is switched on." : `Sends ${String(automation.windowStartHour).padStart(2, "0")}:00–${String(automation.windowEndHour).padStart(2, "0")}:00, up to ${automation.dailyCap} a day.`}
                {owner ? " The send window, daily cap and each category live in Settings." : " These are set by the administrator."}
              </div>
              {owner && <Link href="/settings#email-automation" className={cn(stBtn.onCard, "h-8 justify-center")}>Manage in Settings</Link>}
            </div>
          </div>
        </StudioCard>
      </StudioCardRow>

      <div ref={body} className="flex flex-col gap-5 md:flex-row">
        {/* ── The list */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)] md:max-h-[72vh] md:w-[300px] md:shrink-0 lg:max-h-none lg:w-[420px]">
          <div className="flex items-center gap-2 border-b border-[var(--st-line-soft)] px-3.5 py-3">
            <label className="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-[var(--st-page)] px-2.5 text-[var(--st-muted)]">
              <Search size={14} /><span className="sr-only">Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={owner ? "Search people or drafts" : "Search people"}
                className="bare-field w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none placeholder:text-[var(--st-muted)]" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="hover:text-[var(--st-ink)]"><X size={13} /></button>}
            </label>
            {companies.length > 1 && <CompanyChip value={company} options={companies} onChange={(c) => { setCompany(c); setSelKey(null); }} />}
          </div>
          <div className="st-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
            {shown.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-[var(--st-muted)]">
                {seg === "sent" ? "Nothing sent today yet." : needle || company ? "Nothing matches." : "Nobody to chase. All clear."}
              </div>
            ) : shown.map((i) => (
              <button key={i.key} type="button" onClick={() => pick(i.key)} aria-current={sel?.key === i.key || undefined}
                className={cn("grid w-full grid-cols-[10px_32px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-xl px-2.5 py-[9px] text-left transition-colors",
                  sel?.key === i.key ? "bg-[var(--st-page)]" : "hover:bg-[color-mix(in_srgb,var(--st-page)_55%,transparent)]")}>
                <span className="h-2 w-2 rounded-full" style={{ background: i.dot }} />
                <Face name={i.name} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{i.name}</span>
                  <span className="block truncate text-[11px] text-[var(--st-muted)]">{i.sub}</span>
                </span>
                <span className="rounded-md bg-[var(--st-page)] px-[7px] py-[3px] text-[11px] text-[var(--st-sub)]">
                  {i.kind === "reminder" ? "Reminder" : i.kind === "draft" ? "Draft" : "Sent"}
                </span>
              </button>
            ))}
          </div>
          <SnoozedFoot owner={owner} snoozed={snoozed} total={counts.all} />
        </div>

        {/* ── The item */}
        <div ref={detail} className={cn(
          "min-w-0 flex-1 overflow-y-auto bg-[var(--st-surface)] px-[22px] py-5 md:min-h-[420px] md:rounded-[20px]",
          // phone: hidden until an item is picked, then it covers the screen
          phoneOpen ? "max-md:fixed max-md:inset-0 max-md:z-[46] max-md:pt-0 max-md:pb-0" : "max-md:hidden",
        )}>
          {phoneOpen && sel && (
            <div className="sticky top-0 z-10 -mx-[22px] mb-3 flex items-center justify-between bg-[var(--st-surface)] px-4 pb-2 pt-[calc(12px+env(safe-area-inset-top))] md:hidden">
              <button type="button" onClick={() => setPhoneOpen(false)} className="flex h-10 items-center gap-1 text-sm text-[var(--st-sub)]"><ChevronLeft size={17} />Outbox</button>
              <span className="text-xs text-[var(--st-muted)]">{shown.findIndex((x) => x.key === sel.key) + 1} of {shown.length}</span>
            </div>
          )}
          {!sel ? (
            <div className="grid h-full place-items-center text-[13px] text-[var(--st-muted)]">Pick someone on the left to see their message.</div>
          ) : sel.kind === "reminder" ? (
            <ReminderDetail key={sel.key} owner={owner} draft={sel.draft} overdue={sel.overdue}
              chased={lastChased[sel.draft.recipientName.trim().toLowerCase()] ?? null} onDone={() => resolve(sel.key)} />
          ) : sel.kind === "draft" ? (
            <DraftDetail key={sel.key} row={sel.row} auto={sel.auto} onGone={() => resolve(sel.key)} />
          ) : (
            <SentDetail entry={sel.entry} />
          )}
        </div>
      </div>

      {logOpen && <SentLog log={log} onClose={() => setLogOpen(false)} />}
    </StudioScope>
  );
}

/** Their face: small ones in the list peek then show initials; the open
 *  reminder's big one stays. */
function Face({ name, size }: { name: string; size: number }) {
  return <PersonFace name={name} size={size} peek={size < 40} />;
}

function CompanyChip({ value, options, onChange }: { value: string | null; options: [string, number][]; onChange: (c: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const item = "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[var(--st-page)]";
  return (
    <div ref={root} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(stBtn.chip, "max-w-[150px]")}>
        <span className="truncate">{value ?? "All companies"}</span><ChevronDown size={13} className="shrink-0 text-[var(--st-muted)]" />
      </button>
      {open && (
        <div data-st-menu className="st-pop absolute right-0 top-10 z-30 max-h-[320px] w-[260px] overflow-y-auto rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.14)]">
          <button type="button" onClick={() => { onChange(null); setOpen(false); }} className={item}>
            <span>All companies</span>{!value && <Check size={13} />}
          </button>
          {options.map(([c, n]) => (
            <button key={c} type="button" onClick={() => { onChange(c); setOpen(false); }} className={item}>
              <span className="truncate">{c}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--st-muted)]">{n}{value === c && <Check size={13} className="text-[var(--st-ink)]" />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SnoozedFoot({ owner, snoozed, total }: { owner: boolean; snoozed: { id: number; name: string }[]; total: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  return (
    <div className="shrink-0 border-t border-[var(--st-line-soft)] text-xs text-[var(--st-muted)]">
      {open && snoozed.length > 0 && (
        <div className="max-h-40 overflow-y-auto px-4 pt-2">
          {snoozed.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="truncate text-[var(--st-ink)]">{s.name}</span>
              <button type="button" disabled={pending} className="text-[var(--st-sub)] underline-offset-2 hover:underline"
                onClick={() => start(async () => {
                  const r = await unsnoozePerson(s.id);
                  if (!r.ok) { toast(r.error || "Couldn't bring them back.", { tone: "danger" }); return; }
                  toast(`${s.name} is back in today's list.`, { tone: "success" });
                  router.refresh();
                })}>Bring back</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2.5">
        {owner ? (
          <button type="button" disabled={!snoozed.length} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 enabled:hover:text-[var(--st-ink)]">
            Skipped today · {snoozed.length}{snoozed.length > 0 && <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />}
          </button>
        ) : <span>Reminders for your companies</span>}
        <span>{total} in all</span>
      </div>
    </div>
  );
}

const BTN = "inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 text-[13px] transition-colors hover:bg-[var(--st-page)] disabled:opacity-50";
const BTN_DARK = "inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[var(--st-ink)] px-[18px] text-[13px] font-semibold text-[var(--st-page)] transition-opacity hover:opacity-90 disabled:opacity-50";
const WELL = { background: "color-mix(in srgb, var(--st-page) 45%, var(--st-surface))" };

function pickChannel(d: OutboxDraft): Channel {
  const pref = (d.preferredChannel?.toUpperCase() as Channel) || null;
  if (pref && d.contactByChannel[pref] === "Complete") return pref;
  if (d.contactByChannel.WHATSAPP === "Complete") return "WHATSAPP";
  if (d.contactByChannel.EMAIL === "Complete") return "EMAIL";
  if (d.contactByChannel.SMS === "Complete") return "SMS";
  return pref || "WHATSAPP";
}

function ReminderDetail({ owner, draft, overdue, chased, onDone }: {
  owner: boolean; draft: OutboxDraft; overdue: number; chased: LastChased | null; onDone: () => void;
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState(() => plain(draft.messages.WHATSAPP));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const channel = pickChannel(draft);
  // Untouched, WhatsApp gets the original with its *bold*; edited, what was typed.
  const wa = waLink(draft.whatsapp, message === plain(draft.messages.WHATSAPP) ? draft.messages.WHATSAPP : message);
  const dueSoon = draft.tasks.filter((t) => t.flag === "due-soon").length;
  const contact = channel === "EMAIL" ? draft.email : channel === "WHATSAPP" ? draft.whatsapp : draft.phone;

  const undoToast = (label: string, token?: string) => {
    toast(label, {
      tone: "success", duration: token ? 10000 : 4000,
      action: token ? { label: "Undo", onClick: async () => { const r = await callUndo(token); toast(r.message, { tone: r.ok ? "success" : "warn", duration: 3000 }); if (r.ok) window.location.reload(); } } : undefined,
    });
  };
  const run = (id: string, fn: () => Promise<void>) => { setBusy(id); start(async () => { try { await fn(); } finally { setBusy(null); } }); };

  async function markDone(ch: Channel, label: string) {
    const fd = new FormData();
    fd.set("channel", ch);
    fd.set("name", draft.recipientName);
    fd.set("taskCodes", JSON.stringify(draft.tasks.map((t) => t.code)));
    fd.set("message", message);
    fd.set("contactStatus", draft.contactByChannel[ch]);
    fd.set("recipientContact", (ch === "EMAIL" ? draft.email : ch === "WHATSAPP" ? draft.whatsapp : draft.phone) || "");
    const res = await recordSent(fd);
    if (res.ok) { undoToast(label, res.undoToken); onDone(); return; }
    if (res.reason === "duplicate") { toast(`${draft.recipientName} was already marked done today.`, { tone: "warn" }); onDone(); return; }
    toast(res.error || "Couldn't mark it done.", { tone: "danger" });
  }

  const onWhatsApp = () => {
    if (!wa) { toast("No WhatsApp number for this person.", { tone: "warn" }); return; }
    window.open(wa, "_blank", "noopener");
    run("wa", () => markDone("WHATSAPP", `Opened WhatsApp and marked done for ${draft.recipientName}.`));
  };
  const onCopyDone = () => run("copy", async () => {
    await navigator.clipboard.writeText(message);
    await markDone(channel, `Copied and marked done for ${draft.recipientName}.`);
  });
  const onEmail = () => {
    if (!draft.personId) { toast("This person isn't in the directory.", { tone: "warn" }); return; }
    run("email", async () => {
      const res = await sendReminderEmail(draft.personId!, note.trim() || undefined);
      if (res.ok) { toast(`Email sent to ${draft.recipientName}.`, { tone: "success" }); onDone(); return; }
      toast(res.reason === "no-email" ? "No email address on file for this person."
        : res.reason === "no-tasks" ? "No open tasks to remind about."
        : res.reason === "not-configured" ? "Email sending isn't switched on — use Copy instead."
        : res.error || "Couldn't send the email.", { tone: res.reason === "not-configured" || res.reason === "no-email" ? "warn" : "danger" });
    });
  };
  const onSkip = () => {
    if (!draft.personId) return;
    run("skip", async () => {
      const res = await snoozePerson(draft.personId!);
      if (!res.ok) { toast(res.error || "Couldn't skip.", { tone: "danger" }); return; }
      undoToast(`Skipped ${draft.recipientName} for today.`, res.undoToken);
      onDone();
    });
  };

  const tiles: [number, string, string][] = [
    [draft.tasks.length, "open", "var(--st-ink)"],
    [overdue, "overdue", overdue ? "var(--st-late-text)" : "var(--st-ink)"],
    [dueSoon, "due soon", dueSoon ? "var(--st-soon-text)" : "var(--st-ink)"],
  ];
  const spin = (id: string) => busy === id && <Loader2 size={14} className="animate-spin" />;

  return (
    <div className="st-pop flex h-full flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Face name={draft.recipientName} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-medium tracking-[-0.01em]">{draft.recipientName}</div>
          <div className="truncate text-xs text-[var(--st-muted)]">
            {chased ? `Last chased ${ago(chased.sentAt)} · ${chLabel(chased.channel)}` : "Not chased yet"}
            {contact ? ` · ${contact}` : " · no contact details"}
          </div>
        </div>
        <div className="flex gap-2 max-lg:w-full">
          {tiles.map(([n, l, c]) => (
            <div key={l} className="min-w-[70px] rounded-xl bg-[var(--st-page)] px-3 py-2 max-lg:flex-1">
              <div className="text-xl tabular-nums tracking-[-0.02em]" style={{ color: c }}>{n}</div>
              <div className="text-[11px] text-[var(--st-label)]">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="text-xs text-[var(--st-label)]">In this reminder</div>
          <div className="st-scroll flex min-h-0 flex-col gap-1.5 overflow-y-auto">
            {draft.tasks.map((t) => {
              const due = deadlineWords(t);
              return (
                <Link key={t.code} href={taskHref(t.code)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[10px] border border-[var(--st-line-soft)] px-2.5 py-2 transition-colors hover:border-[var(--st-line)]">
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-[11px] text-[var(--st-muted)]">{t.code}</span> <span className="text-[13px]">{t.actionItem}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs" style={{ color: due.onPage }}>{due.words}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <div className="text-xs text-[var(--st-label)]">Message — edit anything before it goes</div>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message"
            className="bare-field st-scroll min-h-[180px] flex-1 resize-none rounded-xl border border-[var(--st-line-soft)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--st-ink)] outline-none focus:border-[var(--st-line)]" style={WELL} />
          {draft.email && (
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a personal line at the top (email only)…"
              className="bare-field h-9 rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] text-[var(--st-ink)] outline-none placeholder:text-[var(--st-muted)] focus:border-[var(--st-muted)]" />
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-[22px] max-md:grid max-md:grid-cols-2 max-md:border-t max-md:border-[var(--st-line)] max-md:bg-[var(--st-surface)] max-md:px-3 max-md:pb-[calc(10px+env(safe-area-inset-bottom))] max-md:pt-2.5 max-md:[&>button]:justify-center">
        {owner && <button type="button" onClick={onSkip} disabled={!!busy || !draft.personId} title="Hide this person until tomorrow" className={BTN}>{spin("skip")}Skip today</button>}
        <button type="button" onClick={onCopyDone} disabled={!!busy} className={BTN}>{spin("copy") || <Copy size={14} />}Copy &amp; done</button>
        <button type="button" onClick={() => run("done", () => markDone(channel, `Marked done for ${draft.recipientName}.`))} disabled={!!busy} className={BTN}>{spin("done")}Mark done</button>
        <span className="flex-1 max-md:hidden" />
        {wa && <button type="button" onClick={onWhatsApp} disabled={!!busy} className={draft.email ? BTN : BTN_DARK}>{spin("wa") || <MessageCircle size={15} />}WhatsApp</button>}
        {draft.email && <button type="button" onClick={onEmail} disabled={!!busy} title="Send the branded reminder email, with your line at the top" className={BTN_DARK}>{spin("email") || <Mail size={15} />}Send email</button>}
      </div>
    </div>
  );
}

function DraftDetail({ row, auto, onGone }: { row: OutboxDraftRow; auto: boolean; onGone: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState(row.body);
  const [subject, setSubject] = useState(row.subject ?? "");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const email = row.channel === "EMAIL";
  const canEmail = email && (row.recipientContact ?? "").split(/[;,]/).every((a) => EMAIL_RE.test(a.trim())) && !!row.recipientContact;
  const link = linkFor(row.channel, row.recipientContact, subject, body);
  const source = labelForSource(row.source);
  const run = (id: string, fn: () => Promise<void>) => { setBusy(id); start(async () => { try { await fn(); } finally { setBusy(null); } }); };
  const save = () => {
    if (body !== row.body || subject !== (row.subject ?? "")) void updateDraft(row.id, body, email ? subject : null);
  };
  const spin = (id: string) => busy === id && <Loader2 size={14} className="animate-spin" />;

  return (
    <div className="st-pop flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StudioPill dot={auto ? "var(--st-violet)" : "var(--st-blue)"}>{auto ? "Written by an automation" : "Saved draft"}</StudioPill>
        <span className="min-w-0 truncate text-xs text-[var(--st-muted)]">
          {[source, `to ${row.recipientName || row.recipientContact || "—"}`, chLabel(row.channel), row.recipientContact].filter(Boolean).join(" · ")}
        </span>
      </div>
      {email && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--st-label)]">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={save}
            className="bare-field h-[38px] rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] text-[var(--st-ink)] outline-none focus:border-[var(--st-muted)]" />
        </label>
      )}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={save} aria-label="Message"
        className="bare-field st-scroll min-h-[220px] flex-1 resize-none rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] px-3.5 py-3 text-[13px] leading-[1.55] text-[var(--st-ink)] outline-none focus:border-[var(--st-muted)]" />
      <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:sticky max-md:bottom-0 max-md:-mx-[22px] max-md:border-t max-md:border-[var(--st-line)] max-md:bg-[var(--st-surface)] max-md:px-3 max-md:pb-[calc(10px+env(safe-area-inset-bottom))] max-md:pt-2.5">
        <button type="button" disabled={!!busy} className={cn(BTN, "border-[var(--st-bad-line)] text-[var(--st-late-text)]")}
          onClick={() => run("discard", async () => { const r = await deleteDraft(row.id); if (!r.ok) { toast(r.error || "Couldn't discard.", { tone: "danger" }); return; } toast("Draft discarded.", { duration: 3000 }); onGone(); })}>
          {spin("discard")}Discard
        </button>
        <button type="button" className={BTN} onClick={async () => { await navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}
        </button>
        <button type="button" disabled={!!busy} className={BTN}
          onClick={() => { save(); run("sent", async () => { const r = await sendDraft(row.id); if (!r.ok) { toast(r.error || "Couldn't mark it sent.", { tone: "danger" }); return; } toast(`Marked sent to ${row.recipientName ?? "them"}.`, { tone: "success" }); onGone(); }); }}>
          {spin("sent")}Mark sent
        </button>
        <span className="flex-1" />
        {link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={save} className={canEmail ? BTN : BTN_DARK}>Open {chLabel(row.channel)}</a>}
        {canEmail && (
          <button type="button" disabled={!!busy} className={BTN_DARK}
            onClick={() => { save(); run("email", async () => { const r = await sendDraftEmail(row.id); if (r.ok) { toast(`Email sent to ${row.recipientName ?? row.recipientContact}.`, { tone: "success" }); onGone(); } else toast(r.error || "Couldn't send.", { tone: r.reason === "not-configured" ? "warn" : "danger", duration: 6000 }); }); }}>
            {spin("email") || <Mail size={15} />}{auto ? "Approve & send" : "Send email"}
          </button>
        )}
      </div>
    </div>
  );
}

function SentDetail({ entry }: { entry: SentRow }) {
  return (
    <div className="st-pop flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Face name={entry.recipientName || "?"} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-medium tracking-[-0.01em]">{entry.recipientName || "Unknown"}</div>
          <div className="truncate text-xs text-[var(--st-muted)]">{chLabel(entry.channel)}{entry.recipientContact ? ` · ${entry.recipientContact}` : ""}</div>
        </div>
        <StudioPill dot="var(--st-ok)">Sent {timeOf(entry.sentAt)}</StudioPill>
      </div>
      <p className="text-[13px] text-[var(--st-sub)]">This went out earlier today. The sent log keeps the last week.</p>
    </div>
  );
}

function SentLog({ log, onClose }: { log: { label: string; entries: SentRow[] }[]; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[45]" role="dialog" aria-label="Sent log">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.35)]" />
      <div className="studio st-pop absolute bottom-[calc(var(--foot-h)+env(safe-area-inset-bottom)+8px)] right-3 top-3 flex w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)] text-[var(--st-ink)] shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between border-b border-[var(--st-line-soft)] px-5 py-4">
          <div>
            <div className="text-[15px] font-semibold">Sent log</div>
            <div className="text-xs text-[var(--st-muted)]">The last seven days</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--st-muted)] hover:bg-[var(--st-page)] hover:text-[var(--st-ink)]"><X size={15} /></button>
        </div>
        <div className="st-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {log.length === 0 && <div className="py-10 text-center text-[13px] text-[var(--st-muted)]">Nothing sent in the last week.</div>}
          {log.map((d) => (
            <div key={d.label} className="py-2">
              <div className="px-2 pb-1 text-[11px] uppercase tracking-[0.08em] text-[var(--st-muted)]">{d.label} · {d.entries.length}</div>
              {d.entries.map((e) => (
                <div key={e.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-lg px-2 py-1.5">
                  <Face name={e.recipientName || "?"} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px]">{e.recipientName || "Unknown"}</span>
                    <span className="block truncate text-[11px] text-[var(--st-muted)]">{chLabel(e.channel)}{e.recipientContact ? ` · ${e.recipientContact}` : ""}</span>
                  </span>
                  <span className="text-xs tabular-nums text-[var(--st-muted)]">{timeOf(e.sentAt)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
