"use client";
/**
 * Studio Companies — mockup board `Companies`.
 *
 * Header with the four tabs (Companies · Departments · Sites · Roles) and "Add
 * company"; two dark cards (the portfolio, and the companies most at risk);
 * then every company as a tile, worst first, fitted to the screen from `lg`.
 *
 * A company's standing is ONE rule, used by the tile, the counts and the
 * footer: nothing open → "Nothing open"; more than half its open work late →
 * "At risk"; any late → "Watch"; otherwise "On track". "Late" is the same
 * overdue flag the task list uses, and "done" is done THIS MONTH, so the tiles
 * add up to the portfolio card.
 *
 * Departments, Sites and Roles keep the same server actions as before
 * (create · rename · merge · delete) — only the screen is new.
 */
import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, BigNumber, stBtn } from "@/components/studio/kit";
import { StudioChoiceMenu } from "@/components/studio/tasks/cells";
import { useFitFrame } from "@/components/studio/use-fit-frame";
import { useStudioFootNote } from "@/components/studio/foot-note";
import { useToast } from "@/components/toast";
import { withReturn } from "@/lib/return-to";
import { cn } from "@/lib/cn";
import type { DepartmentAdminRow } from "@/lib/departments";
import type { SiteAdminRow } from "@/lib/sites";
import type { RoleAdminRow } from "@/lib/roles";
import { createDepartment, renameDepartment, mergeDepartments, deleteDepartment } from "@/app/companies/department-actions";
import { createSite, renameSite, mergeSites, deleteSite, createRole, renameRole, mergeRoles, deleteRole } from "@/app/companies/reference-actions";

export type HubCompany = { id: number; name: string; prefix: string; staff: number; open: number; late: number; done: number };
export type StudioCompaniesData = {
  /** A director: their companies to open — no Add company, and not the
   *  owner's reference lists (departments, sites, roles). */
  readOnly?: boolean;
  companies: HubCompany[];
  departments: DepartmentAdminRow[];
  sites: SiteAdminRow[];
  roles: RoleAdminRow[];
};

/** 0 on track · 1 watch · 2 at risk · 3 nothing open. */
export function standing(open: number, late: number): 0 | 1 | 2 | 3 {
  if (open === 0) return 3;
  if (late / open > 0.5) return 2;
  return late > 0 ? 1 : 0;
}
export const STANDING = [
  { label: "On track", dot: "var(--st-ok)", text: "var(--st-ok-text)", tile: "var(--st-ok-wash)" },
  { label: "Watch", dot: "var(--st-soon)", text: "var(--st-soon-text)", tile: "var(--st-warn-wash)" },
  { label: "At risk", dot: "var(--st-late)", text: "var(--st-late-text)", tile: "var(--st-bad-wash)" },
  { label: "Nothing open", dot: "var(--st-track-off)", text: "var(--st-muted)", tile: "var(--st-page)" },
] as const;

type Tab = "companies" | "departments" | "sites" | "roles";
const TABS: Tab[] = ["companies", "departments", "sites", "roles"];
const TAB_LABEL: Record<Tab, string> = { companies: "Companies", departments: "Departments", sites: "Sites", roles: "Roles" };
const addCompany = () => window.dispatchEvent(new CustomEvent("studio:new", { detail: { tab: "company" } }));

