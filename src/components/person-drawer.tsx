"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  X, Mail, Phone, MessageCircle, MoonStar, UserX, AlertCircle,
  Briefcase, Building2, ExternalLink, Activity, ListTodo, Pencil, Archive,
  RotateCcw, Clock, Send, FileText, ShieldCheck, Package, Route as RouteIcon,
  LayoutDashboard, IdCard, CheckCircle2, AlertTriangle, PackageCheck, CalendarDays, Plane, Cake, Users,
  Rocket, LogOut, ListPlus, ChevronLeft, ChevronRight, Wrench,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getInitials as initials } from "@/lib/names";
import { EntityDrawer, type DrawerTab } from "./entity-drawer";
import { HrmsDialog } from "./hrms/hrms-dialog";
import { IconButton, EmptyState, SectionCard, DefGrid, GroupLabel, CollapsibleSection } from "./drawer-kit";
import { CompanyDrawerLink } from "./company-drawer-link";
import { StaffIdChip } from "./staff-id-chip";
import { TaskDrawerLink } from "./task-drawer-link";
import { PersonForm } from "./person-form";
import { PersonPackPanel } from "./person-pack-builder";
import { RequirementsChecklist } from "./requirements-checklist";
import { DocumentForm } from "./document-form";
import { NewTaskForm } from "@/app/task/new/new-task-form";
import { JourneyChecklist } from "./journey-checklist";
import { PersonAssets } from "./person-assets";
import { Badge, Button } from "./ui";
import { useToast } from "./toast";
import { togglePersonActive, snoozePerson } from "@/app/people/actions";
import { PersonPortalAccess } from "./person-portal-access";
import { getDocumentFileLinkAction } from "@/app/documents/actions";
import { createPersonPackDraftAction } from "@/app/people/pack-actions";
import { pickChannel } from "@/lib/outbox/links";
import type { TaskRow } from "@/lib/queries";
import { isPersonPackPurpose, type PersonPackPurpose } from "@/lib/person-pack-shared";
import { personTypeLabel, type PersonType } from "@/lib/person-types";
import { PERSON_ACTION_LABEL, personActor, type PersonEvent } from "@/lib/person-audit-shared";
import { PersonLeave } from "./person-leave";
import { PersonProbation } from "./person-probation";
import { FactsPanel } from "./facts-panel";
import { SuggestionTray } from "./suggestion-tray";
import type { ProfileSuggestion } from "@/lib/profile-suggestions";
import type { PersonLeaveBalance, LeaveRequestRow } from "@/lib/leave-shared";
import type { PersonAttendanceSummary } from "@/lib/leave";

/* -------------------------------------------------------------------------
 * API payload types — mirror lib/people-queries.ts PersonDetail
 * ---------------------------------------------------------------------- */
type DrawerPerson = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredChannel: string | null;
  role: string | null;
  companyId: number | null;
  companyName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  startDate: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  nationalId: string | null;
  passportNo: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  probationEndDate: string | null;
  contactStatus: string | null;
  active: boolean;
  notes: string | null;
  snoozedUntil: string | null;
  managerId: number | null;
  managerName: string | null;
  personType: PersonType;
  relatedPersonId: number | null;
  relatedPersonName: string | null;
  associations: Array<{ companyId: number; companyName: string | null; relationship: string | null }>;
  secondaryManagers: Array<{ id: number; name: string | null }>;
  staffId: string | null;
  previousStaffIds: string | null;
  staffCategory: string | null;
  workSiteId: number | null;
  workSiteName: string | null;
  residenceSiteId: number | null;
  residenceName: string | null;
};

