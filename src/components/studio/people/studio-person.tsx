"use client";
/**
 * Studio person page (design/studio-mockup/gen/p_people.py, board Person) —
 * what /people/<id> draws when Settings → New look → People is on.
 *
 * The board draws the Overview. The other tabs (Tasks, Documents, Journey,
 * Equipment, Notes, History, Edit) are not drawn, so they follow the same
 * grammar: white cards on the grey page, the dark band on top. Everything the
 * old drawer could do is here — nothing removed, only moved — and it is all the
 * SAME components and actions: JourneyChecklist, PersonAssets, FactsPanel,
 * PersonPortalAccess, PersonProbation, PersonPackPanel, DeletePersonDialog,
 * LinkedNotesTab, PersonForm, and the people / pack actions.
 */
import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Minimize2, Mail, MessageCircle, Phone, MessagesSquare, Plus, FileText, Bell, MoreHorizontal, ChevronDown, Loader2,
  Clock, UserMinus, UserCheck, Copy, PackageCheck, Check, ExternalLink,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { StudioScope, stBtn } from "@/components/studio/kit";
import { StudioSheet } from "@/components/studio/sheet";
import { avatarTint, initials } from "@/components/studio/tasks/task-words";
import { JourneyChecklist } from "@/components/journey-checklist";
import { StudioPersonEquipment } from "./person-equipment";
import { FactsPanel } from "@/components/facts-panel";
import { PersonProbation } from "@/components/person-probation";
import { PersonPackPanel } from "@/components/person-pack-builder";
import { DeletePersonDialog } from "@/components/delete-person-dialog";
import { LinkedNotesTab } from "@/components/linked-notes";
import { PersonForm, type Defaults as PersonFormDefaults } from "@/components/person-form";
import { useToast } from "@/components/toast";
import { withReturn } from "@/lib/return-to";
import { PERSON_TYPE_LABELS, type PersonType } from "@/lib/person-types";
import { ROLE_LABEL, SCOPE_WORDS, asPortalRole, type PortalRoleKey, type ScopeLevel } from "@/lib/portal-permissions";
import { PERSON_ACTION_LABEL, personActor, type PersonEvent } from "@/lib/person-audit-shared";
import { togglePersonActive, snoozePerson, revokePortalAccessQuick } from "@/app/people/actions";
import { taskHref } from "@/lib/task-href";
import { useRemindPerson } from "./remind";
import { PortalEditor, applyPortalDraft, draftFrom, type PortalDraft, type PortalNow } from "./portal-editor";
import { cn } from "@/lib/cn";

export type StudioPersonData = {
  person: {
    id: number; name: string; staffId: string | null; active: boolean; role: string | null; personType: PersonType;
    companyId: number | null; companyName: string | null; departmentName: string | null;
    managerId: number | null; managerName: string | null; secondaryManagers: { id: number; name: string | null }[];
    alsoCompanies: string[]; companyIds: number[]; email: string | null; phone: string | null; whatsapp: string | null; preferredChannel: string | null;
    startDate: string | null; probationEndDate: string | null; dateOfBirth: string | null; nationality: string | null;
    nationalId: string | null; passportNo: string | null; workSite: string | null; residence: string | null; address: string | null;
    emergencyContactName: string | null; emergencyContactPhone: string | null; notes: string | null; snoozedUntil: string | null;
    relatedPersonName: string | null;
  };
  workload: { open: number; overdue: number; completedThisMonth: number };
  tasks: { code: string; title: string; status: string; companyName: string; deadline: string | null; days: number | null; done: boolean; overdue: boolean; closedDate: string | null; priority: string }[];
  documents: { id: number; title: string; category: string | null; docType: string | null; expiryDate: string | null; status: string; expiryLabel: string | null; companyName: string | null }[];
  reports: { id: number; name: string; role: string | null; companyName: string | null; dotted: boolean; open: number; overdue: number }[];
  portal: { enabled: boolean; role: string; designation: string | null; lastLoginAt: string | null; directorCompanyIds: number[] };
  portalScope: Record<PortalRoleKey, ScopeLevel>;
  events: PersonEvent[];
  editDefaults: PersonFormDefaults;
  lookups: { companies: { id: number; name: string }[]; peopleList: { id: number; name: string; active: boolean }[]; departments: string[]; sites: string[]; roles: string[] };
};

