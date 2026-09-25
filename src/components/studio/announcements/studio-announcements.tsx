"use client";

/**
 * Announcements in Studio (26 Sept 2026, mockup boards Announcements +
 * M_Announcements). The owner's noticeboard: what is live and how far it has
 * reached, drafts, scheduled and archived, and a composer ORI can draft into.
 * Every action is the one the old page used (announcements/actions.ts).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Plus, Sparkles } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, Ring, stBtn } from "@/components/studio/kit";
import { StudioSheet } from "@/components/studio/sheet";
import { PersonFace } from "@/components/studio/face";
import { useToast } from "@/components/toast";
import { publishAnnouncementAction, archiveAnnouncementAction, deleteAnnouncementAction, nudgeAnnouncementAction, announcementReceiptsAction } from "@/app/announcements/actions";
import { AnnounceComposer, type ComposerLists } from "./announce-composer";
import { cn } from "@/lib/cn";

export type NoticeRow = {
  id: number;
  title: string;
  body: string;
  typeLabel: string;
  lane: "live" | "drafts" | "sched" | "arch";
  pinned: boolean;
  requireAck: boolean;
  takeover: boolean;
  audienceText: string;
  whenLabel: string;
  subLabel: string;
  stats: { seen: number; ack: number; total: number };
};

const LANES: { id: NoticeRow["lane"]; label: string }[] = [
  { id: "live", label: "Live" }, { id: "drafts", label: "Drafts" }, { id: "sched", label: "Scheduled" }, { id: "arch", label: "Archived" },
];

function Pill({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return <span className="inline-flex h-6 items-center gap-1.5 rounded-lg bg-[var(--st-page)] px-2 text-[11px]">{dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}{children}</span>;
}
function Bar({ label, n, total, color }: { label: string; n: number; total: number; color: string }) {
  return (
    <div className="min-w-0">
      <div className="flex justify-between gap-2 text-xs"><span>{label}</span><span className="tabular-nums text-[var(--st-muted)]">{n} / {total}</span></div>
      <div className="mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-line-soft)]"><span className="block h-full rounded-[3px]" style={{ width: `${total ? (n / total) * 100 : 0}%`, background: color }} /></div>
    </div>
  );
}

export function StudioAnnouncements({ rows, lists }: { rows: NoticeRow[]; lists: ComposerLists }) {
  const router = useRouter();
  const { toast } = useToast();
  const [lane, setLane] = useState<NoticeRow["lane"]>("live");
  const [composing, setComposing] = useState(false);
  const [seed, setSeed] = useState("");
  const [ask, setAsk] = useState("");
  const [busy, start] = useTransition();
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [whoFor, setWhoFor] = useState<NoticeRow | null>(null);

  const count = (l: NoticeRow["lane"]) => rows.filter((r) => r.lane === l).length;
  const shown = rows.filter((r) => r.lane === lane);
  const live = rows.find((r) => r.lane === "live") ?? null;
  const unseen = live ? Math.max(0, live.stats.total - live.stats.seen) : 0;

  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, said: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast(r.error ?? "That didn't work.", { tone: "warn" }); return; }
    toast(said, { tone: "success" });
    router.refresh();
  });

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Announcements"
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
              {LANES.map((l) => (
                <button key={l.id} type="button" role="tab" aria-selected={lane === l.id} onClick={() => setLane(l.id)}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", lane === l.id ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l.label}{l.id !== "arch" && <span className="text-[11px] font-normal text-[var(--st-muted)]">{count(l.id)}</span>}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setSeed(""); setComposing(true); }} className={stBtn.dark}><Plus size={15} />New announcement</button>
          </>
        }
      />

      <StudioCardRow className="lg:h-[250px]">
        <StudioCard className="min-h-[220px]">
          {live ? (
            <>
              <CardHead label="Live now" right={<span>{live.typeLabel} · {live.whenLabel}</span>} />
              <div className="mt-auto grid grid-cols-1 items-end gap-5 pt-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="text-[20px] font-medium leading-tight tracking-[-0.015em] sm:text-[22px]">{live.title}</div>
                  {live.body && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--st-on-card-muted)]">{live.body}</p>}
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {unseen > 0 && <button type="button" disabled={busy} onClick={() => run(() => nudgeAnnouncementAction(live.id), `Reminded ${unseen} ${unseen === 1 ? "person" : "people"}.`)} className={stBtn.onCard}>Nudge the {unseen} who haven’t</button>}
                    <button type="button" onClick={() => setWhoFor(live)} className={stBtn.onCardGhost}><Eye size={13} />Who has seen it</button>
                  </div>
                </div>
                <div className="flex gap-4 max-sm:hidden">
                  <Ring value={live.stats.total ? (live.stats.seen / live.stats.total) * 100 : 0} size={104} stroke={11} color="#F2F2F0" track="var(--st-card-3)" label={live.stats.seen} sub={`of ${live.stats.total} seen`} />
                  {live.requireAck && <Ring value={live.stats.total ? (live.stats.ack / live.stats.total) * 100 : 0} size={104} stroke={11} color="var(--st-ok)" track="var(--st-card-3)" label={live.stats.ack} sub="acknowledged" />}
                </div>
              </div>
            </>
          ) : (
            <>
              <CardHead label="Live now" />
              <div className="mt-auto pt-4">
                <div className="text-[20px] font-medium">Nothing live right now</div>
                <p className="mt-1.5 text-[13px] text-[var(--st-on-card-muted)]">Publish a notice and it shows here, with how many have seen and acknowledged it.</p>
              </div>
            </>
          )}
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[220px]">
          <CardHead label="Write one with ORI" right={<span>A proposal — nothing is sent until you publish</span>} />
          <div className="mt-auto flex flex-col gap-2.5 pt-4">
            <p className="max-w-[460px] text-[14px] leading-relaxed text-[#C9CBCF]">Say what you want people to know. ORI drafts the title and body, in English or Swahili, for you to check.</p>
            <form onSubmit={(e) => { e.preventDefault(); if (!ask.trim()) return; setSeed(ask); setComposing(true); setAsk(""); }}
              className="flex h-11 items-center gap-2 rounded-xl border border-[#2E3035] bg-[#1F2023] pl-3.5 pr-1.5">
              <Sparkles size={15} className="shrink-0 text-[#8E9197]" />
              <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. “Office closed Friday for Maulid — reopen Monday 8am”"
                className="bare-field h-full min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#F2F2F0] outline-none placeholder:text-[#8E9197]" />
              <button type="submit" disabled={!ask.trim()} className="h-8 shrink-0 rounded-[9px] bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] disabled:opacity-40">Draft with AI</button>
            </form>
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="flex flex-col gap-2.5">
        <div className="px-1 text-xs text-[var(--st-muted)]">{lane === "live" ? "Noticeboard" : LANES.find((l) => l.id === lane)!.label}</div>
        {shown.length === 0 && (
          <div className="st-tex-paper-dots flex min-h-[140px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)] p-6">
            <span className="rounded-xl bg-[var(--st-page)] px-4 py-2.5 text-center text-[13px] text-[var(--st-sub)]">
              {lane === "live" ? "Nothing live. Posts reach the portal, push and each person’s bell." : lane === "drafts" ? "No drafts." : lane === "sched" ? "Nothing scheduled." : "Nothing archived."}
            </span>
          </div>
        )}
        {shown.map((r) => (
          <div key={r.id} className="grid grid-cols-1 items-center gap-x-5 gap-y-3 rounded-[16px] bg-[var(--st-surface)] px-5 py-4 lg:grid-cols-[minmax(0,1.8fr)_150px_140px_140px_auto]">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <Pill>{r.typeLabel}</Pill>
                {r.pinned && <Pill>Pinned</Pill>}
                {r.requireAck && <Pill dot="var(--st-soon)">Ack required</Pill>}
                {r.takeover && <Pill dot="var(--st-late)">Takeover</Pill>}
                {r.lane === "live" && <Pill dot="var(--st-ok)">Live</Pill>}
              </div>
              <div className="truncate text-[15px] font-medium">{r.title}</div>
              {r.body && <div className="mt-0.5 truncate text-xs text-[var(--st-muted)]">{r.body}</div>}
            </div>
            <div className="min-w-0 text-[13px]"><div className="truncate">{r.audienceText}</div><div className="truncate text-[11px] text-[var(--st-muted)]">{r.subLabel}</div></div>
            {r.lane === "live" || r.lane === "arch" ? <>
              <Bar label="Seen" n={r.stats.seen} total={r.stats.total} color="var(--st-ink)" />
              {r.requireAck ? <Bar label="Acknowledged" n={r.stats.ack} total={r.stats.total} color="var(--st-ok)" /> : <span className="text-xs text-[var(--st-muted)] max-lg:hidden">No acknowledgement asked</span>}
            </> : <><span className="max-lg:hidden" /><span className="max-lg:hidden" /></>}
            <div className="flex flex-wrap justify-end gap-1.5">
              {(r.lane === "drafts" || r.lane === "sched") && <button type="button" disabled={busy} onClick={() => run(() => publishAnnouncementAction(r.id), "Published.")} className={cn(stBtn.dark, "h-[30px] px-3 text-xs")}>Publish now</button>}
              {r.lane === "live" && <button type="button" onClick={() => setWhoFor(r)} className={cn(stBtn.ghost, "h-[30px] px-2.5 text-xs")}>Who has seen it</button>}
              {r.lane !== "arch" && <button type="button" disabled={busy} onClick={() => run(() => archiveAnnouncementAction(r.id), "Archived.")} className={cn(stBtn.ghost, "h-[30px] px-2.5 text-xs")}>Archive</button>}
              <button type="button" disabled={busy} onBlur={() => setConfirmDel(null)}
                onClick={() => { if (confirmDel !== r.id) { setConfirmDel(r.id); return; } setConfirmDel(null); run(() => deleteAnnouncementAction(r.id), "Deleted."); }}
                className={cn("inline-flex h-[30px] items-center rounded-[9px] border px-2.5 text-xs", confirmDel === r.id ? "border-[var(--st-late)] bg-[var(--st-late)] text-white" : "border-[var(--st-bad-line,#F5C6DF)] text-[var(--st-late-text)]")}>
                {confirmDel === r.id ? "Press again to delete" : "Delete…"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnnounceComposer open={composing} onClose={() => setComposing(false)} mode="admin" lists={lists} seed={seed} />
      <WhoHasSeen notice={whoFor} onClose={() => setWhoFor(null)} />
    </StudioScope>
  );
}

function WhoHasSeen({ notice, onClose }: { notice: NoticeRow | null; onClose: () => void }) {
  const [people, setPeople] = useState<{ id: number; name: string; seenAt: string | null; ackAt: string | null }[] | null>(null);
  const [forId, setForId] = useState<number | null>(null);
  if (notice && forId !== notice.id) {
    setForId(notice.id);
    setPeople(null);
    void announcementReceiptsAction(notice.id).then((r) => setPeople(r.ok ? r.people : []));
  }
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <StudioSheet open={!!notice} onClose={() => { setForId(null); onClose(); }} title={notice ? `Who has seen “${notice.title}”` : ""} icon={<Eye size={15} />} width={480}>
      {people == null ? <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" /></div> : people.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[var(--sh-muted)]">Nobody is in this notice’s audience.</p>
      ) : (
        <div className="flex flex-col">
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-[var(--sh-line)] py-2.5 last:border-0">
              <PersonFace name={p.name} size={30} peek />
              <span className="min-w-0 flex-1 truncate text-[13px]">{p.name}</span>
              <span className={cn("shrink-0 text-xs", p.ackAt ? "text-[var(--st-ok-text)]" : p.seenAt ? "text-[var(--sh-sub)]" : "text-[var(--sh-muted)]")}>
                {p.ackAt ? `Acknowledged ${when(p.ackAt)}` : p.seenAt ? `Seen ${when(p.seenAt)}` : "Not yet"}
              </span>
            </div>
          ))}
        </div>
      )}
    </StudioSheet>
  );
}
