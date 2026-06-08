"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, Mail, Phone, MessageCircle, MoonStar, UserX, Loader2, AlertCircle,
  Briefcase, Building2, ExternalLink, Activity, ListTodo, Pencil, Archive,
  RotateCcw, Clock, ChevronDown, Send, FileText,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { TaskDrawerLink } from "./task-drawer-link";
import { PersonForm } from "./person-form";
import { PersonPackBuilder } from "./person-pack-builder";
import { RequirementsChecklist } from "./requirements-checklist";
import { DocumentForm } from "./document-form";
import { JourneyChecklist } from "./journey-checklist";
import { PersonAssets } from "./person-assets";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { togglePersonActive, snoozePerson } from "@/app/people/actions";
import { createPersonPackDraftAction } from "@/app/people/pack-actions";
import { pickChannel } from "@/lib/outbox-links";
import type { TaskRow } from "@/lib/queries";
import { isPersonPackPurpose, type PersonPackPurpose } from "@/lib/person-pack-shared";
import { personTypeLabel, type PersonType } from "@/lib/person-types";

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
  const [refreshKey, setRefreshKey] = useState(0);
  const [snoozeInput, setSnoozeInput] = useState<string>("");
  const [actionPending, setActionPending] = useState(false);
  // In-place "add document" — layered over the person so the flow stays
  // immersive (no navigation to /documents, no background page switch).
  const [addDoc, setAddDoc] = useState<{ title?: string; category: string | null } | null>(null);
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
        // Seed snooze input from current value (YYYY-MM-DD)
        if (d.person.snoozedUntil) {
          setSnoozeInput(d.person.snoozedUntil.slice(0, 10));
        }
      })
      .catch(() => { setError(true); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idStr, refreshKey]);

  // Reset to view mode whenever a new person opens
  useEffect(() => { setMode("view"); }, [idStr]);

  const refresh = () => setRefreshKey((k) => k + 1);

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
    toast(
      res.created ? "Reminder draft saved in Outbox." : "A reminder draft already exists today.",
      { tone: res.contactMissing ? "warn" : "success" }
    );
    if (res.link) window.open(res.link, "_blank", "noopener,noreferrer");
  };

  const person = data?.person;
  const snoozed = person?.snoozedUntil ? new Date(person.snoozedUntil) > new Date() : false;

  return (
    <>
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          forceMount
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm
            transition-opacity duration-200
            data-[state=open]:opacity-100
            data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none"
        />
        <Dialog.Content
          forceMount
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] max-h-[88dvh] w-[calc(100%-1.5rem)] max-w-[640px]
            flex flex-col overflow-hidden glass glass-refract rounded-2xl outline-none
            transition-all duration-200 ease-out
            data-[state=open]:opacity-100 data-[state=open]:scale-100
            data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97]
            data-[state=closed]:pointer-events-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-bg-subtle text-fg-muted text-xs font-medium shrink-0">
                {person?.name?.slice(0, 1) ?? "?"}
              </span>
              <Dialog.Title className="text-sm font-semibold truncate">
                {person?.name ?? "Loading…"}
              </Dialog.Title>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {data && mode === "view" && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent px-2 py-1 rounded hover:bg-bg-subtle transition-colors"
                >
                  <Pencil size={11} /> Edit
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading && !data && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-fg-muted">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-fg-muted">
                <AlertCircle size={18} className="text-danger" />
                <span className="text-sm">Couldn&apos;t load person.</span>
              </div>
            )}

            {/* Edit mode — full form */}
            {person && data && mode === "edit" && (
              <div className="p-5 space-y-3">
                <p className="text-xs text-fg-muted">
                  Editing <span className="font-medium text-fg">{person.name}</span>
                </p>
                <PersonForm
                  mode="edit"
                  id={person.id}
                  compact
                  defaults={{
                    name: person.name,
                    email: person.email,
                    phone: person.phone,
                    whatsapp: person.whatsapp,
                    preferredChannel: person.preferredChannel,
                    role: person.role,
                    companyId: person.companyId,
                    department: person.departmentName,
                    startDate: person.startDate ? person.startDate.slice(0, 10) : null,
                    dateOfBirth: person.dateOfBirth ? person.dateOfBirth.slice(0, 10) : null,
                    nationality: person.nationality,
                    nationalId: person.nationalId,
                    passportNo: person.passportNo,
                    address: person.address,
                    emergencyContactName: person.emergencyContactName,
                    emergencyContactPhone: person.emergencyContactPhone,
                    probationEndDate: person.probationEndDate ? person.probationEndDate.slice(0, 10) : null,
                    managerId: person.managerId,
                    secondaryManagerIds: person.secondaryManagers.map((m) => m.id),
                    notes: person.notes,
                    personType: person.personType,
                    relatedPersonId: person.relatedPersonId,
                    associations: person.associations,
                  }}
                  companies={data.companies}
                  peopleList={data.peopleList}
                  departments={data.departments}
                  onCancel={() => setMode("view")}
                  onComplete={(res) => {
                    if (res.ok) {
                      toast("Person updated.", { tone: "success" });
                      setMode("view");
                      refresh();
                    }
                  }}
                />
              </div>
            )}

            {/* View mode — read-only profile + workload + tasks + activity */}
            {person && mode === "view" && (
              <div className="p-4 space-y-3.5">
                {/* Role + Company + status */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {person.role && (
                      <span className="inline-flex items-center gap-1 text-fg-muted">
                        <Briefcase size={11} /> {person.role}
                      </span>
                    )}
                    {person.companyName && person.companyId && (
                      <>
                        <span className="text-fg-subtle">·</span>
                        <Link
                          href={`/companies/${person.companyId}`}
                          onClick={close}
                          className="inline-flex items-center gap-1 text-fg-muted hover:text-accent transition-colors"
                        >
                          <Building2 size={11} /> {person.companyName}
                        </Link>
                      </>
                    )}
                    {person.departmentName && (
                      <>
                        <span className="text-fg-subtle">·</span>
                        <span className="text-fg-muted">{person.departmentName}</span>
                      </>
                    )}
                  </div>
                  {(person.startDate || person.managerName) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                      {person.startDate && <span>Started {fmtDate(new Date(person.startDate))}</span>}
                      {person.startDate && person.managerName && <span>·</span>}
                      {person.managerName && person.managerId && (
                        <span>
                          Reports to{" "}
                          <button
                            type="button"
                            onClick={() => {
                              const params = new URLSearchParams(searchParams.toString());
                              params.set("person", String(person.managerId));
                              router.push(`${pathname}?${params.toString()}`, { scroll: false });
                            }}
                            className="font-medium text-fg-muted hover:text-accent transition-colors"
                          >
                            {person.managerName}
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {!person.active && <Badge tone="default"><UserX size={10} className="inline mr-0.5" /> Inactive</Badge>}
                    {person.active && person.probationEndDate && (() => {
                      const days = Math.ceil((new Date(person.probationEndDate).getTime() - Date.now()) / 86400000);
                      if (days >= 0 && days <= 45) {
                        return <Badge tone={days <= 14 ? "danger" : "warn"}><Clock size={10} className="inline mr-0.5" /> Probation ends in {days}d</Badge>;
                      }
                      if (days < 0 && days >= -30) {
                        return <Badge tone="info"><Clock size={10} className="inline mr-0.5" /> Probation ended {fmtDate(new Date(person.probationEndDate))}</Badge>;
                      }
                      return null;
                    })()}
                    {snoozed && person.snoozedUntil && (
                      <Badge tone="warn">
                        <MoonStar size={10} className="inline mr-0.5" />
                        Snoozed until {fmtDate(new Date(person.snoozedUntil))}
                      </Badge>
                    )}
                    {person.preferredChannel && (
                      <Badge tone="info">{person.preferredChannel}</Badge>
                    )}
                    {person.contactStatus === "Complete" && (
                      <Badge tone="success">Contact complete</Badge>
                    )}
                  </div>
                </div>

                {/* Quick actions — contact + the things you do most */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {person.email && (
                    <a href={`mailto:${person.email}`} title={person.email}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-accent hover:text-accent transition-colors">
                      <Mail size={13} /> Email
                    </a>
                  )}
                  {person.whatsapp && (
                    <a href={whatsappHref(person.whatsapp)} target="_blank" rel="noreferrer" title={person.whatsapp}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-accent hover:text-accent transition-colors">
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  {person.phone && (
                    <a href={`tel:${person.phone}`} title={person.phone}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-accent hover:text-accent transition-colors">
                      <Phone size={13} /> Call
                    </a>
                  )}
                  {data.assignedTasks.some((t) => t.status !== "Completed" && t.status !== "Closed") && (
                    <button type="button"
                      onClick={handleRemind}
                      disabled={actionPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50">
                      <Send size={13} /> Remind
                    </button>
                  )}
                  <PersonPackBuilder personId={person.id} personName={person.name} openOnMount={openPack} initialPurpose={packPurpose} />
                  <button type="button" onClick={() => setAddDoc({ category: null })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-border hover:border-accent hover:text-accent transition-colors">
                    <FileText size={13} /> Add doc
                  </button>
                  {!person.email && !person.whatsapp && !person.phone && (
                    <span className="text-xs text-danger inline-flex items-center gap-1"><AlertCircle size={11} /> No contact info</span>
                  )}
                </div>

                {/* At a glance — the key numbers, no scrolling */}
                {(() => {
                  const docIssues = data.documents.filter((d) => d.status === "Expired" || d.status === "Expiring").length;
                  const tiles = [
                    { label: "Compliance", value: compSum ? `${compSum.score}%` : "—", tone: compSum ? (compSum.band === "Risk" ? "text-danger" : compSum.band === "Watch" ? "text-warn" : "text-success") : "text-fg-subtle" },
                    { label: person.active ? "Onboarding" : "Offboarding", value: journeySum && journeySum.total > 0 ? `${journeySum.completed}/${journeySum.total}` : "—", tone: journeySum && journeySum.total > 0 && journeySum.completed === journeySum.total ? "text-success" : "text-info" },
                    { label: "Open tasks", value: data.workload.open, tone: data.workload.overdue ? "text-danger" : data.workload.open ? "text-info" : "text-fg-subtle" },
                    { label: "Equipment", value: assetsSum ? assetsSum.held : "—", tone: assetsSum && assetsSum.held ? "text-info" : "text-fg-subtle" },
                    { label: "Doc issues", value: docIssues, tone: docIssues ? "text-warn" : "text-success" },
                  ];
                  return (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                      {tiles.map((t) => (
                        <div key={t.label} className="rounded-xl bg-bg-elev ring-1 ring-border/70 px-2.5 py-2 text-center">
                          <div className={cn("text-base font-semibold tabular leading-none", t.tone)}>{t.value}</div>
                          <div className="mt-1 text-[10px] text-fg-muted leading-tight">{t.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <RequirementsChecklist
                  personId={person.id}
                  onChanged={refresh}
                  onNavigate={close}
                  onSummary={setCompSum}
                  onAddDocument={(opts) => setAddDoc({ title: opts.title, category: opts.category })}
                  reloadSignal={refreshKey}
                />

                <JourneyChecklist
                  personId={person.id}
                  kind={person.active ? "onboarding" : "offboarding"}
                  onChanged={refresh}
                  onNavigate={close}
                  onSummary={setJourneySum}
                />

                <PersonAssets personId={person.id} onChanged={refresh} onNavigate={close} onSummary={setAssetsSum} />

                {/* Profile details — HR master data (collapsed; "—" shows what's still missing) */}
                {(() => {
                  const rows: Array<[string, string | null]> = [
                    ["Date of birth", person.dateOfBirth ? fmtDate(new Date(person.dateOfBirth)) : null],
                    ["Nationality", person.nationality],
                    ["National ID", person.nationalId],
                    ["Passport no.", person.passportNo],
                    ["Address", person.address],
                    ["Emergency contact", [person.emergencyContactName, person.emergencyContactPhone].filter(Boolean).join(" · ") || null],
                    ["Probation ends", person.probationEndDate ? fmtDate(new Date(person.probationEndDate)) : null],
                  ];
                  // Backward sync: which saved document backs a given identity field.
                  const docFor = (kind: "passport" | "nationalId") =>
                    data.documents.find((d) => {
                      const hay = [d.category, d.docType, d.title].filter(Boolean).join(" ").toLowerCase();
                      return kind === "passport"
                        ? d.category === "Passport" || hay.includes("passport")
                        : /national id|nida/.test(hay);
                    }) ?? null;
                  const filled = rows.filter(([, v]) => v).length;
                  return (
                    <details className="group glass elevated rounded-2xl overflow-hidden">
                      <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
                        <Briefcase size={12} /> Profile details
                        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{filled}/{rows.length}</span>
                        <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-4 pb-3 grid grid-cols-2 gap-x-3 gap-y-2">
                        {rows.map(([label, value]) => {
                          const doc = label === "Passport no." ? docFor("passport") : label === "National ID" ? docFor("nationalId") : null;
                          return (
                            <div key={label}>
                              <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</div>
                              <div className={cn("text-sm", value ? "text-fg" : "text-fg-subtle")}>{value || "—"}</div>
                              {doc && (
                                <Link href={`/documents?person=${person.id}`} onClick={close}
                                  title={`On file: ${doc.title}`}
                                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-accent hover:underline max-w-full">
                                  <FileText size={10} className="shrink-0" />
                                  <span className="truncate">{value ? doc.title : `${doc.title} — on file`}</span>
                                </Link>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })()}

                {/* Compliance documents linked to this person */}
                {data && data.documents.length > 0 && (() => {
                  const expired = data.documents.filter((d) => d.status === "Expired").length;
                  const expiring = data.documents.filter((d) => d.status === "Expiring").length;
                  return (
                    <details className="group glass elevated rounded-2xl overflow-hidden">
                      <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
                        <FileText size={12} /> Documents
                        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">
                          {data.documents.length}
                        </span>
                        {expired > 0 && <Badge tone="danger" className="normal-case">{expired} expired</Badge>}
                        {expiring > 0 && <Badge tone="warn" className="normal-case">{expiring} expiring</Badge>}
                        <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-2 pb-2">
                        <div className="rounded-xl overflow-hidden divide-y divide-border/60">
                          {data.documents.slice(0, 8).map((doc) => (
                            <Link
                              key={doc.id}
                              href={`/documents?person=${person.id}`}
                              onClick={close}
                              className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-bg-muted/50 transition-colors"
                            >
                              <span
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full shrink-0",
                                  doc.status === "Expired" ? "bg-danger" :
                                  doc.status === "Expiring" ? "bg-warn" :
                                  doc.status === "Valid" ? "bg-success" : "bg-fg-subtle"
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium truncate">{doc.title}</span>
                                <span className="block text-[10px] text-fg-muted truncate">
                                  {[doc.category, doc.docType, doc.expiryLabel].filter(Boolean).join(" - ") || "No expiry date"}
                                </span>
                              </span>
                              <Badge tone={documentTone(doc.status)} className="shrink-0">{doc.status}</Badge>
                            </Link>
                          ))}
                        </div>
                        {data.documents.length > 8 && (
                          <p className="text-[10px] text-fg-subtle text-center pt-2">+ {data.documents.length - 8} more</p>
                        )}
                      </div>
                    </details>
                  );
                })()}

                {/* Notes */}
                {person.notes && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle mb-1.5">Notes</div>
                    <p className="text-xs text-fg-muted leading-relaxed whitespace-pre-wrap">{person.notes}</p>
                  </div>
                )}

                {/* Tasks + activity — two columns on wider screens */}
                {data && (data.assignedTasks.length > 0 || data.recentUpdates.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-3 items-start">
                {/* Assigned tasks — collapsible glass card */}
                {data.assignedTasks.length > 0 && (
                  <details className="group glass elevated rounded-2xl overflow-hidden">
                    <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
                      <ListTodo size={12} /> Assigned tasks
                      <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{data.assignedTasks.length}</span>
                      <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-2 pb-2">
                      <div className="rounded-xl overflow-hidden divide-y divide-border/60">
                        {data.assignedTasks.slice(0, 12).map((t) => {
                          const urgent = t.flag === "overdue" || t.flag === "escalate-now";
                          const done = t.status === "Completed" || t.status === "Closed";
                          const dot = urgent ? "bg-danger" : done ? "bg-success" : t.flag === "due-soon" ? "bg-warn" : "bg-fg-subtle";
                          return (
                            <TaskDrawerLink
                              key={t.id}
                              code={t.code}
                              className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left hover:bg-bg-muted/50 transition-colors"
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-medium truncate">{t.actionItem}</span>
                                <span className="block text-[10px] text-fg-muted truncate">
                                  <span className="font-mono">{t.code}</span> · {t.companyName} · <span className={urgent ? "text-danger" : ""}>{t.status}</span>
                                </span>
                              </span>
                              <Badge tone={priorityTone(t.priority)} className="shrink-0">{t.priority}</Badge>
                            </TaskDrawerLink>
                          );
                        })}
                      </div>
                      {data.assignedTasks.length > 12 && (
                        <p className="text-[10px] text-fg-subtle text-center pt-2">+ {data.assignedTasks.length - 12} more</p>
                      )}
                    </div>
                  </details>
                )}

                {/* Recent activity — collapsible glass card */}
                {data.recentUpdates.length > 0 && (
                  <details className="group glass elevated rounded-2xl overflow-hidden">
                    <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
                      <Activity size={12} /> Recent activity
                      <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-bg-subtle text-fg-muted text-[11px] font-semibold tabular normal-case">{data.recentUpdates.length}</span>
                      <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-4 pb-4">
                      <div className="relative pl-4">
                        <div className="absolute left-1 top-1.5 bottom-1.5 w-px bg-border" />
                        <div className="space-y-2">
                          {data.recentUpdates.slice(0, 10).map((u) => (
                            <div key={u.id} className="relative">
                              <div className="absolute -left-[13px] top-2 w-2 h-2 rounded-full border-2 border-bg bg-accent" />
                              <div className="bg-accent/5 ring-1 ring-accent/15 rounded-xl px-3 py-2 space-y-1">
                                <p className="text-xs leading-relaxed">{u.body}</p>
                                <div className="flex items-center justify-between gap-2 text-[10px] text-fg-subtle">
                                  <Link href={`/task/${u.taskCode}`} className="font-mono hover:text-accent transition-colors">{u.taskCode}</Link>
                                  <span className="tabular">{fmtTime(new Date(u.createdAt))}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                )}
                </div>
                )}

                {/* Empty state — no involvement */}
                {data && data.assignedTasks.length === 0 && data.recentUpdates.length === 0 && (
                  <div className="text-center py-8 text-fg-muted text-sm">
                    <p>No tasks assigned and no recent activity.</p>
                  </div>
                )}

                {/* Manage — snooze, archive, all tasks. Tucked away by default. */}
                <details className="group glass elevated rounded-2xl overflow-hidden">
                  <summary className="list-none cursor-pointer flex items-center gap-2 px-4 py-3 text-xs font-medium uppercase tracking-wider text-fg-muted select-none">
                    <Clock size={12} /> Manage
                    <ChevronDown size={14} className="ml-auto text-fg-subtle transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1.5">Snooze reminders</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={snoozeInput}
                          onChange={(e) => setSnoozeInput(e.target.value)}
                          min={new Date().toISOString().slice(0, 10)}
                          disabled={actionPending}
                          className="flex-1 rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                        />
                        <button type="button" onClick={handleSnoozeSave} disabled={actionPending}
                          className="px-2.5 py-1.5 text-xs rounded-md bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50">Save</button>
                        {person.snoozedUntil && (
                          <button type="button" onClick={() => { setSnoozeInput(""); }} disabled={actionPending}
                            className="px-2.5 py-1.5 text-xs rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">Clear</button>
                        )}
                      </div>
                      {person.snoozedUntil && (
                        <p className="text-[11px] text-fg-subtle mt-1">Currently snoozed until {fmtDate(new Date(person.snoozedUntil))}.</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={handleArchiveToggle}
                        disabled={actionPending}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                          person.active
                            ? "border-danger/40 text-danger hover:bg-danger/10"
                            : "border-success/40 text-success hover:bg-success/10"
                        }`}
                      >
                        {person.active ? <><Archive size={12} /> Archive person</> : <><RotateCcw size={12} /> Restore person</>}
                      </button>
                      <Link
                        href={`/?tab=tasks&view=table&q=${encodeURIComponent(person.name)}&all=1`}
                        className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors"
                      >
                        <ExternalLink size={11} /> All tasks involving {person.name.split(" ")[0]}
                      </Link>
                    </div>
                  </div>
                </details>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    {/* In-place "Add document" — layered above the person, so the flow stays
        immersive: no navigation to /documents, no background page switch. On
        save the checklist + tiles refresh in place via refreshKey. */}
    {person && data && (
      <Dialog.Root open={!!addDoc} onOpenChange={(o) => { if (!o) setAddDoc(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm
            data-[state=open]:animate-in data-[state=open]:fade-in-0
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2
              w-[min(560px,calc(100vw-1.5rem))] max-h-[88dvh] flex flex-col overflow-hidden
              glass glass-refract rounded-2xl outline-none
              data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0
              data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
              <Dialog.Title className="text-sm font-semibold truncate">Add a document for {person.name}</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close"
                  className="h-7 w-7 inline-flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors">
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
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
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )}
    </>
  );
}