type DrawerData = {
  person: DrawerPerson;
  workload: {
    open: number;
    overdue: number;
    dueSoon: number;
    blocked: number;
    escalated: number;
    completedThisMonth: number;
  };
  kpiMonths: Array<{
    personId: number;
    year: number;
    month: number;
    monthLabel: string;
    createdDone: number;
    involvedDone: number;
    ledDone: number;
    onTimeCount: number;
    lateCount: number;
    onTimeRate: number | null;
    openInvolved: number;
    overdueOpen: number;
    score: number;
    excluded: boolean;
  }>;
  assignedTasks: TaskRow[];
  documents: Array<{
    id: number;
    title: string;
    category: string | null;
    docType: string | null;
    expiryDate: string | null;
    reminderLeadDays: number;
    status: "Valid" | "Expiring" | "Expired" | "No expiry" | "Archived";
    expiryLabel: string | null;
    companyId: number | null;
    companyName: string | null;
  }>;
  recentUpdates: Array<{
    id: number;
    taskId: number;
    taskCode: string;
    taskTitle: string;
    body: string;
    createdAt: string;
  }>;
  companies: Array<{ id: number; name: string }>;
  peopleList: Array<{ id: number; name: string; active: boolean }>;
  departments: string[];
  sites: string[];
  roles: string[];
  events: PersonEvent[];
  leave: { balances: PersonLeaveBalance[]; requests: LeaveRequestRow[]; attendance: PersonAttendanceSummary };
  portal: { enabled: boolean; role: string; lastLoginAt: string | null };
  directReports: Array<{ id: number; name: string; role: string | null; companyName: string | null; kind: "primary" | "dotted" }>;
  suggestions: ProfileSuggestion[];
  appliedSuggestions: ProfileSuggestion[];
};

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function fmtTime(d: Date) {
  return d.toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Compact relative time for the audit trail. */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** One audit row: "Changed Role · Clerk → Senior Clerk". */
function personEventText(e: PersonEvent): string {
  if (e.action === "updated" && e.field) {
    const from = e.oldValue ?? "—";
    const to = e.newValue ?? "—";
    return `${e.field}: ${from} → ${to}`;
  }
  return PERSON_ACTION_LABEL[e.action] + (e.detail ? ` · ${e.detail}` : "");
}

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

function documentTone(status: string): "default" | "success" | "warn" | "danger" | "info" {
  if (status === "Expired") return "danger";
  if (status === "Expiring") return "warn";
  if (status === "Valid") return "success";
  return "default";
}

function whatsappHref(num: string) {
  // strip non-digits then prefix wa.me
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

/** Monthly task KPI scorecard with a month stepper. Delivery credit (involved)
 *  and creator credit are kept as separate numbers — see src/lib/kpi.ts. */
function KpiCard({
  months,
  onOpenTasks,
}: {
  months: DrawerData["kpiMonths"];
  onOpenTasks: () => void;
}) {
  const [idx, setIdx] = useState(0); // 0 = current month, higher = older
  const kpi = months[idx];
  if (!kpi) return null;
  const ratePct = kpi.onTimeRate == null ? null : Math.round(kpi.onTimeRate * 100);
  const rateTone =
    ratePct == null ? "text-fg-subtle" : ratePct >= 80 ? "text-success" : ratePct >= 50 ? "text-warn" : "text-danger";
  const scoreTone = kpi.score > 0 ? "text-success" : kpi.score < 0 ? "text-danger" : "text-fg-muted";
  return (
    <div className="bg-bg-elev rounded-xl ring-1 ring-border/60 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-muted">
        <button type="button" onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))} disabled={idx >= months.length - 1}
          className="p-0.5 rounded hover:bg-bg-muted/60 disabled:opacity-30 transition-colors" aria-label="Previous month">
          <ChevronLeft size={15} />
        </button>
        <span className="normal-case tabular">KPI · {kpi.monthLabel}</span>
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}
          className="p-0.5 rounded hover:bg-bg-muted/60 disabled:opacity-30 transition-colors" aria-label="Next month">
          <ChevronRight size={15} />
        </button>
        <span className={cn("ml-auto text-base font-semibold tabular normal-case", scoreTone)}>{kpi.score}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border/50">
        <div className="px-4 py-3 text-center">
          <div className="text-lg font-semibold tabular leading-none text-info">{kpi.involvedDone}</div>
          <div className="mt-1 text-[10px] text-fg-muted leading-tight">
            Completed{kpi.involvedDone > 0 ? ` · ${kpi.ledDone} led` : ""}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-lg font-semibold tabular leading-none text-accent">{kpi.createdDone}</div>
          <div className="mt-1 text-[10px] text-fg-muted leading-tight">Created &amp; done</div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border/50 border-t border-border/50">
        <div className="px-4 py-2.5 text-center">
          <div className={cn("text-sm font-semibold tabular leading-none", rateTone)}>
            {ratePct == null ? "—" : `${ratePct}%`}
          </div>
          <div className="mt-1 text-[10px] text-fg-subtle leading-tight">
            On time{kpi.lateCount > 0 ? ` · ${kpi.lateCount} late` : ""}
          </div>
        </div>
        <button type="button" onClick={onOpenTasks} className="px-4 py-2.5 text-center hover:bg-bg-muted/50 transition-colors">
          <div className={cn("text-sm font-semibold tabular leading-none", kpi.overdueOpen ? "text-danger" : "text-fg-muted")}>
            {kpi.openInvolved}
          </div>
          <div className="mt-1 text-[10px] text-fg-subtle leading-tight">
            Open now{kpi.overdueOpen > 0 ? ` · ${kpi.overdueOpen} overdue` : ""}
          </div>
        </button>
      </div>
    </div>
  );
}

/** Quick reminder text built from a person's open tasks. */
function buildPersonReminder(name: string, tasks: { code: string; actionItem: string; status: string }[]): string {
  const open = tasks.filter((t) => t.status !== "Completed" && t.status !== "Closed").slice(0, 8);
  const lines = [`Hi ${name}, a quick reminder on your open items:`, ""];
  open.forEach((t) => lines.push(`• ${t.actionItem} (${t.code})`));
  lines.push("", "Please update the tracker when you can. Thanks.");
  return lines.join("\n");
}

function parsePackPurpose(value: string | null): PersonPackPurpose | undefined {
  return isPersonPackPurpose(value) ? value : undefined;
}

function AlertCircleMini() {
  return <AlertCircle size={11} />;
}

