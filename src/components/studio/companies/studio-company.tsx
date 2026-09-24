"use client";
/**
 * Studio — one company (mockup board `Company`).
 *
 * The dark band (back to Companies · Open in Tasks · Files · Team · New task;
 * the tile, the name, "Task codes CC-… · 12 open · 10 people", its standing;
 * the tabs), then on Overview: five number tiles and three columns —
 *   open tasks + equipment & suppliers · ORI briefing + people ·
 *   documents + governance.
 * From xl the overview fits the screen; only a list scrolls, never the page.
 * The other tabs keep their own bodies (profile, the task table, notes,
 * timeline, the org chart) inside a white card under the same band.
 *
 * Every number is a door: the tiles and chips open the filtered task list,
 * the documents, the team.
 */
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minimize2, List, Folder, Users, Plus, Sparkles, Loader2, Copy, Check } from "lucide-react";
import { StudioScope, Ring } from "@/components/studio/kit";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { useStudioFootNote } from "@/components/studio/foot-note";
import { avatarTint, initials } from "@/components/studio/tasks/task-words";
import { useMediaQuery } from "@/lib/use-media-query";
import { friendlyAIError } from "@/lib/ai-errors";
import { withReturn } from "@/lib/return-to";
import { taskHref } from "@/lib/task-href";
import { cn } from "@/lib/cn";
import { STANDING, standing } from "./studio-companies";

export type CompanyTabKey = "overview" | "profile" | "tasks" | "notes" | "timeline" | "org";

export type StudioCompanyData = {
  id: number;
  name: string;
  prefix: string;
  open: number;
  late: number;
  people: number;
  tab: CompanyTabKey;
  chips: { overdue: number; dueSoon: number; stalled: number; noDeadline: number; noOwner: number };
  /** Tasks tab: open or done, and how many are done. */
  tf: "open" | "done";
  doneCount: number;
  overview: null | {
    documents: { total: number; expired: number; expiring: number };
    tasks: { code: string; title: string; when: string; tone: "late" | "soon" | "none" | "plain" }[];
    staff: { id: number; name: string; role: string | null; staffId: string | null }[];
    alsoCount: number;
    equipment: { assets: number; vendors: number; expiredContracts: number; items: { name: string; sub: string; bad?: boolean }[] };
    governance: { capTable: number; signatories: number; resolutions: number; facts: number };
  };
};

const TABS: { id: CompanyTabKey; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "profile", label: "Profile" }, { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" }, { id: "timeline", label: "Timeline" }, { id: "org", label: "Org" },
];
const BAND_BTN = "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[#2E3035] px-[11px] text-xs text-[#E6E6E3] transition-colors hover:bg-[#1F2023]";
const shortName = (n: string) => n.replace(/^(Mr|Ms|Mrs|Miss|Dr|Chef|Eng)\.? /i, "");