const TABS = ["overview", "tasks", "documents", "journey", "equipment", "notes", "history", "edit"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", tasks: "Tasks", documents: "Documents", journey: "Journey", equipment: "Equipment", notes: "Notes", history: "History", edit: "Edit" };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);
const shortName = (n: string) => n.replace(/^(Mr|Ms|Mrs|Miss|Dr|Chef|Eng)\.? /i, "");
const waHref = (n: string) => `https://wa.me/${n.replace(/[^0-9]/g, "")}`;

/** "2d late" / "Today" / "Sat 26" / "3 Oct" / "no date" — and its colour. */
function due(t: StudioPersonData["tasks"][number]): { text: string; c: string } {
  if (t.done) return { text: t.closedDate ? `done ${fmt(t.closedDate)}` : t.status, c: "var(--st-ok-text)" };
  if (!t.deadline || t.days == null) return { text: "no date", c: "#A3A6AB" };
  if (t.days < 0) return { text: `${-t.days}d late`, c: "var(--st-late-text)" };
  if (t.days === 0) return { text: "Today", c: "var(--st-soon-text)" };
  const d = new Date(t.deadline);
  if (t.days <= 6) return { text: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }), c: "var(--st-soon-text)" };
  return { text: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), c: "var(--st-sub)" };
}