/** Compliance score ring (null = not loaded yet). */
function Ring({ score, band }: { score: number | null; band: "Good" | "Watch" | "Risk" | null }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const dash = ((score ?? 0) / 100) * c;
  const colour = band === "Good" ? "var(--success)" : band === "Watch" ? "var(--warn)" : band === "Risk" ? "var(--danger)" : "var(--border)";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={`hsl(${colour})`} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${dash} ${c}`} style={{ transition: "stroke-dasharray .5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular">{score == null ? "—" : `${score}%`}</div>
    </div>
  );
}

/** Header for a deep view reached from a chip / the More menu. */
function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" onClick={onBack}
      className="-mt-1 mb-1 inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-accent transition-colors">
      <ChevronLeft size={14} /> {label}
    </button>
  );
}

/* -------------------------------------------------------------------------
 * PersonDrawer
 * ---------------------------------------------------------------------- */
export function PersonDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const idStr = searchParams.get("person");
  const openPack = searchParams.get("pack") === "1";
  const packPurpose = parsePackPurpose(searchParams.get("purpose"));
  const open = !!idStr;

  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [activeTab, setActiveTab] = useState("snapshot");
  // Where a deep view's "Back" returns to (the chip/menu it was opened from).
  const [backTo, setBackTo] = useState("snapshot");
  // Which lifecycle journey the Journey tab is showing. Defaults to the
  // lifecycle-relevant one (onboarding while active, offboarding once archived)
  // but you can switch to view/prepare the other regardless of active state.
  const [journeyKind, setJourneyKind] = useState<"onboarding" | "offboarding">("onboarding");
  const [packOpen, setPackOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [snoozeInput, setSnoozeInput] = useState<string>("");
  const [actionPending, setActionPending] = useState(false);
  // One-tap Remind result, shown as an inline confirmation in the footer.
  const [remindInfo, setRemindInfo] = useState<{ created: boolean; link: string | null; contactMissing: boolean } | null>(null);
  // In-place "add document" — layered over the person so the flow stays
  // immersive (no navigation to /documents, no background page switch).
  const [addDoc, setAddDoc] = useState<{ title?: string; category: string | null } | null>(null);
  // In-place "new task" — opens the standard NewTaskForm layered over the
  // person, with their name + company pre-filled (the commonest HR action).
  const [newTask, setNewTask] = useState(false);
  // Headline summaries reported up by the section components, for the hero tiles.
  const [compSum, setCompSum] = useState<{ score: number; band: "Good" | "Watch" | "Risk"; missing: number; total: number } | null>(null);
  const [journeySum, setJourneySum] = useState<{ completed: number; total: number } | null>(null);
  const [assetsSum, setAssetsSum] = useState<{ held: number } | null>(null);
  const { toast } = useToast();

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("person");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!idStr) { setData(null); setMode("view"); setSnoozeInput(""); return; }
    setCompSum(null); setJourneySum(null); setAssetsSum(null);
    setLoading(true);
    setError(false);
    fetch(`/api/people-detail?id=${encodeURIComponent(idStr)}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d: DrawerData) => {
        setData(d);
        setLoading(false);
        // Default the Journey tab to the lifecycle-relevant journey.
        setJourneyKind(d.person.active ? "onboarding" : "offboarding");
        // Seed snooze input from current value (YYYY-MM-DD)
        if (d.person.snoozedUntil) {
          setSnoozeInput(d.person.snoozedUntil.slice(0, 10));
        }
      })
      .catch(() => { setError(true); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idStr, refreshKey]);

  // Reset to view mode + Overview whenever a new person opens
  useEffect(() => { setMode("view"); setActiveTab("snapshot"); setBackTo("snapshot"); setRemindInfo(null); setPackOpen(openPack); setNewTask(false); setAddDoc(null); }, [idStr, openPack]);

  const refresh = () => setRefreshKey((k) => k + 1);
  // Open a deep view, remembering where to return ("snapshot" by default, "more"
  // when launched from the More menu).
  const openView = useCallback((id: string, from = "snapshot") => { setBackTo(from); setActiveTab(id); }, []);
  const goBack = useCallback(() => setActiveTab(backTo), [backTo]);

  // After creating a task from the in-place dialog, createTask redirects back to
  // this URL carrying ?taskcreated=… — pick that up, close the dialog, refresh
  // the drawer's data (Tasks tab + Open tile), then strip the one-shot marker.
  const taskCreated = searchParams.get("taskcreated");
  useEffect(() => {
    if (!taskCreated) return;
    setNewTask(false);
    refresh();
    toast("Task created.", { tone: "success" });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("taskcreated");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskCreated]);

  // Open a person document's stored file in place (new tab); fall back to the
  // Documents centre when there's no attached file.
  const openDocFile = async (docId: number) => {
    const res = await getDocumentFileLinkAction(docId);
    if (res.ok) window.open(res.url, "_blank", "noopener,noreferrer");
    else router.push(`/documents?person=${person?.id ?? ""}&from=person:${person?.id ?? ""}`);
  };

  const handleArchiveToggle = async () => {
    if (!person) return;
    setActionPending(true);
    const res = await togglePersonActive(person.id);
    setActionPending(false);
    if (res.ok) {
      toast(res.active ? "Person restored." : "Person archived.", { tone: "success" });
      refresh();
    } else {
      toast(res.error, { tone: "danger" });
    }
  };

  const handleSnoozeSave = async () => {
    if (!person) return;
    setActionPending(true);
    const res = await snoozePerson(person.id, snoozeInput || null);
    setActionPending(false);
    if (res.ok) {
      toast(snoozeInput ? "Snoozed." : "Snooze cleared.", { tone: "success" });
      refresh();
    } else {
      toast(res.error, { tone: "danger" });
    }
  };

  // Quick reminder: always saves a (de-duplicated) Outbox draft and, when the
  // person has a usable contact, opens the channel deep-link pre-filled.
  const handleRemind = async () => {
    if (!person || !data) return;
    const body = buildPersonReminder(person.name, data.assignedTasks);
    const channel = pickChannel(person);
    setActionPending(true);
    const res = await createPersonPackDraftAction({
      personId: person.id,
      purpose: "task-reminder",
      sections: "openTasks",
      channel,
      subject: `Reminder: your open items`,
      body,
    });
    setActionPending(false);
    if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
    // One-tap: don't auto-open — show an inline confirmation with next steps.
    setRemindInfo({ created: res.created, link: res.link ?? null, contactMissing: !!res.contactMissing });
  };

  const person = data?.person;
  const snoozed = person?.snoozedUntil ? new Date(person.snoozedUntil) > new Date() : false;

  const band = compSum?.band ?? null;
  const tone: "accent" | "success" | "warn" | "danger" =
    !person?.active ? "accent" : band === "Risk" ? "danger" : band === "Watch" ? "warn" : band === "Good" ? "success" : "accent";
  const avatarTone =
    !person?.active ? "bg-bg-subtle text-fg-muted ring-border"
    : band === "Risk" ? "bg-danger-soft text-danger ring-danger/30"
    : band === "Watch" ? "bg-warn-soft text-warn ring-warn/30"
    : band === "Good" ? "bg-success-soft text-success ring-success/30"
    : "bg-accent-soft text-accent ring-accent/30";

  const docIssues = data ? data.documents.filter((d) => d.status === "Expired" || d.status === "Expiring") : [];
  const overdueTasks = data ? data.assignedTasks.filter((t) => t.flag === "overdue" || t.flag === "escalate-now") : [];
  const openTasks = data?.workload.open ?? 0;

  // Leave snapshot derived from the detail payload.
  const todayISO = new Date().toISOString().slice(0, 10);
  const leaveReqs = data?.leave.requests ?? [];
  const onLeaveNow = leaveReqs.some((r) => r.status === "Approved" && r.startDate.slice(0, 10) <= todayISO && r.endDate.slice(0, 10) >= todayISO);
  const pendingLeave = leaveReqs.filter((r) => r.status === "Pending").length;
  const nextLeave = leaveReqs
    .filter((r) => r.status === "Approved" && r.startDate.slice(0, 10) > todayISO)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

  // Service length + upcoming work anniversary (4b).
  const serviceYears = person?.startDate ? Math.floor((Date.now() - new Date(person.startDate).getTime()) / (365.25 * 86400000)) : 0;
  const anniversary = (() => {
    if (!person?.startDate) return null;
    const start = new Date(person.startDate);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const next = new Date(now.getFullYear(), start.getUTCMonth(), start.getUTCDate());
    if (next < todayMidnight) next.setFullYear(now.getFullYear() + 1);
    const days = Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
    const years = next.getFullYear() - start.getUTCFullYear();
    return days <= 14 && years >= 1 ? { days, years } : null;
  })();

  // Profile completeness — share of key HR fields on record (6a).
  const completeness = (() => {
    if (!person) return null;
    const fields = [
      person.email || person.phone || person.whatsapp, person.role, person.companyId,
      person.dateOfBirth, person.nationality, person.nationalId || person.passportNo,
      person.address, person.emergencyContactName, person.startDate, person.departmentId,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  })();

  const goToManager = (mid: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(mid));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // ── Hero ────────────────────────────────────────────────────────────
  const heroNode = person ? (
    <div className="flex items-start gap-3.5 pr-8">
      <span className={cn("h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-2xl text-base font-semibold ring-1", avatarTone)}>
        {initials(person.name)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold leading-tight truncate">{person.name}</h2>
          <StaffIdChip id={person.staffId} />
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-muted">
          {person.role && <span className="inline-flex items-center gap-1"><Briefcase size={11} /> {person.role}</span>}
          {person.companyName && person.companyId && (
            <>
              {person.role && <span className="text-fg-subtle">·</span>}
              <CompanyDrawerLink id={person.companyId} className="inline-flex items-center gap-1 hover:text-accent transition-colors">
                <Building2 size={11} /> {person.companyName}
              </CompanyDrawerLink>
            </>
          )}
          {person.managerName && person.managerId && (
            <>
              <span className="text-fg-subtle">·</span>
              <button type="button" onClick={() => goToManager(person.managerId!)} className="hover:text-accent transition-colors">↳ {person.managerName}</button>
              {person.secondaryManagers.length > 0 && (
                <span className="text-fg-subtle" title={`Also reports to ${person.secondaryManagers.map((m) => m.name).filter(Boolean).join(", ")}`}>
                  +{person.secondaryManagers.length}
                </span>
              )}
            </>
          )}
          {data.directReports.length > 0 && (
            <>
              <span className="text-fg-subtle">·</span>
              <span className="inline-flex items-center gap-1" title="People who report to this person"><Users size={11} /> {data.directReports.length} report{data.directReports.length === 1 ? "" : "s"}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Badge tone="info" className="normal-case">{personTypeLabel(person.personType)}</Badge>
          {!person.active && <Badge tone="default"><UserX size={10} className="inline mr-0.5" /> Inactive</Badge>}
          {person.active && person.probationEndDate && (() => {
            const days = Math.ceil((new Date(person.probationEndDate).getTime() - Date.now()) / 86400000);
            if (days >= 0 && days <= 45) return <Badge tone={days <= 14 ? "danger" : "warn"}><Clock size={10} className="inline mr-0.5" /> Probation {days}d</Badge>;
            return null;
          })()}
          {person.active && serviceYears >= 1 && <Badge tone="default"><Cake size={10} className="inline mr-0.5" /> {serviceYears} yr{serviceYears === 1 ? "" : "s"}</Badge>}
          {person.active && completeness != null && completeness < 100 && (
            <Badge tone={completeness < 60 ? "warn" : "default"}>Profile {completeness}%</Badge>
          )}
          {onLeaveNow ? (
            <Badge tone="info"><Plane size={10} className="inline mr-0.5" /> On leave</Badge>
          ) : nextLeave && (() => {
            const days = Math.ceil((new Date(`${nextLeave.startDate.slice(0, 10)}T00:00:00`).getTime() - Date.now()) / 86400000);
            return days >= 0 && days <= 21 ? <Badge tone="default"><Plane size={10} className="inline mr-0.5" /> Leave in {days}d</Badge> : null;
          })()}
          {snoozed && person.snoozedUntil && <Badge tone="warn"><MoonStar size={10} className="inline mr-0.5" /> Snoozed</Badge>}
          {!person.email && !person.whatsapp && !person.phone && (
            <Badge tone="danger"><AlertCircleMini /> No contact</Badge>
          )}
        </div>
      </div>
    </div>
  ) : <div className="h-12" />;

  // ── Overview tab ────────────────────────────────────────────────────
  const attention: Array<{ key: string; icon: React.ReactNode; label: string; sub?: string; onClick: () => void }> = [];
  if (data) {
    overdueTasks.slice(0, 4).forEach((t) =>
      attention.push({ key: `t${t.id}`, icon: <AlertTriangle size={14} className="text-danger" />, label: t.actionItem, sub: `${t.code} · overdue`, onClick: () => openView("tasks") })
    );
    docIssues.slice(0, 4).forEach((d) =>
      attention.push({ key: `d${d.id}`, icon: <FileText size={14} className={d.status === "Expired" ? "text-danger" : "text-warn"} />, label: d.title, sub: `${d.status}${d.expiryLabel ? ` · ${d.expiryLabel}` : ""}`, onClick: () => openView("compliance") })
    );
    if (compSum && compSum.missing > 0)
      attention.push({ key: "comp", icon: <ShieldCheck size={14} className="text-warn" />, label: `${compSum.missing} required document${compSum.missing === 1 ? "" : "s"} missing`, sub: "Open compliance", onClick: () => openView("compliance") });
    if (pendingLeave > 0)
      attention.push({ key: "leave", icon: <Plane size={14} className="text-warn" />, label: `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} pending`, sub: "Review in Leave", onClick: () => openView("leave") });
    if (person?.active && anniversary)
      attention.push({ key: "anniv", icon: <Cake size={14} className="text-accent" />, label: `${anniversary.years}-year work anniversary ${anniversary.days === 0 ? "today" : `in ${anniversary.days}d`}`, sub: "A nice moment to acknowledge", onClick: () => setActiveTab("profile") });
  }

  // Vitals — the ONLY entry points to the deep views. Each chip is a door.
  const compBandTone =
    band === "Good" ? "text-success" : band === "Watch" ? "text-warn" : band === "Risk" ? "text-danger" : "text-fg-subtle";
  const vitals: Array<{ key: string; label: string; value: React.ReactNode; tone: string; onClick: () => void }> = data && person ? [
    { key: "compliance", label: "Compliance", value: compSum ? `${compSum.score}%` : "—", tone: compBandTone, onClick: () => openView("compliance") },
    { key: "open", label: "Open tasks", value: openTasks, tone: data.workload.overdue ? "text-danger" : openTasks ? "text-info" : "text-fg-subtle", onClick: () => openView("tasks") },
    { key: "equipment", label: "Equipment", value: assetsSum ? assetsSum.held : "—", tone: assetsSum && assetsSum.held ? "text-info" : "text-fg-subtle", onClick: () => openView("journey") },
    { key: "journey", label: person.active ? "Journey" : "Exit", value: journeySum && journeySum.total > 0 ? `${journeySum.completed}/${journeySum.total}` : "—", tone: journeySum && journeySum.total > 0 && journeySum.completed === journeySum.total ? "text-success" : "text-info", onClick: () => openView("journey") },
  ] : [];

  const snapshotContent = person && data ? (
    <>
      {/* Vitals strip — replaces the old compliance card + 4 tiles */}
      <div className="grid grid-cols-4 gap-2">
        {vitals.map((v) => (
          <button key={v.key} type="button" onClick={v.onClick} className="rounded-xl bg-bg-elev ring-1 ring-border/70 px-2 py-2.5 text-center hover:ring-accent/30 transition-all">
            <div className={cn("text-lg font-semibold tabular leading-none", v.tone)}>{v.value}</div>
            <div className="mt-1 text-[10px] text-fg-muted leading-tight">{v.label}</div>
          </button>
        ))}
      </div>

      {/* KPI scorecard — this month's task performance. Two HONEST counters
          (created vs accountable), on-time reliability, and the headline score. */}
      {!(data.kpiMonths[0]?.excluded ?? true) && <KpiCard months={data.kpiMonths} onOpenTasks={() => openView("tasks")} />}

      {/* To handle — one ranked list (overdue tasks + doc/compliance gaps +
          pending leave + probation/anniversary), no longer duplicated as tiles. */}
      <div className="bg-bg-elev rounded-xl ring-1 ring-border/60 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-fg-muted">
          To handle
          {attention.length > 0 && <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-danger-soft text-danger text-[11px] font-semibold tabular normal-case">{attention.length}</span>}
        </div>
        {attention.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={20} />} tone="success" title="All clear" hint="Nothing needs action right now." />
        ) : (
          <ul className="divide-y divide-border/50">
            {attention.map((a) => (
              <li key={a.key}>
                <button type="button" onClick={a.onClick} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-bg-muted/50 transition-colors">
                  {a.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{a.label}</span>
                    {a.sub && <span className="block text-[11px] text-fg-subtle truncate">{a.sub}</span>}
                  </span>
                  <ExternalLink size={13} className="text-fg-subtle shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {person.notes && (
        <div className="bg-bg-elev rounded-xl ring-1 ring-border/60 p-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle mb-1.5">Notes</div>
          <p className="text-xs text-fg-muted leading-relaxed whitespace-pre-wrap">{person.notes}</p>
        </div>
      )}
    </>
  ) : null;

  // ── Tasks tab ───────────────────────────────────────────────────────
  const priorityBar: Record<string, string> = { Critical: "bg-danger", High: "bg-warn", Medium: "bg-info", Low: "bg-fg-subtle" };
  const tasksContent = person && data ? (
    data.assignedTasks.length === 0 && data.recentUpdates.length === 0 ? (
      <SectionCard><EmptyState icon={<ListTodo size={20} />} title="No work yet" hint="No tasks assigned and no recent activity." /></SectionCard>
    ) : (
      <>
        {data.assignedTasks.length > 0 && (
          <CollapsibleSection icon={<ListTodo size={14} />} title="Assigned tasks" count={data.assignedTasks.length}>
            <div className="divide-y divide-border/50">
              {data.assignedTasks.slice(0, 20).map((t) => {
                const urgent = t.flag === "overdue" || t.flag === "escalate-now";
                const done = t.status === "Completed" || t.status === "Closed";
                return (
                  <TaskDrawerLink key={t.id} code={t.code} className="group/row flex w-full items-stretch gap-0 text-left hover:bg-bg-muted/50 transition-colors">
                    <span className={cn("w-1 shrink-0 rounded-full my-2 ml-2", priorityBar[t.priority] ?? "bg-fg-subtle")} />
                    <span className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium truncate", done && "line-through text-fg-subtle")}>{t.actionItem}</span>
                        <span className="block text-[11px] text-fg-subtle truncate"><span className="font-mono">{t.code}</span> · {t.companyName} · <span className={urgent ? "text-danger font-medium" : ""}>{t.status}</span></span>
                      </span>
                      <Badge tone={priorityTone(t.priority)} className="shrink-0">{t.priority}</Badge>
                    </span>
                  </TaskDrawerLink>
                );
              })}
            </div>
          </CollapsibleSection>
        )}
        {data.recentUpdates.length > 0 && (
          <CollapsibleSection icon={<Activity size={14} />} title="Recent activity" count={data.recentUpdates.length} contentClassName="p-4">
            <div className="relative pl-4">
              <div className="absolute left-1 top-1.5 bottom-1.5 w-px bg-border" />
              <div className="space-y-2.5">
                {data.recentUpdates.slice(0, 10).map((u) => (
                  <div key={u.id} className="relative">
                    <div className="absolute -left-[13px] top-1.5 w-2 h-2 rounded-full border-2 border-bg bg-accent" />
                    <p className="text-xs leading-relaxed text-fg">{u.body}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-subtle">
                      <TaskDrawerLink code={u.taskCode} className="font-mono hover:text-accent transition-colors">{u.taskCode}</TaskDrawerLink>
                      <span className="tabular">{fmtTime(new Date(u.createdAt))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>
        )}
      </>
    )
  ) : null;

  // ── Profile tab (read rows + inline edit toggle + facts + documents) —
  // sections are uniform CollapsibleSection cards, collapsed by default.
  const profileContent = person && data ? (
    mode === "edit" ? (
      <div className="bg-bg-elev rounded-xl ring-1 ring-border/60 p-4">
        <p className="text-xs text-fg-muted mb-3">Editing <span className="font-medium text-fg">{person.name}</span></p>
        <PersonForm
          mode="edit"
          id={person.id}
          compact
          defaults={{
            name: person.name, email: person.email, phone: person.phone, whatsapp: person.whatsapp,
            preferredChannel: person.preferredChannel, role: person.role, staffCategory: person.staffCategory, companyId: person.companyId,
            department: person.departmentName, startDate: person.startDate ? person.startDate.slice(0, 10) : null,
            dateOfBirth: person.dateOfBirth ? person.dateOfBirth.slice(0, 10) : null, nationality: person.nationality,
            nationalId: person.nationalId, passportNo: person.passportNo, address: person.address,
            emergencyContactName: person.emergencyContactName, emergencyContactPhone: person.emergencyContactPhone,
            probationEndDate: person.probationEndDate ? person.probationEndDate.slice(0, 10) : null,
            managerId: person.managerId, secondaryManagerIds: person.secondaryManagers.map((m) => m.id),
            notes: person.notes, personType: person.personType, relatedPersonId: person.relatedPersonId,
            workSite: person.workSiteName, residence: person.residenceName,
            associations: person.associations,
          }}
          companies={data.companies}
          peopleList={data.peopleList}
          departments={data.departments}
          sites={data.sites}
          roles={data.roles}
          onCancel={() => setMode("view")}
          onComplete={(res) => { if (res.ok) { toast("Person updated.", { tone: "success" }); setMode("view"); refresh(); } }}
        />
      </div>
    ) : (
      <>
        {/* Suggested additions — pending decisions + auto-applied (undoable) */}
        {(data.suggestions.length > 0 || data.appliedSuggestions.length > 0) && (
          <div className="mb-3">
            <SuggestionTray suggestions={data.suggestions} applied={data.appliedSuggestions} personId={person.id} />
          </div>
        )}
        {/* Profile details — grouped definition grids */}
        {(() => {
          const docFor = (kind: "passport" | "nationalId") =>
            data.documents.find((d) => {
              const hay = [d.category, d.docType, d.title].filter(Boolean).join(" ").toLowerCase();
              return kind === "passport" ? d.category === "Passport" || hay.includes("passport") : /national id|nida/.test(hay);
            }) ?? null;
          const docHint = (kind: "passport" | "nationalId", value: string | null) => {
            const doc = docFor(kind);
            if (!doc) return undefined;
            return (
              <Link href={`/documents?person=${person.id}&from=person:${person.id}`} onClick={close} title={`On file: ${doc.title}`} className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent hover:underline max-w-full">
                <FileText size={10} className="shrink-0" /><span className="truncate">{value ? doc.title : `${doc.title} — on file`}</span>
              </Link>
            );
          };
          const identity = [
            { label: "Date of birth", value: person.dateOfBirth ? fmtDate(new Date(person.dateOfBirth)) : null },
            { label: "Nationality", value: person.nationality },
            { label: "National ID", value: person.nationalId, hint: docHint("nationalId", person.nationalId) },
            { label: "Passport no.", value: person.passportNo, hint: docHint("passport", person.passportNo) },
          ];
          const contact = [
            { label: "Address", value: person.address },
            { label: "Emergency contact", value: [person.emergencyContactName, person.emergencyContactPhone].filter(Boolean).join(" · ") || null },
            { label: "Email", value: person.email },
            { label: "WhatsApp", value: person.whatsapp },
          ];
          const employment = [
            { label: "Department", value: person.departmentName },
            { label: "Work site", value: person.workSiteName },
            { label: "Residence", value: person.residenceName },
            { label: "Started", value: person.startDate ? fmtDate(new Date(person.startDate)) : null },
            { label: "Probation ends", value: person.probationEndDate ? fmtDate(new Date(person.probationEndDate)) : null },
            { label: "Type", value: personTypeLabel(person.personType) },
            { label: "Reports to", value: person.managerName },
            { label: "Also reports to", value: person.secondaryManagers.map((m) => m.name).filter(Boolean).join(", ") || null },
            { label: "Related", value: person.relatedPersonName },
          ];
          const editBtn = (
            <button type="button" onClick={(e) => { e.stopPropagation(); setMode("edit"); }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-fg-muted hover:text-accent hover:bg-bg-subtle transition-colors">
              <Pencil size={11} /> Edit
            </button>
          );
          return (
            <>
              <CollapsibleSection icon={<IdCard size={14} />} title="Identity" right={editBtn}>
                <div className="p-3.5"><DefGrid rows={identity} /></div>
              </CollapsibleSection>
              <CollapsibleSection icon={<Phone size={14} />} title="Contact">
                <div className="p-3.5"><DefGrid rows={contact} /></div>
              </CollapsibleSection>
              <CollapsibleSection icon={<Briefcase size={14} />} title="Employment">
                <div className="p-3.5"><DefGrid rows={employment} /></div>
              </CollapsibleSection>
              {data.directReports.length > 0 && (
                <CollapsibleSection icon={<Users size={14} />} title="Direct reports" count={data.directReports.length}>
                  <div className="divide-y divide-border/50">
                    {data.directReports.map((r) => (
                      <button key={`${r.kind}-${r.id}`} type="button" onClick={() => goToManager(r.id)}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-left hover:bg-bg-muted/40 transition-colors">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{r.name}</span>
                        <span className="text-[11px] text-fg-subtle truncate shrink-0 max-w-[45%]">{[r.role, r.companyName].filter(Boolean).join(" · ")}</span>
                        {r.kind === "dotted" && <span className="text-[9px] font-semibold uppercase tracking-wide text-info/80 shrink-0">dotted</span>}
                      </button>
                    ))}
                  </div>
                </CollapsibleSection>
              )}
            </>
          );
        })()}

        {/* Tracked facts (source-linked fact ledger) */}
        <FactsPanel entityType="person" entityId={person.id} />

        {/* Documents */}
        {data.documents.length > 0 && (
          <CollapsibleSection icon={<FileText size={14} />} title="Documents" count={data.documents.length}>
            <div className="divide-y divide-border/50">
              {data.documents.slice(0, 10).map((doc) => (
                <button key={doc.id} type="button" onClick={() => openDocFile(doc.id)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-bg-muted/50 transition-colors">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", doc.status === "Expired" ? "bg-danger" : doc.status === "Expiring" ? "bg-warn" : doc.status === "Valid" ? "bg-success" : "bg-fg-subtle")} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium truncate">{doc.title}</span>
                    <span className="block text-[10px] text-fg-muted truncate">{[doc.category, doc.docType, doc.expiryLabel].filter(Boolean).join(" · ") || "No expiry date"}</span>
                  </span>
                  <Badge tone={documentTone(doc.status)} className="shrink-0">{doc.status}</Badge>
                </button>
              ))}
            </div>
          </CollapsibleSection>
        )}

      </>
    )
  ) : null;

  // ── Manage (hidden deep view) — every admin action in one place ──────
  const manageContent = person && data ? (
    <>
      <BackBar label="Back" onBack={goBack} />

      {person.active && (
        <SectionCard className="p-3.5 space-y-2.5">
          <GroupLabel>Probation</GroupLabel>
          <PersonProbation personId={person.id} probationEndDate={person.probationEndDate} onChanged={refresh} />
        </SectionCard>
      )}

      <SectionCard className="p-3.5 space-y-2.5">
        <GroupLabel>Staff portal access</GroupLabel>
        <PersonPortalAccess personId={person.id} portal={data.portal} onChanged={refresh} fmtDate={fmtDate} />
      </SectionCard>

      <SectionCard className="p-3.5 space-y-2">
        <GroupLabel>Snooze reminders</GroupLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={snoozeInput} onChange={(e) => setSnoozeInput(e.target.value)} min={new Date().toISOString().slice(0, 10)} disabled={actionPending}
            className="flex-1 min-w-[8.5rem] rounded-lg border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50" />
          <Button type="button" size="sm" onClick={handleSnoozeSave} disabled={actionPending}>Save</Button>
        </div>
        {person.snoozedUntil && <p className="text-[11px] text-fg-subtle">Currently snoozed until {fmtDate(new Date(person.snoozedUntil))}.</p>}
      </SectionCard>

      <SectionCard className="p-3.5 space-y-2">
        <GroupLabel>Tools</GroupLabel>
        <a href={`/people/form?person=${person.id}`} target="_blank" rel="noopener"
          className="flex items-center gap-2 rounded-lg bg-bg-subtle/60 px-3 py-2 text-[12px] font-medium text-fg-muted hover:bg-bg-muted/70 transition-colors">
          <FileText size={14} className="shrink-0" /> Data form (PDF) — for staff with no system access
        </a>
        <Link href={`/?tab=tasks&view=table&q=${encodeURIComponent(person.name)}&all=1`}
          className="flex items-center gap-2 rounded-lg bg-bg-subtle/60 px-3 py-2 text-[12px] font-medium text-fg-muted hover:bg-bg-muted/70 transition-colors">
          <ExternalLink size={14} className="shrink-0" /> View all of their tasks
        </Link>
      </SectionCard>

      <SectionCard className="p-3.5 space-y-2">
        <GroupLabel>{person.active ? "Archive" : "Restore"}</GroupLabel>
        <p className="text-[11px] text-fg-subtle">
          {person.active
            ? "Moves this person out of the active directory and starts offboarding. Nothing is deleted — you can restore them any time."
            : "Brings this person back into the active directory."}
        </p>
        <button type="button" onClick={handleArchiveToggle} disabled={actionPending}
          className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50", person.active ? "border-danger/40 text-danger hover:bg-danger/10" : "border-success/40 text-success hover:bg-success/10")}>
          {person.active ? <><Archive size={13} /> Archive person</> : <><RotateCcw size={13} /> Restore person</>}
        </button>
      </SectionCard>
    </>
  ) : null;

  // ── History (hidden deep view) — who changed what, when ─────────────
  const historyContent = person && data ? (
    <>
      <BackBar label="Back" onBack={goBack} />
      {data.events.length > 0 ? (
        <SectionCard>
          <div className="px-4 py-2.5 border-b border-border/50 text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
            <Clock size={12} /> History
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{data.events.length}</span>
          </div>
          <ul className="divide-y divide-border/50">
            {data.events.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5 px-4 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-subtle/60" />
                <span className="min-w-0 flex-1 text-[12px] leading-snug text-fg-muted break-words">{personEventText(e)}</span>
                <span className="shrink-0 text-[11px] text-fg-subtle whitespace-nowrap">{relTime(e.createdAt)} · {personActor(e.createdBy)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : (
        <SectionCard><EmptyState icon={<Clock size={20} />} title="No history yet" hint="Changes to this person will appear here." /></SectionCard>
      )}
    </>
  ) : null;

  // ── Tabs + action bar ───────────────────────────────────────────────
  // When the pack step is open it takes over the body as a single view.
  // More menu — the door to every deep view (each is a hidden, mounted tab).
  const moreItems = person && data ? [
    { id: "compliance", icon: <ShieldCheck size={15} />, label: "Compliance", meta: compSum ? `${compSum.score}%` : undefined },
    { id: "journey", icon: <RouteIcon size={15} />, label: person.active ? "Journey" : "Exit", meta: journeySum && journeySum.total > 0 ? `${journeySum.completed}/${journeySum.total}` : undefined },
    { id: "leave", icon: <CalendarDays size={15} />, label: "Leave", meta: pendingLeave ? `${pendingLeave} pending` : undefined },
    { id: "tasks", icon: <ListTodo size={15} />, label: "Tasks", meta: openTasks ? `${openTasks} open` : undefined },
    { id: "history", icon: <Clock size={15} />, label: "History", meta: data.events.length ? String(data.events.length) : undefined },
    { id: "manage", icon: <Wrench size={15} />, label: "Manage", meta: undefined },
  ] : [];
  const moreContent = person && data ? (
    <div className="bg-bg-elev rounded-xl ring-1 ring-border/60 overflow-hidden divide-y divide-border/50">
      {moreItems.map((m) => (
        <button key={m.id} type="button" onClick={() => openView(m.id, "more")}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-muted/50 transition-colors">
          <span className="text-fg-muted shrink-0">{m.icon}</span>
          <span className="flex-1 text-sm font-medium">{m.label}</span>
          {m.meta && <span className="text-xs text-fg-subtle tabular">{m.meta}</span>}
          <ExternalLink size={14} className="text-fg-subtle shrink-0" />
        </button>
      ))}
    </div>
  ) : null;

  const journeyView = person && data ? (() => {
    // The lifecycle-relevant journey drives the Journey vital; the other one
    // stays viewable (prep offboarding while active; keep onboarding after
    // archive) but doesn't override that headline count.
    const lifecycleKind = person.active ? "onboarding" : "offboarding";
    return (
      <div className="space-y-3">
        <BackBar label="Back" onBack={goBack} />
        <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-bg-subtle ring-1 ring-border/60 text-[11px]">
          {(["onboarding", "offboarding"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setJourneyKind(k)}
              className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors",
                journeyKind === k ? "bg-accent text-accent-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg")}>
              {k === "onboarding" ? <Rocket size={11} /> : <LogOut size={11} />}
              {k === "onboarding" ? "Onboarding" : "Offboarding"}
              {k === lifecycleKind && journeyKind !== k && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
        <JourneyChecklist key={journeyKind} personId={person.id} kind={journeyKind} onChanged={refresh} onNavigate={close}
          onSummary={journeyKind === lifecycleKind ? setJourneySum : undefined} />
        <PersonAssets personId={person.id} onChanged={refresh} onNavigate={close} onSummary={setAssetsSum} />
      </div>
    );
  })() : null;

  const tabs: DrawerTab[] = !(person && data)
    ? []
    : packOpen
    ? [{ id: "pack", label: "Pack", content: <PersonPackPanel personId={person.id} personName={person.name} initialPurpose={packPurpose} onBack={() => setPackOpen(false)} /> }]
    : [
        // Visible: just three doors.
        { id: "snapshot", label: "Snapshot", icon: <LayoutDashboard size={14} />, content: snapshotContent },
        { id: "profile", label: "Profile", icon: <IdCard size={14} />, content: profileContent },
        { id: "more", label: "More", icon: <ListPlus size={14} />, content: moreContent },
        // Hidden but mounted (so their onSummary feeds the vitals); reached from
        // a vital chip or the More menu.
        { id: "compliance", label: "Compliance", hidden: true,
          content: <><BackBar label="Back" onBack={goBack} /><RequirementsChecklist personId={person.id} onChanged={refresh} onNavigate={close} onSummary={setCompSum} onAddDocument={(opts) => setAddDoc({ title: opts.title, category: opts.category })} reloadSignal={refreshKey} /></> },
        { id: "journey", label: "Journey", hidden: true, content: journeyView },
        { id: "leave", label: "Leave", hidden: true,
          content: <><BackBar label="Back" onBack={goBack} /><PersonLeave personId={person.id} balances={data.leave.balances} requests={data.leave.requests} attendance={data.leave.attendance} onChanged={refresh} /></> },
        { id: "tasks", label: "Tasks", hidden: true, content: <><BackBar label="Back" onBack={goBack} />{tasksContent}</> },
        { id: "manage", label: "Manage", hidden: true, content: manageContent },
        { id: "history", label: "History", hidden: true, content: historyContent },
      ];

  const hasOpenTasks = !!data?.assignedTasks.some((t) => t.status !== "Completed" && t.status !== "Closed");
  const actionBar = person && data ? (
    <div className="space-y-2">
      {remindInfo && (
        <div className="flex items-center gap-2 rounded-xl bg-success-soft/50 ring-1 ring-success/25 px-3 py-1.5 text-xs">
          <CheckCircle2 size={14} className="text-success shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {remindInfo.created ? "Reminder draft saved" : "A reminder draft already exists today"}
            {remindInfo.contactMissing ? " · no contact saved" : ""}
          </span>
          <Link href="/outbox" onClick={close} className="shrink-0 font-medium text-accent hover:underline">Outbox</Link>
          {remindInfo.link && <a href={remindInfo.link} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-accent hover:underline">Send</a>}
          <button type="button" onClick={() => setRemindInfo(null)} className="shrink-0 text-fg-subtle hover:text-fg" aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}
      <div className="flex items-center gap-2">
        {/* Contact cluster — moved here from the hero to keep the header slim. */}
        <div className="flex items-center gap-1.5">
          {person.email && <IconButton icon={<Mail size={15} />} label={person.email} href={`mailto:${person.email}`} />}
          {person.whatsapp && <IconButton icon={<MessageCircle size={15} />} label={person.whatsapp} href={whatsappHref(person.whatsapp)} external />}
          {person.phone && <IconButton icon={<Phone size={15} />} label={person.phone} href={`tel:${person.phone}`} />}
          <IconButton icon={<MessageCircle size={15} />} label="Message in chat" href={`/chat?dm=${person.id}`} />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {hasOpenTasks && <IconButton icon={<Send size={15} />} label="Remind about open work" onClick={handleRemind} tone="accent" />}
          <IconButton icon={<ListPlus size={15} />} label="New task" onClick={() => setNewTask(true)} />
          <IconButton icon={<FileText size={15} />} label="Add document" onClick={() => setAddDoc({ category: null })} />
          <Button type="button" size="sm" onClick={() => setPackOpen(true)}>
            <PackageCheck size={13} /> Pack
          </Button>
        </div>
      </div>
    </div>
  ) : undefined;

  return (
    <>
    <EntityDrawer
      open={open}
      onClose={close}
      title={person?.name ?? "Person"}
      tone={tone}
      loading={loading && !data}
      error={error}
      errorLabel="Couldn't load person."
      maxWidth="600px"
      fullScreenOnMobile
      hero={heroNode}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      actionBar={mode === "view" && !packOpen ? actionBar : undefined}
    />

    {/* In-place "Add document" — layered above the person, so the flow stays
        immersive: no navigation to /documents, no background page switch. On
        save the checklist + tiles refresh in place via refreshKey. The shared
        HrmsDialog gives a centred glass card on desktop and a bottom-sheet on
        mobile, matching every other dialog. */}
    {person && data && (
      <HrmsDialog
        open={!!addDoc}
        onOpenChange={(o) => { if (!o) setAddDoc(null); }}
        width={560}
        title={`Add a document for ${person.name}`}
      >
        {addDoc && (
          <DocumentForm
            mode="create"
            companies={data.companies}
            people={data.peopleList.map((p) => ({ id: p.id, name: p.name }))}
            initialPersonId={person.id}
            initialCategory={addDoc.category}
            initialTitle={addDoc.title}
            onCancel={() => setAddDoc(null)}
            onComplete={(res) => { if (res.ok) { toast("Document added.", { tone: "success" }); setAddDoc(null); refresh(); } }}
          />
        )}
      </HrmsDialog>
    )}

    {/* In-place "New task" — the standard create form layered above the person,
        with their name + company pre-filled. createTask redirects back here with
        ?taskcreated=… which the effect above turns into a refresh. The shared
        HrmsDialog gives a centred glass card on desktop and a bottom-sheet on
        mobile; the -m-5 wrapper cancels the dialog's body padding so the modal
        form keeps owning its own scroll area + sticky "Create task" footer. */}
    {person && data && (() => {
      const taskReturnParams = new URLSearchParams(searchParams.toString());
      taskReturnParams.set("taskcreated", String(Date.now()));
      const taskReturnTo = `${pathname}?${taskReturnParams.toString()}`;
      return (
        <HrmsDialog
          open={newTask}
          onOpenChange={(o) => { if (!o) setNewTask(false); }}
          width={640}
          title={`New task for ${person.name}`}
        >
          {newTask && (
            <div className="-m-5 flex min-h-full flex-col">
              <NewTaskForm
                variant="modal"
                companies={data.companies}
                people={data.peopleList.map((p) => ({ id: p.id, name: p.name }))}
                presetCompany={person.companyId ?? undefined}
                defaultAccountable={[person.name]}
                returnTo={taskReturnTo}
              />
            </div>
          )}
        </HrmsDialog>
      );
    })()}
    </>
  );
}