export function StudioCompany({ data, children }: { data: StudioCompanyData; children?: ReactNode }) {
  const pathname = usePathname() || `/companies/${data.id}`;
  const s = standing(data.open, data.late);
  const st = STANDING[s];
  const tasksHref = `/?tab=tasks&company=${encodeURIComponent(data.name)}`;
  useStudioFootNote({ label: "Company", text: `${data.name} · ${data.prefix}` });

  const band = (
    <div className="st-tex-contour flex shrink-0 flex-col gap-3.5 rounded-[20px] bg-[#141517] px-[22px] py-[18px] text-[#F2F2F0]">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/companies" className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-[#F2F2F0] px-2.5 text-xs font-medium text-[#111214]">
          <Minimize2 size={13} strokeWidth={2.2} />Companies
        </Link>
        <span className="flex-1" />
        <div className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <Link href={tasksHref} className={BAND_BTN}><List size={13} />Open in Tasks</Link>
          <Link href={`/documents?company=${data.id}`} className={BAND_BTN}><Folder size={13} />Files</Link>
          <Link href={`/people?co=${data.id}`} className={BAND_BTN}><Users size={13} />Team</Link>
        </div>
        <Link href={`/task/new?companyId=${data.id}&returnTo=${encodeURIComponent(pathname)}`}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] transition-opacity hover:opacity-90">
          <Plus size={13} strokeWidth={2.4} />New task
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-x-[18px] gap-y-3">
        <span className="st-mono flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold sm:h-16 sm:w-16 sm:text-xl"
          style={{ background: st.tile, color: st.text }}>{data.prefix}</span>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-[28px] font-medium leading-none tracking-[-0.03em] sm:text-[36px]">{data.name}</h1>
          <div className="mt-2 text-sm text-[#A3A6AB]">Task codes {data.prefix}-… · {data.open} open · {data.people} {data.people === 1 ? "person" : "people"}</div>
        </div>
        <span className="inline-flex h-7 items-center gap-2 rounded-lg px-2.5 text-xs"
          style={{ background: s === 2 ? "#3A1D2C" : s === 1 ? "#3A2E14" : s === 0 ? "#1D2A23" : "#26282C", color: s === 2 ? "#F07BBE" : s === 1 ? "#F5B94E" : s === 0 ? "#5BE0A5" : "#C9CBCF" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
          {st.label}{data.late > 0 ? ` · ${data.late} late` : ""}
        </span>
      </div>
      <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <Link key={t.id} role="tab" aria-selected={data.tab === t.id} href={t.id === "overview" ? `/companies/${data.id}` : `/companies/${data.id}?tab=${t.id}`} scroll={false}
            className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[13px] transition-colors", data.tab === t.id ? "bg-[#F2F2F0] text-[#111214]" : "text-[#C9CBCF] hover:text-white")}>
            {t.label}{t.id === "tasks" && data.open > 0 && <span className="text-xs text-[#8E9197]">{data.open}</span>}
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <StudioScope className="flex flex-col gap-4">
      {band}
      {data.tab === "overview" && data.overview
        ? <Overview data={data} o={data.overview} tasksHref={tasksHref} />
        : data.tab === "tasks"
          ? <>
              <TasksHead data={data} tasksHref={tasksHref} />
              {children}
            </>
          : children}
    </StudioScope>
  );
}

function Card({ title, right, children, className, texture }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; texture?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-[20px] bg-[var(--st-surface)] px-5 py-4", texture, className)}>
      <div className="flex min-h-[26px] shrink-0 items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        {right && <div className="flex items-center gap-2 text-xs text-[var(--st-muted)]">{right}</div>}
      </div>
      {children}
    </section>
  );
}
const GROW = "xl:min-h-0 xl:flex-1";
const LIST = "st-scroll xl:min-h-0 xl:flex-1 xl:overflow-y-auto";
const COL = "flex min-h-0 min-w-0 flex-col gap-4";
const TONE = { late: "var(--st-late-text)", soon: "var(--st-soon-text)", none: "#A3A6AB", plain: "var(--st-sub)" } as const;

function Overview({ data, o, tasksHref }: { data: StudioCompanyData; o: NonNullable<StudioCompanyData["overview"]>; tasksHref: string }) {
  const here = `/companies/${data.id}`;
  const fit = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery("(min-width: 1280px)");
  useFitFrame(fit, { enabled: wide, minimum: 460 });
  const valid = Math.max(0, o.documents.total - o.documents.expired);
  const docPct = o.documents.total ? Math.round((valid / o.documents.total) * 100) : 0;

  const tiles: [number, string, string | undefined, string][] = [
    [data.open, "open tasks", undefined, `/companies/${data.id}?tab=tasks`],
    [data.late, "overdue", data.late ? "var(--st-late-text)" : undefined, `${tasksHref}&flag=overdue`],
    [data.people, "people", undefined, `/people?co=${data.id}`],
    [o.documents.total, "documents", undefined, `/documents?company=${data.id}`],
    [o.documents.expired, "documents expired", o.documents.expired ? "var(--st-late-text)" : undefined, `/documents?company=${data.id}`],
  ];

  return (
    <div ref={fit} className="flex flex-col gap-4">
      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([n, l, c, href]) => (
          <Link key={l} href={href} className="rounded-[14px] bg-[var(--st-surface)] px-3.5 py-3 transition-colors hover:bg-[var(--st-cal-busy)]">
            <div className="text-[28px] leading-none tracking-[-0.03em] tabular-nums" style={{ color: c }}>{n}</div>
            <div className="mt-1.5 text-xs text-[var(--st-label)]">{l}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className={COL}>
          <Card title="Open tasks" className={GROW} right={data.open > 0 && <Link href={`/companies/${data.id}?tab=tasks`} className="text-[var(--st-ink)] hover:underline">All {data.open} →</Link>}>
            <div className="mt-2 shrink-0"><Chips chips={data.chips} tasksHref={tasksHref} /></div>
            <div className={cn("mt-2 flex flex-col", LIST)}>
              {o.tasks.length === 0 && <div className="py-4 text-[13px] text-[var(--st-muted)]">Nothing open for {data.name}.</div>}
              {o.tasks.map((t, i) => (
                <Link key={t.code} href={withReturn(taskHref(t.code), here)}
                  className={cn(i >= 6 && "hidden xl:grid", "grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[var(--st-line-soft)] py-2 text-[13px] last:border-0 hover:bg-[var(--st-cal-busy)]")}>
                  <span className="truncate"><span className="st-mono text-[11px] text-[var(--st-muted)]">{t.code}</span> {t.title}</span>
                  <span className="text-xs" style={{ color: TONE[t.tone] }}>{t.when}</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card title="Equipment & suppliers" className="shrink-0" right={<Link href="/hrms/assets" className="text-[var(--st-ink)] hover:underline">Open →</Link>}>
            {o.equipment.assets + o.equipment.vendors === 0 ? (
              <p className="mt-1.5 text-[13px] leading-normal text-[var(--st-sub)]">No equipment or suppliers are filed against {shortName(data.name)} yet.</p>
            ) : (
              <>
                <p className="mt-1.5 text-[13px] leading-normal text-[var(--st-sub)]">
                  {o.equipment.assets} {o.equipment.assets === 1 ? "asset" : "assets"} · {o.equipment.vendors} {o.equipment.vendors === 1 ? "supplier" : "suppliers"}
                  {o.equipment.expiredContracts > 0 && <span className="text-[var(--st-late-text)]"> · {o.equipment.expiredContracts} with an expired contract</span>}
                </p>
                <div className="mt-1.5 flex flex-col">
                  {o.equipment.items.slice(0, 3).map((it, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-[var(--st-line-soft)] py-1.5 text-[13px] last:border-0">
                      <span className="truncate">{it.name}</span>
                      <span className={cn("truncate text-xs", it.bad ? "text-[var(--st-late-text)]" : "text-[var(--st-muted)]")}>{it.sub}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className={COL}>
          <Briefing companyId={data.id} />
          <Card title="People" className={GROW} right={data.people > 0 && <Link href={`/people?co=${data.id}`} className="text-[var(--st-ink)] hover:underline">All {data.people} →</Link>}>
            <div className={cn("mt-2 flex flex-col gap-1", LIST)}>
              {o.staff.length === 0 && <div className="py-3 text-[13px] text-[var(--st-muted)]">Nobody has {shortName(data.name)} as their main company yet.</div>}
              {o.staff.map((p, i) => (
                <Link key={p.id} href={withReturn(`/people/${p.id}`, here)} className={cn(i >= 4 && "hidden xl:flex", "flex shrink-0 items-center gap-2.5 rounded-lg py-1 hover:bg-[var(--st-cal-busy)]")}>
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[#111214]" style={{ background: avatarTint(p.name) }}>{initials(shortName(p.name))}</span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-[11px] text-[var(--st-muted)]">{[p.role, p.staffId].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </Link>
              ))}
              {o.alsoCount > 0 && <Link href={`/people?co=${data.id}`} className="shrink-0 pt-1 text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">+ {o.alsoCount} who also work for {shortName(data.name).split(" ")[0]}</Link>}
            </div>
          </Card>
        </div>

        <div className={cn(COL, "lg:col-span-2 xl:col-span-1")}>
          <Card title="Documents" className="shrink-0" right={<Link href={`/documents?company=${data.id}`} className="text-[var(--st-ink)] hover:underline">All {o.documents.total} →</Link>}>
            <div className="mt-2.5 flex items-center gap-4">
              <Ring value={docPct} size={84} stroke={9} track="var(--st-line-soft)" color={o.documents.expired ? "var(--st-ok)" : "var(--st-ok)"} label={valid} sub="valid" />
              <p className="text-[13px] leading-normal text-[var(--st-sub)]">
                {o.documents.total === 0 ? <>Nothing filed yet. <Link href={`/documents?newdoc=1&company=${data.id}`} className="text-[var(--st-ink)] underline">Add the first document</Link>.</>
                  : o.documents.expired > 0 ? <><span className="text-[var(--st-late-text)]">{o.documents.expired} expired</span>{o.documents.expiring > 0 && <>, <span className="text-[var(--st-soon-text)]">{o.documents.expiring} expiring</span></>} — renew them from the library, or open a renewal task.</>
                    : o.documents.expiring > 0 ? <><span className="text-[var(--st-soon-text)]">{o.documents.expiring} expiring soon</span> — the rest are in date.</>
                      : "Everything on file is in date."}
              </p>
            </div>
          </Card>
          <Card title="Governance" className={GROW} texture="st-tex-paper-rings" right={<Link href={`/companies/${data.id}?tab=profile`} className="hover:text-[var(--st-ink)]">Profile tab</Link>}>
            <div className="mt-1.5">
              {([
                ["Cap table", o.governance.capTable, "holder", "Add holders and shares"],
                ["Signatories", o.governance.signatories, "signatory", "Add who can sign"],
                ["Resolutions", o.governance.resolutions, "resolution", "Log board resolutions"],
                ["Tracked facts", o.governance.facts, "fact", "Registration, TIN, VRN…"],
              ] as const).map(([k, n, noun, empty]) => (
                <Link key={k} href={`/companies/${data.id}?tab=profile`} className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-2.5 border-b border-[var(--st-line-soft)] py-2 text-[13px] last:border-0 hover:bg-[var(--st-cal-busy)]">
                  <span className="text-[var(--st-muted)]">{k}</span>
                  <span className={cn("truncate", n === 0 && "text-[#A3A6AB]")}>{n === 0 ? empty : `${n} ${noun}${n === 1 ? "" : "s"}`}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Overdue · Due soon · Stalled · No deadline · No owner — each opens the task
 *  list filtered to it. Shared by the Overview card and the Tasks tab. */
function Chips({ chips: c, tasksHref }: { chips: StudioCompanyData["chips"]; tasksHref: string }) {
  const list: [string, number | string, string, string, string][] = [
    ["Overdue", c.overdue, "var(--st-bad-wash)", "var(--st-late-text)", `${tasksHref}&flag=overdue`],
    ["Due soon", c.dueSoon, "var(--st-warn-wash)", "var(--st-soon-text)", `${tasksHref}&flag=due-soon`],
    ["Stalled", c.stalled, "var(--st-page)", "var(--st-sub)", `${tasksHref}&flag=stalled`],
    ["No deadline", c.noDeadline || "—", "var(--st-page)", "var(--st-sub)", `${tasksHref}&flag=no-deadline`],
    ["No owner", c.noOwner, "var(--st-page)", "var(--st-sub)", `${tasksHref}&noOwner=1`],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map(([l, n, bg, fg, href]) => (
        <Link key={l} href={href} className={cn("flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-xs transition-opacity hover:opacity-80", (n === 0 || n === "—") && "pointer-events-none")}
          style={{ background: bg, color: fg }}>{l} <b className="font-semibold">{n}</b></Link>
      ))}
    </div>
  );
}

/** The Tasks tab's head: the chips, Open | Done, and the way to the full list. */
function TasksHead({ data, tasksHref }: { data: StudioCompanyData; tasksHref: string }) {
  const base = `/companies/${data.id}?tab=tasks`;
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] bg-[var(--st-surface)] px-5 py-3.5">
      <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
        {([["open", `Open ${data.open}`, base], ["done", `Done ${data.doneCount}`, `${base}&tf=done`]] as const).map(([k, l, href]) => (
          <Link key={k} href={href} scroll={false} role="tab" aria-selected={data.tf === k}
            className={cn("flex h-[30px] items-center rounded-lg px-3 text-xs transition-colors", data.tf === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>{l}</Link>
        ))}
      </div>
      {data.tf === "open" && <Chips chips={data.chips} tasksHref={tasksHref} />}
      <span className="flex-1" />
      <Link href={tasksHref} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[var(--st-line)] px-3 text-xs hover:bg-[var(--st-page)]"><List size={13} />Open in Tasks</Link>
    </section>
  );
}

/** The ORI briefing card — the same /api/company-summary the old page used. */
function Briefing({ companyId }: { companyId: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  async function generate() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/company-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(friendlyAIError(data.error || `ai-${res.status}`).message); return; }
      setText(data.summary || "");
    } catch { setError(friendlyAIError("network").message); } finally { setBusy(false); }
  }
  return (
    <section className="st-tex-dots flex min-h-[220px] shrink-0 flex-col rounded-[20px] bg-[#141517] px-6 py-5 text-[#F2F2F0] xl:max-h-[58%] xl:min-h-0 xl:flex-1">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="text-[13px] text-[#A3A6AB]">ORI briefing</div>
        <div className="flex gap-1.5">
          {text && (
            <button type="button" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[#34363B] px-2.5 text-xs text-[#E6E6E3] hover:bg-[#1F2023]">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Copied" : "Copy"}</button>
          )}
          <button type="button" onClick={generate} disabled={busy}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{busy ? "Reading…" : text ? "Again" : "Generate"}
          </button>
        </div>
      </div>
      <div className="st-scroll mt-3 min-h-0 flex-1 overflow-y-auto">
        {error ? <p className="text-[13px] text-[#F07BBE]">{error}</p>
          : text ? <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#E6E6E3]">{text}</p>
            : <>
                <p className="text-[15px] leading-normal text-[#E6E6E3]">A short written read of how this company is doing — what moved, what is stuck and who to chase — from its tasks, documents and people.</p>
                <p className="mt-2.5 text-xs text-[#8E9197]">Press Generate. It reads, it changes nothing.</p>
              </>}
      </div>
    </section>
  );
}