function Card({ title, right, children, className, texture }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; texture?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-[20px] bg-[var(--st-surface)] px-[22px] py-5", texture, className)}>
      {title != null && (
        <div className="flex min-h-[26px] shrink-0 items-center justify-between gap-3">
          <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
          {right && <div className="flex items-center gap-2 text-xs text-[var(--st-muted)]">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
function KV({ k, v }: { k: string; v: ReactNode }) {
  const empty = v == null || v === "";
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-2.5 border-b border-[var(--st-line-soft)] py-2 text-[13px] last:border-0">
      <span className="text-[var(--st-muted)]">{k}</span>
      <span className={cn("min-w-0 break-words", empty && "text-[#A3A6AB]")}>{empty ? "Not set" : v}</span>
    </div>
  );
}
const LINK = "hover:underline";
/** A column of cards; from xl it scrolls inside the fitted grid. */
const COL = "flex min-w-0 flex-col gap-4";
const BTN = "inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[var(--st-line)] px-2.5 text-xs transition-colors hover:bg-[var(--st-page)]";
const BTN_DARK = "inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-[var(--st-ink)] px-2.5 text-xs text-[var(--st-surface)] transition-opacity hover:opacity-90";
const BTN_BAD = "inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[var(--st-bad-line)] px-2.5 text-xs text-[var(--st-late-text)] transition-colors hover:bg-[var(--st-bad-wash)]";
const BAND_BTN = "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[#2E3035] px-[11px] text-xs text-[#E6E6E3] transition-colors hover:bg-[#1F2023] aria-disabled:pointer-events-none aria-disabled:opacity-40";

export function StudioPerson({ data, backHref }: { data: StudioPersonData; backHref: string }) {
  const { person: p, workload } = data;
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  // The tab (and the Tasks / Journey sub-choice) lives in the address so a link
  // or Back can land on it — but it is written with history.replaceState, NOT a
  // router navigation: this page is dynamic, and a navigation re-read the whole
  // person from the database on every tab click.
  const sp = useSearchParams();
  const [view, setView] = useState(() => ({ tab: sp.get("tab") ?? "overview", tf: sp.get("tf") ?? "open", jk: sp.get("jk") ?? "onboarding" }));
  const url = {
    values: view,
    set(patch: Partial<typeof view>) {
      const next = { ...view, ...patch };
      setView(next);
      const q = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(next)) {
        const dflt = k === "tab" ? "overview" : k === "tf" ? "open" : "onboarding";
        if (v === dflt) q.delete(k); else q.set(k, v);
      }
      const qs = q.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    },
  };
  const tab: Tab = (TABS as readonly string[]).includes(url.values.tab) ? (url.values.tab as Tab) : "overview";
  const [sheet, setSheet] = useState<null | "facts" | "pack">(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const { remind, pending: reminding } = useRemindPerson();
  const portalNow: PortalNow = {
    enabled: data.portal.enabled, role: asPortalRole(data.portal.role), designation: data.portal.designation,
    lastLoginAt: data.portal.lastLoginAt, directorCompanyIds: data.portal.directorCompanyIds, companyIds: p.companyIds,
  };
  const [portalDraft, setPortalDraft] = useState<PortalDraft>(() => draftFrom(portalNow));
  const here = `/people/${p.id}`;

  const open = data.tasks.filter((t) => !t.done);
  const overdueFirst = useMemo(() => [...open].sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999)), [open]);
  const monthName = new Date().toLocaleDateString("en-GB", { month: "short" });
  const portalRole = asPortalRole(data.portal.role);
  const subLine = [
    p.role,
    p.companyName ? `${p.companyName}${p.alsoCompanies.length ? ` and ${p.alsoCompanies.length} more` : ""}` : null,
    p.managerName ? `reports to ${shortName(p.managerName)}` : null,
  ].filter(Boolean).join(" · ");
  const snoozed = p.snoozedUntil && new Date(p.snoozedUntil) > new Date();
  const setTab = (t: Tab) => url.set({ tab: t });
  /** Portal access is edited in the profile's Edit tab, beside the companies it depends on. */
  const goPortal = () => { setTab("edit"); requestAnimationFrame(() => document.getElementById("portal")?.scrollIntoView({ behavior: "smooth", block: "center" })); };

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const r = await fn();
      toast(r.ok ? done : r.error || "Couldn't do that.", { tone: r.ok ? "success" : "danger" });
      if (r.ok) router.refresh();
    });
  }
  const newTaskHref = `/task/new?${new URLSearchParams({ ...(p.companyId ? { companyId: String(p.companyId) } : {}), assignees: p.name, returnTo: here }).toString()}`;
  const addDocHref = `/documents?newdoc=1&person=${p.id}&from=person:${p.id}`;
  const contact = p.whatsapp || p.phone || p.email;

  /* ── the band ──────────────────────────────────────────────────────────── */
  const band = (
    <div className="st-tex-rings flex shrink-0 flex-col gap-3.5 rounded-[20px] bg-[#141517] px-[22px] py-[18px] text-[#F2F2F0]">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={backHref} className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-[#F2F2F0] px-2.5 text-xs font-medium text-[#111214]">
          <Minimize2 size={13} strokeWidth={2.2} />People
        </Link>
        {p.staffId && <span className="st-mono rounded-md bg-[#26282C] px-2 py-1 text-[11px] text-[#C9CBCF]">{p.staffId}</span>}
        <span className="flex-1" />
        <div className="flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <a href={p.email ? `mailto:${p.email}` : undefined} aria-disabled={!p.email} title={p.email ?? "No email on file"} className={BAND_BTN}><Mail size={13} />Email</a>
          <a href={p.whatsapp ? waHref(p.whatsapp) : undefined} target="_blank" rel="noreferrer" aria-disabled={!p.whatsapp} title={p.whatsapp ?? "No WhatsApp on file"} className={BAND_BTN}><MessageCircle size={13} />WhatsApp</a>
          <a href={p.phone || p.whatsapp ? `tel:${p.phone ?? p.whatsapp}` : undefined} aria-disabled={!(p.phone || p.whatsapp)} className={BAND_BTN}><Phone size={13} />Call</a>
          <Link href={`/chat?dm=${p.id}`} className={BAND_BTN}><MessagesSquare size={13} />Chat</Link>
          <Link href={newTaskHref} className={BAND_BTN}><Plus size={13} />New task</Link>
          <Link href={addDocHref} className={BAND_BTN}><FileText size={13} />Add document</Link>
        </div>
        <button type="button" disabled={!open.length || reminding}
          onClick={() => remind(p, overdueFirst.map((t) => ({ code: t.code, actionItem: t.title })))}
          title={open.length ? "Saves a reminder in the Outbox for you to send" : "No open tasks"}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-[#F2F2F0] px-3 text-xs font-semibold text-[#111214] transition-opacity hover:opacity-90 disabled:opacity-40">
          {reminding ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}Remind about open work
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label="More" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[#2E3035] text-[#E6E6E3] hover:bg-[#1F2023]"><MoreHorizontal size={14} /></button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="studio z-[140] w-60 rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] p-1.5 text-[13px] shadow-[0_16px_40px_rgba(17,18,20,0.16)]">
              <MenuItem onSelect={() => setSheet("pack")} icon={<PackageCheck size={14} />}>Send a pack…</MenuItem>
              {contact && <MenuItem onSelect={() => { void navigator.clipboard.writeText(contact).then(() => toast(`Copied ${contact}`, { tone: "success" })); }} icon={<Copy size={14} />}>Copy contact</MenuItem>}
              <div className="my-1 h-px bg-[var(--st-line)]" />
              {snoozed
                ? <MenuItem onSelect={() => act(() => snoozePerson(p.id, null), "Snooze lifted.")} icon={<Clock size={14} />}>Lift the snooze</MenuItem>
                : <>
                    <MenuItem onSelect={() => act(() => snoozePerson(p.id, new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)), "Snoozed until tomorrow.")} icon={<Clock size={14} />}>Snooze until tomorrow</MenuItem>
                    <MenuItem onSelect={() => act(() => snoozePerson(p.id, new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)), "Snoozed for a week.")} icon={<Clock size={14} />}>Snooze for a week</MenuItem>
                  </>}
              <MenuItem onSelect={() => act(() => togglePersonActive(p.id), p.active ? "Deactivated — their leaving checklist has started." : "Restored.")} icon={p.active ? <UserMinus size={14} /> : <UserCheck size={14} />}>{p.active ? "Deactivate…" : "Restore"}</MenuItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className="flex flex-wrap items-end gap-[18px]">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-[#111214]" style={{ background: avatarTint(p.name) }}>{initials(shortName(p.name))}</span>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[28px] font-medium leading-none tracking-[-0.03em] sm:text-[36px]">{p.name}</h1>
          <div className="mt-2 text-sm text-[#A3A6AB]">{subLine || PERSON_TYPE_LABELS[p.personType]}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <BandPill c={p.active ? "#19C37D" : "#8E9197"} bg={p.active ? "#1D2A23" : "#26282C"} fg={p.active ? "#5BE0A5" : "#C9CBCF"}>{p.active ? (snoozed ? "Active · snoozed" : "Active") : "Inactive"}</BandPill>
          {data.portal.enabled
            ? <BandPill c="#2490EF" bg="#1B2633" fg="#9CC8F5">{data.portal.designation || `${ROLE_LABEL[portalRole]} portal`}</BandPill>
            : <BandPill c="#8E9197" bg="#26282C" fg="#C9CBCF">No portal</BandPill>}
        </div>
      </div>

      <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 [scrollbar-width:none]" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[13px] transition-colors", tab === t ? "bg-[#F2F2F0] text-[#111214]" : "text-[#C9CBCF] hover:text-white")}>
            {TAB_LABEL[t]}
            {t === "tasks" && open.length > 0 && <span className="text-xs text-[#8E9197]">{open.length}</span>}
            {t === "documents" && data.documents.length > 0 && <span className="text-xs text-[#8E9197]">{data.documents.length}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  /* ── Overview (the board) ─────────────────────────────────────────────── */
  const overview = (
    /* The page scrolls as one — a scrollbar per column was tried and the owner
       found it annoying (24 Sept 2026). */
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className={COL}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {([
            [workload.open, "open tasks", "var(--st-ink)", () => { url.set({ tab: "tasks", tf: "open" }); }],
            [workload.overdue, "overdue", workload.overdue ? "var(--st-late-text)" : "var(--st-ink)", () => { url.set({ tab: "tasks", tf: "open" }); }],
            [workload.completedThisMonth, `finished in ${monthName}`, "var(--st-ink)", () => { url.set({ tab: "tasks", tf: "done" }); }],
            [data.reports.length, "direct reports", "var(--st-ink)", null],
          ] as const).map(([n, l, c, go]) => (
            <button key={l} type="button" onClick={go ?? undefined} disabled={!go}
              className="rounded-[14px] bg-[var(--st-surface)] p-3.5 text-left transition-colors enabled:hover:bg-[var(--st-cal-busy)] disabled:cursor-default">
              <div className="text-[28px] leading-none tracking-[-0.03em] tabular-nums" style={{ color: c }}>{n}</div>
              <div className="mt-1.5 text-xs text-[var(--st-label)]">{l}</div>
            </button>
          ))}
        </div>

        <Card title="Open tasks" right={open.length > 0 && <button type="button" onClick={() => url.set({ tab: "tasks", tf: "open" })} className="text-[var(--st-ink)] hover:underline">All {open.length} →</button>}>
          <div className="mt-1.5 flex flex-col">
            {open.length === 0 && <div className="py-4 text-[13px] text-[var(--st-muted)]">Nothing open. {workload.completedThisMonth ? `${workload.completedThisMonth} finished this month.` : ""}</div>}
            {overdueFirst.slice(0, 5).map((t) => {
              const d = due(t);
              return (
                <Link key={t.code} href={withReturn(taskHref(t.code), here)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[var(--st-line-soft)] py-2 text-[13px] last:border-0 hover:bg-[var(--st-cal-busy)]">
                  <span className="truncate"><span className="st-mono text-[11px] text-[var(--st-muted)]">{t.code}</span> {t.title}</span>
                  <span className="text-xs" style={{ color: d.c }}>{d.text}</span>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card title="Tracked facts" right="with their source" texture="st-tex-paper-rings">
          <p className="mt-1.5 text-[13px] leading-normal text-[var(--st-sub)]">Contract, passport, bank and other facts — each dated, sourced and kept with its history, never overwritten.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setSheet("facts")} className={BTN_DARK}>Record a fact</button>
            <button type="button" onClick={() => setTab("documents")} className={BTN}>Documents on file</button>
          </div>
        </Card>
      </div>

      <div className={COL}>
        <Card title="Role & companies" right={<button type="button" onClick={() => setTab("edit")} className="hover:text-[var(--st-ink)]">Edit</button>}>
          <div className="mt-1.5">
            <KV k="Job title" v={p.role} />
            <KV k="Type" v={PERSON_TYPE_LABELS[p.personType]} />
            <KV k="Main company" v={p.companyName && p.companyId ? <Link href={`/companies/${p.companyId}`} className={LINK}>{p.companyName}</Link> : p.companyName} />
            <KV k="Also works for" v={p.alsoCompanies.length ? <span title={p.alsoCompanies.join(", ")}>{p.alsoCompanies.length > 2 ? `${p.alsoCompanies.length} more companies` : p.alsoCompanies.join(", ")}</span> : "—"} />
            <KV k="Reports to" v={p.managerName && p.managerId ? <Link href={withReturn(`/people/${p.managerId}`, here)} className={LINK}>{shortName(p.managerName)}</Link> : p.managerName} />
            <KV k="Also reports to" v={p.secondaryManagers.length ? p.secondaryManagers.map((m, i) => <span key={m.id}>{i > 0 && ", "}<Link href={withReturn(`/people/${m.id}`, here)} className={LINK}>{shortName(m.name ?? "")}</Link></span>) : "—"} />
            <KV k="Department" v={p.departmentName} />
            <KV k="Started" v={fmt(p.startDate)} />
            {p.probationEndDate && <KV k="Probation ends" v={fmt(p.probationEndDate)} />}
          </div>
        </Card>
        <Card title="Contact" right={<button type="button" onClick={() => setTab("edit")} className="hover:text-[var(--st-ink)]">Edit</button>}>
          <div className="mt-1.5">
            <KV k="Email" v={p.email && <a href={`mailto:${p.email}`} className={LINK}>{p.email}</a>} />
            <KV k="Phone · WhatsApp" v={[p.phone, p.whatsapp && p.whatsapp !== p.phone ? `WA ${p.whatsapp}` : null].filter(Boolean).join(" · ") || null} />
            <KV k="Prefers" v={p.preferredChannel ? p.preferredChannel.charAt(0) + p.preferredChannel.slice(1).toLowerCase() : null} />
            <KV k="Works at" v={p.workSite} />
            <KV k="Lives at" v={p.residence} />
          </div>
          <button type="button" onClick={() => setPersonalOpen((v) => !v)} aria-expanded={personalOpen} className="mt-2.5 flex w-full items-center justify-between text-left text-xs text-[var(--st-muted)] hover:text-[var(--st-ink)]">
            <span>Personal — date of birth, ID, passport, emergency contact</span><ChevronDown size={12} className={cn("transition-transform", personalOpen && "rotate-180")} />
          </button>
          {personalOpen && (
            <div className="st-pop mt-1">
              <KV k="Date of birth" v={fmt(p.dateOfBirth)} />
              <KV k="Nationality" v={p.nationality} />
              <KV k="National ID" v={p.nationalId} />
              <KV k="Passport no." v={p.passportNo} />
              <KV k="Address" v={p.address} />
              <KV k="Emergency" v={[p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(" · ") || null} />
              {p.relatedPersonName && <KV k="Related to" v={p.relatedPersonName} />}
              {p.notes && <KV k="Notes" v={<span className="whitespace-pre-wrap">{p.notes}</span>} />}
            </div>
          )}
        </Card>
      </div>

      <div className={cn(COL, "lg:col-span-2 xl:col-span-1")}>
        <Card title="Portal access" right={data.portal.enabled ? ROLE_LABEL[portalRole] : "None"}>
          <p className="mt-1.5 text-[13px] leading-normal text-[var(--st-sub)]">
            {data.portal.enabled
              ? <>Signs in at the staff portal. {SCOPE_SENTENCE(data.portalScope[portalRole])}{" "}{data.portal.lastLoginAt ? `Last signed in ${fmt(data.portal.lastLoginAt)}.` : "Has never signed in."}</>
              : "No portal login — they can't see or update their tasks themselves."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.portal.enabled ? (
              <>
                <button type="button" onClick={() => goPortal()} className={BTN}>Change level</button>
                <button type="button" onClick={() => goPortal()} className={BTN}>Reset password</button>
                <button type="button" disabled={busy} onBlur={() => setConfirmRevoke(false)}
                  onClick={() => { if (!confirmRevoke) { setConfirmRevoke(true); return; } setConfirmRevoke(false); act(() => revokePortalAccessQuick(p.id), "Portal access revoked."); }}
                  className={cn(BTN_BAD, confirmRevoke && "bg-[var(--st-late)] text-white")}>{confirmRevoke ? "Press again to revoke" : "Revoke"}</button>
              </>
            ) : (
              <button type="button" onClick={() => goPortal()} className={BTN_DARK}>Give portal access</button>
            )}
          </div>
        </Card>

        {data.reports.length > 0 && (
          <Card title="Direct reports" right={data.reports.length}>
            <div className="mt-2.5 flex flex-col gap-2">
              {data.reports.map((r) => (
                <Link key={`${r.id}-${r.dotted}`} href={withReturn(`/people/${r.id}`, here)} className="flex items-center gap-2.5 rounded-lg hover:bg-[var(--st-cal-busy)]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[#111214]" style={{ background: avatarTint(r.name) }}>{initials(shortName(r.name))}</span>
                  <span className="min-w-0 flex-1 text-[13px]">
                    <span className="block truncate">{shortName(r.name)}{r.dotted && <span className="text-[var(--st-muted)]"> (also)</span>}</span>
                    <span className="block truncate text-[11px] text-[var(--st-muted)]">{[r.role, r.companyName].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: r.overdue ? "var(--st-late-text)" : "var(--st-sub)" }}>{r.overdue ? `${r.overdue} late` : r.open ? `${r.open} open` : "—"}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card title="Journey & equipment" texture="st-tex-paper-dots">
          <p className="mt-1.5 text-[13px] leading-normal text-[var(--st-sub)]">
            {p.active ? "Onboarding and leaving checklists, and the equipment signed out to them." : "They have left — their leaving checklist and anything still to be handed back."}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => url.set({ tab: "journey", jk: p.active ? "onboarding" : "offboarding" })} className={BTN_DARK}>{p.active ? "Onboarding" : "Leaving checklist"}</button>
            <button type="button" onClick={() => setTab("equipment")} className={BTN}>Equipment</button>
          </div>
        </Card>

        <section className="flex flex-wrap items-center gap-2.5 rounded-[20px] bg-[var(--st-surface)] px-[18px] py-3.5">
          <div className="min-w-[180px] flex-1">
            <div className="text-[14px] font-semibold">Danger zone</div>
            <div className="mt-0.5 text-xs text-[var(--st-muted)]">Snooze, deactivate, or delete for good (asks you to type the name).</div>
          </div>
          <button type="button" disabled={busy} onClick={() => act(() => togglePersonActive(p.id), p.active ? "Deactivated — their leaving checklist has started." : "Restored.")} className={BTN}>{p.active ? "Deactivate" : "Restore"}</button>
          <DeletePersonDialog personId={p.id} personName={p.name} label="Delete…" triggerClassName={BTN_BAD} />
        </section>
      </div>
    </div>
  );

  /* ── Tasks ─────────────────────────────────────────────────────────────── */
  const shownTasks = url.values.tf === "done" ? data.tasks.filter((t) => t.done) : url.values.tf === "all" ? data.tasks : overdueFirst;
  const tasksTab = (
    <Card title={`Tasks · ${shownTasks.length}`} right={
      <span className="flex items-center gap-2">
        <span className="flex gap-0.5 rounded-[10px] bg-[var(--st-seg)] p-[3px]">
          {([["open", `Open ${open.length}`], ["done", "Done"], ["all", "All"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => url.set({ tf: k })} className={cn("h-7 rounded-lg px-2.5 text-xs", url.values.tf === k ? "bg-[var(--st-surface)] font-medium text-[var(--st-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)]")}>{l}</button>
          ))}
        </span>
        <Link href={newTaskHref} className={BTN_DARK}><Plus size={12} />New task</Link>
      </span>
    }>
      <div className="mt-2 flex flex-col">
        {shownTasks.length === 0 && <div className="py-8 text-center text-[13px] text-[var(--st-muted)]">Nothing here.</div>}
        {shownTasks.map((t) => {
          const d = due(t);
          return (
            <Link key={t.code} href={withReturn(taskHref(t.code), `${here}?tab=tasks${url.values.tf !== "open" ? `&tf=${url.values.tf}` : ""}`)}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-[var(--st-line-soft)] py-2.5 text-[13px] last:border-0 hover:bg-[var(--st-cal-busy)] sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,180px)_110px_90px]">
              <span className="st-mono hidden text-[11px] text-[var(--st-muted)] sm:block">{t.code}</span>
              <span className="min-w-0 truncate"><span className="st-mono text-[11px] text-[var(--st-muted)] sm:hidden">{t.code} </span>{t.title}</span>
              <span className="hidden truncate text-xs text-[var(--st-muted)] sm:block">{t.companyName}</span>
              <span className="hidden text-xs text-[var(--st-sub)] sm:block">{t.status}</span>
              <span className="text-right text-xs" style={{ color: d.c }}>{d.text}</span>
            </Link>
          );
        })}
      </div>
    </Card>
  );

  /* ── Documents ─────────────────────────────────────────────────────────── */
  const docTone = (s: string) => (s === "Expired" ? "var(--st-late-text)" : s === "Expiring" || s === "Due soon" ? "var(--st-soon-text)" : "var(--st-sub)");
  const docsTab = (
    <Card title={`Documents · ${data.documents.length}`} right={<Link href={addDocHref} className={BTN_DARK}><Plus size={12} />Add document</Link>}>
      <div className="mt-2 flex flex-col">
        {data.documents.length === 0 && <div className="py-8 text-center text-[13px] text-[var(--st-muted)]">Nothing filed against {shortName(p.name)} yet.</div>}
        {data.documents.map((d) => (
          <Link key={d.id} href={withReturn(`/documents/${d.id}`, `${here}?tab=documents`)}
            className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-[var(--st-line-soft)] py-2.5 last:border-0 hover:bg-[var(--st-cal-busy)]">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-[var(--st-page)] text-[var(--st-sub)]"><FileText size={15} /></span>
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{d.title}</span>
              <span className="block truncate text-[11px] text-[var(--st-muted)]">{[d.category, d.docType, d.companyName].filter(Boolean).join(" · ") || "Document"}</span>
            </span>
            <span className="text-right text-xs" style={{ color: docTone(d.status) }}>
              {d.expiryLabel ?? d.status}
              {d.expiryDate && <span className="block text-[11px] text-[var(--st-muted)]">{fmt(d.expiryDate)}</span>}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );

  /* ── Journey / Equipment / Notes / History / Edit ─────────────────────── */
  const journeyTab = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card title={url.values.jk === "offboarding" ? "Leaving checklist" : "Onboarding"} right={
        <span className="flex gap-0.5 rounded-[10px] bg-[var(--st-seg)] p-[3px]">
          {(["onboarding", "offboarding"] as const).map((k) => (
            <button key={k} type="button" onClick={() => url.set({ jk: k })} className={cn("h-7 rounded-lg px-2.5 text-xs", url.values.jk === k ? "bg-[var(--st-surface)] font-medium text-[var(--st-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)]")}>{k === "onboarding" ? "Onboarding" : "Leaving"}</button>
          ))}
        </span>
      }>
        <div className="mt-3"><JourneyChecklist studio key={url.values.jk} personId={p.id} kind={url.values.jk === "offboarding" ? "offboarding" : "onboarding"} onChanged={() => router.refresh()} /></div>
      </Card>
      <Card title="Probation">
        <div className="mt-3"><PersonProbation personId={p.id} probationEndDate={p.probationEndDate} onChanged={() => router.refresh()} /></div>
      </Card>
    </div>
  );
  const equipmentTab = (
    <Card title="Equipment" right="signed out to them, or in their care">
      <div className="mt-3"><StudioPersonEquipment personId={p.id} firstName={shortName(p.name).split(" ")[0]} onChanged={() => router.refresh()} /></div>
    </Card>
  );
  const notesTab = (
    <Card title="Notes" right={<span>notes that mention {shortName(p.name)}</span>}>
      <div className="mt-3">
        <LinkedNotesTab type="person" id={p.id} emptyHint={`Write @${p.name} in any note and it will appear here.`} about={{ entity: "person", id: p.id, label: p.name }} />
      </div>
    </Card>
  );
  const historyTab = (
    <Card title="History" right={`${data.events.length} changes`}>
      {data.events.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[var(--st-muted)]">No changes recorded yet.</div>
      ) : (
        <ol className="relative mt-3 ml-2 flex flex-col gap-3.5 border-l border-[var(--st-line)] pl-5">
          {data.events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[25px] top-1 h-2 w-2 rounded-full bg-[var(--st-ink)] ring-4 ring-[var(--st-surface)]" />
              <div className="text-[11px] text-[var(--st-muted)]">{new Date(e.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {personActor(e.createdBy)}</div>
              <div className="text-[13px] leading-snug">
                {e.action === "updated" && e.field
                  ? <><span className="text-[var(--st-sub)]">{e.field}:</span> {e.oldValue ?? "—"} <span className="text-[var(--st-muted)]">→</span> {e.newValue ?? "—"}</>
                  : <>{PERSON_ACTION_LABEL[e.action]}{e.detail ? <span className="text-[var(--st-sub)]"> · {e.detail}</span> : null}</>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
  const editTab = (
    <PersonForm studio mode="edit" id={p.id} defaults={data.editDefaults} companies={data.lookups.companies} peopleList={data.lookups.peopleList}
      departments={data.lookups.departments} sites={data.lookups.sites} roles={data.lookups.roles}
      afterRole={<div id="portal"><PortalEditor now={portalNow} draft={portalDraft} onChange={setPortalDraft} scope={data.portalScope}
        companyNames={[p.companyName, ...p.alsoCompanies].filter((n): n is string => !!n)} personName={p.name} /></div>}
      afterSave={() => applyPortalDraft(p.id, portalNow, portalDraft)}
      onCancel={() => { setPortalDraft(draftFrom(portalNow)); setTab("overview"); }}
      onComplete={(res) => { if (!res.ok) return; toast("Saved.", { tone: "success" }); setPortalDraft((d) => ({ ...d, password: "" })); setTab("overview"); router.refresh(); }} />
  );

  return (
    <StudioScope className="flex flex-col gap-4">
      {band}
      {tab === "overview" && overview}
      {tab === "tasks" && tasksTab}
      {tab === "documents" && docsTab}
      {tab === "journey" && journeyTab}
      {tab === "equipment" && equipmentTab}
      {tab === "notes" && notesTab}
      {tab === "history" && historyTab}
      {tab === "edit" && editTab}

      <StudioSheet open={sheet === "facts"} onClose={() => setSheet(null)} title="Tracked facts" width={680}>
        <FactsPanel entityType="person" entityId={p.id} />
      </StudioSheet>
      <StudioSheet open={sheet === "pack"} onClose={() => setSheet(null)} title={`Send ${shortName(p.name)} a pack`} width={680}>
        <PersonPackPanel studio personId={p.id} personName={p.name} onBack={() => setSheet(null)} />
      </StudioSheet>
    </StudioScope>
  );
}

/** What each portal scope lets them see, in a sentence. */
const SCOPE_SENTENCE = (l: ScopeLevel | undefined) => (l ? `Sees ${SCOPE_WORDS[l]}.` : "");

function BandPill({ c, bg, fg, children }: { c: string; bg: string; fg: string; children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-[7px] whitespace-nowrap rounded-lg px-2.5 text-xs" style={{ background: bg, color: fg }}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: c }} />{children}
    </span>
  );
}
function MenuItem({ onSelect, icon, children }: { onSelect: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-[var(--st-page)]">
      {icon}<span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  );
}
void Check; void ExternalLink;