export function StudioCompanies({ data }: { data: StudioCompaniesData }) {
  const sp = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => (TABS as string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "companies");
  // The tab lives in the address (a link can land on it) but is written with
  // replaceState: a router navigation would re-read every company.
  const setTab = (t: Tab) => {
    setTabState(t);
    const q = new URLSearchParams(window.location.search);
    if (t === "companies") q.delete("tab"); else q.set("tab", t);
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };

  // Worst first: at risk, watch, on track, nothing open — then most late.
  const cos = [...data.companies].sort((a, b) => {
    const sa = standing(a.open, a.late), sb = standing(b.open, b.late);
    const rank = (s: number) => (s === 3 ? 9 : -s);
    return rank(sa) - rank(sb) || b.late - a.late || b.open - a.open || a.name.localeCompare(b.name);
  });
  const open = cos.reduce((n, c) => n + c.open, 0);
  const late = cos.reduce((n, c) => n + c.late, 0);
  const done = cos.reduce((n, c) => n + c.done, 0);
  const bands = [0, 0, 0, 0];
  for (const c of cos) bands[standing(c.open, c.late)]++;
  const atRisk = cos.filter((c) => c.late > 0).sort((a, b) => b.late / b.open - a.late / a.open || b.late - a.late).slice(0, 4);
  const worst = atRisk[0];
  useStudioFootNote(worst
    ? { label: "Needs you most", text: `${worst.name} · ${worst.late === worst.open ? `all ${worst.open} open tasks are late` : `${worst.late} of ${worst.open} open tasks late`}`, href: `/companies/${worst.id}` }
    : { label: "Needs you most", text: "Nothing is late — every company is on time" });

  const grid = useRef<HTMLDivElement>(null);
  useFitFrame(grid, { enabled: tab === "companies", minimum: 320, deps: [tab] });
  const maxOpen = Math.max(1, ...cos.map((c) => c.open));

  const tabs = (
    <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
      {(data.readOnly ? (["companies"] as Tab[]) : TABS).map((t) => (
        <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
          className={cn("flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs transition-colors",
            tab === t ? "bg-[var(--st-surface)] font-medium text-[var(--st-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
          {TAB_LABEL[t]}{t === "companies" && <span className="text-[11px] text-[var(--st-muted)]">{cos.length}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader title="Companies" right={data.readOnly ? undefined : <>{tabs}<button type="button" onClick={addCompany} className={stBtn.dark}><Plus size={14} strokeWidth={2.4} />Add company</button></>} />

      {tab === "companies" && (
        <>
          <StudioCardRow className="lg:h-[210px]">
            <StudioCard tone="dark">
              <CardHead label="Portfolio" right={`${cos.length} companies`} />
              <div className="mt-auto flex flex-wrap items-end gap-x-7 gap-y-4 pt-4">
                <div>
                  <Link href="/?tab=tasks" className="block hover:opacity-90"><BigNumber value={open} unit="open" /></Link>
                  <div className="mt-3 flex gap-3.5 text-xs text-[var(--st-on-card-muted)]">
                    <Link href="/?tab=tasks&flag=overdue" className="text-[#F07BBE] hover:underline">{late} late</Link>
                    <span>{done} done this month</span>
                  </div>
                </div>
                <span className="flex-1" />
                <div className="flex items-end gap-[18px]">
                  {([["no late work", "#5BE0A5", 0], ["some late", "#F5B94E", 1], ["mostly late", "#F07BBE", 2], ["nothing open", "#8E9197", 3]] as const).map(([l, c, i]) => (
                    <div key={l} className="text-center">
                      <div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{bands[i]}</div>
                      <div className="mt-1.5 whitespace-nowrap text-[11px]" style={{ color: c }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </StudioCard>
            <StudioCard tone="dark" texture="rings">
              <CardHead label="Most at risk" right="share of open work that is late" />
              <div className="mt-auto flex flex-col gap-2.5 pt-4">
                {atRisk.length === 0 && <div className="text-[13px] text-[var(--st-on-card-muted)]">Nothing is late anywhere. Every company is on time.</div>}
                {atRisk.map((c) => {
                  const pct = Math.round((c.late / c.open) * 100);
                  return (
                    <Link key={c.id} href={withReturn(`/companies/${c.id}`, "/companies")}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 text-[13px] hover:opacity-90 sm:grid-cols-[170px_minmax(0,1fr)_150px]">
                      <span className="truncate">{c.name}</span>
                      {/* On a phone the bar takes its own line under the name. */}
                      <span className="order-last col-span-2 h-2 overflow-hidden rounded bg-[var(--st-card-3)] sm:order-none sm:col-span-1">
                        <span className="block h-full rounded" style={{ width: `${Math.max(4, pct)}%`, background: pct > 50 ? "var(--st-late)" : "var(--st-soon)" }} />
                      </span>
                      <span className="text-right text-xs text-[var(--st-on-card-muted)]">{c.late === c.open ? `all ${c.open} open tasks are late` : `${c.late} of ${c.open} late`}</span>
                    </Link>
                  );
                })}
              </div>
            </StudioCard>
          </StudioCardRow>

          <div ref={grid} className="st-scroll grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:auto-rows-[minmax(132px,1fr)] lg:grid-cols-4 lg:overflow-y-auto xl:grid-cols-5">
            {cos.map((c) => {
              const s = standing(c.open, c.late);
              const st = STANDING[s];
              return (
                <Link key={c.id} href={withReturn(`/companies/${c.id}`, "/companies")}
                  className={cn("flex min-w-0 flex-col gap-2 rounded-2xl bg-[var(--st-surface)] p-3.5 transition-shadow hover:shadow-[0_6px_18px_rgba(17,18,20,0.07)]", s === 3 && "opacity-75")}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="st-mono flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-semibold" style={{ background: st.tile, color: st.text }}>{c.prefix}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: st.text }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />{st.label}
                      </span>
                    </span>
                  </span>
                  <span className="flex-1" />
                  <span className="flex h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-line-soft)]" title={`${c.open - c.late} on time · ${c.late} late`}>
                    <span style={{ width: `${((c.open - c.late) / maxOpen) * 100}%`, background: "var(--st-ok)" }} />
                    <span style={{ width: `${(c.late / maxOpen) * 100}%`, background: "var(--st-late)" }} />
                  </span>
                  <span className="grid grid-cols-4 text-[11px] text-[var(--st-muted)]">
                    <Stat n={c.staff} l="staff" />
                    <Stat n={c.open} l="open" />
                    <Stat n={c.late} l="late" c={c.late ? "var(--st-late-text)" : undefined} />
                    <Stat n={c.done} l="done" />
                  </span>
                </Link>
              );
            })}
            {!data.readOnly && <button type="button" onClick={addCompany}
              className="flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-[var(--st-dash)] text-[13px] text-[var(--st-sub)] transition-colors hover:bg-[var(--st-surface)]">
              <Plus size={18} strokeWidth={2} />Add a company
              <span className="text-[11px] text-[var(--st-muted)]">name · task-code prefix · colour</span>
            </button>}
          </div>
        </>
      )}

      {!data.readOnly && tab === "departments" && (
        <StudioReference noun="department" addTitle="Add a department"
          note="Rename or merge moves everyone and every task across. Deleting leaves them with no department. Heads are set per company on its Org tab."
          items={data.departments.map((d) => ({ id: d.id, name: d.name, meta: [`${d.peopleCount} ${d.peopleCount === 1 ? "person" : "people"}`, `${d.companyCount} ${d.companyCount === 1 ? "company" : "companies"}`, `${d.taskCount} ${d.taskCount === 1 ? "task" : "tasks"}`].join(" · ") }))}
          onCreate={createDepartment} onRename={renameDepartment} onMerge={mergeDepartments} onDelete={deleteDepartment} />
      )}
      {!data.readOnly && tab === "sites" && (
        <StudioReference noun="site" addTitle="Add a site"
          note="Sites are where staff work or live — not company branches. Merging re-points everyone based or living there; deleting sets them to no site."
          items={data.sites.map((s) => ({ id: s.id, name: s.name, meta: `${s.workCount} work · ${s.residenceCount} living here` }))}
          onCreate={createSite} onRename={renameSite} onMerge={mergeSites} onDelete={deleteSite} />
      )}
      {!data.readOnly && tab === "roles" && (
        <StudioReference noun="job title" addTitle="Add a job title"
          note="Renaming a title updates everyone who holds it. Merge folds two titles into one. Deleting keeps each person's current title text."
          items={data.roles.map((r) => ({ id: r.id, name: r.name, meta: `${r.peopleCount} ${r.peopleCount === 1 ? "person" : "people"}` }))}
          onCreate={createRole} onRename={renameRole} onMerge={mergeRoles} onDelete={deleteRole} />
      )}
    </StudioScope>
  );
}

function Stat({ n, l, c }: { n: number; l: string; c?: string }) {
  return (
    <span>
      <b className="block text-[15px] font-medium tabular-nums" style={{ color: c ?? "var(--st-ink)" }}>{n}</b>{l}
    </span>
  );
}

type Res = { ok: true } | { ok: false; error: string };
type RefItem = { id: number; name: string; meta: string };

/** Departments · Sites · Roles — one list, one "Add" card (mockup: the three
 *  reference tabs). Rename in place, merge into another, delete on a second press. */
function StudioReference({ items, noun, addTitle, note, onCreate, onRename, onMerge, onDelete }: {
  items: RefItem[];
  noun: string;
  addTitle: string;
  note: ReactNode;
  onCreate: (name: string) => Promise<Res>;
  onRename: (id: number, name: string) => Promise<Res>;
  onMerge: (fromId: number, intoId: number) => Promise<Res>;
  onDelete: (id: number) => Promise<Res>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const run = (fn: () => Promise<Res>, done: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast(r.error, { tone: "danger" }); return; }
    toast(done, { tone: "success" });
    after?.();
    router.refresh();
  });
  const shown = q.trim() ? items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())) : items;
  const FIELD = "h-9 w-full rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] outline-none focus:border-[var(--st-ink)]";
  const SMALL = "inline-flex h-7 items-center rounded-lg border border-[var(--st-line)] px-2.5 text-xs transition-colors hover:bg-[var(--st-page)] disabled:opacity-50";

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 rounded-[20px] bg-[var(--st-surface)] p-2">
        <div className="flex items-center gap-3 px-3.5 pb-1 pt-2.5">
          <span className="text-[15px] font-semibold capitalize">{noun}s</span>
          <span className="text-xs text-[var(--st-muted)]">{items.length}</span>
          <span className="flex-1" />
          {items.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${noun}…`} className={cn(FIELD, "h-8 w-[200px]")} />}
        </div>
        {shown.length === 0 && <div className="px-5 py-14 text-center text-[13px] text-[var(--st-muted)]">{items.length ? "Nothing matches." : `No ${noun}s yet — add the first on the right.`}</div>}
        {shown.map((it) => (
          <div key={it.id} className="grid grid-cols-1 items-center gap-x-3.5 gap-y-1.5 border-b border-[var(--st-line-soft)] px-3.5 py-2.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_190px_auto]">
            {editing?.id === it.id ? (
              <input autoFocus value={editing.name} onChange={(e) => setEditing({ id: it.id, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
                  if (e.key === "Enter") { e.preventDefault(); const n = editing.name.trim(); if (n && n !== it.name) run(() => onRename(it.id, n), `Renamed to ${n}.`, () => setEditing(null)); else setEditing(null); }
                }}
                onBlur={() => setEditing(null)} className={cn(FIELD, "h-8")} />
            ) : (
              <span className="truncate text-sm">{it.name}</span>
            )}
            <span className="truncate text-xs text-[var(--st-muted)]">{it.meta}</span>
            <span className="flex flex-wrap gap-1">
              <button type="button" disabled={busy} onClick={() => setEditing({ id: it.id, name: it.name })} className={SMALL}>Rename</button>
              <StudioChoiceMenu value={null} empty="Merge into…" showDot={false} width={240}
                options={items.filter((x) => x.id !== it.id).map((x) => ({ value: String(x.id), label: x.name }))}
                onPick={(v) => { const into = items.find((x) => x.id === Number(v)); if (into) run(() => onMerge(it.id, into.id), `${it.name} merged into ${into.name}.`); }}
                className={cn(SMALL, "mx-0 py-0")} />
              <button type="button" disabled={busy} onBlur={() => setConfirm(null)}
                onClick={() => { if (confirm !== it.id) { setConfirm(it.id); return; } setConfirm(null); run(() => onDelete(it.id), `${it.name} deleted.`); }}
                className={cn(SMALL, "border-[var(--st-bad-line)] text-[var(--st-late-text)] hover:bg-[var(--st-bad-wash)]", confirm === it.id && "bg-[var(--st-late)] text-white")}>
                {confirm === it.id ? "Press again" : "Delete"}
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="st-tex-paper-rings flex flex-col gap-3 rounded-[20px] bg-[var(--st-surface)] px-[22px] py-5">
        <div className="text-[15px] font-semibold">{addTitle}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (!n) return; run(() => onCreate(n), `${n} added.`, () => setName("")); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Type a name…" className={FIELD} aria-label={addTitle} />
          <button type="submit" disabled={busy || !name.trim()} className={cn(stBtn.dark, "h-9 shrink-0 disabled:opacity-50")}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}Add
          </button>
        </form>
        <p className="text-xs leading-relaxed text-[var(--st-label)]">{note}</p>
      </div>
    </div>
  );
}
