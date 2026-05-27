"use client";

import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, Mail, Phone, MessageCircle, MoonStar, UserX, Loader2, AlertCircle,
  Briefcase, Building2, ExternalLink, Activity, ListTodo,
} from "lucide-react";
import Link from "next/link";
import { TaskDrawerLink } from "./task-drawer-link";
import { Badge } from "./ui";
import type { TaskRow } from "@/lib/queries";

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
  contactStatus: string | null;
  active: boolean;
  notes: string | null;
  snoozedUntil: string | null;
  managerId: number | null;
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
  recentUpdates: Array<{
    id: number;
    taskId: number;
    taskCode: string;
    taskTitle: string;
    body: string;
    createdAt: string;
  }>;
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

function whatsappHref(num: string) {
  // strip non-digits then prefix wa.me
  return `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
}

/* -------------------------------------------------------------------------
 * PersonDrawer
 * ---------------------------------------------------------------------- */
export function PersonDrawer() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const idStr = searchParams.get("person");
  const open = !!idStr;

  const [data, setData] = useState<DrawerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("person");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!idStr) { setData(null); return; }
    setLoading(true);
    setError(false);
    fetch(`/api/people-detail?id=${encodeURIComponent(idStr)}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d: DrawerData) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [idStr]);

  const person = data?.person;
  const snoozed = person?.snoozedUntil ? new Date(person.snoozedUntil) > new Date() : false;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          forceMount
          className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm
            transition-opacity duration-200
            data-[state=open]:opacity-100
            data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none"
        />
        <Dialog.Content
          forceMount
          aria-describedby={undefined}
          className="fixed right-0 top-0 bottom-0 z-[51] w-full max-w-[520px] flex flex-col
            bg-bg border-l border-border shadow-2xl outline-none
            transition-transform duration-300 ease-out
            data-[state=open]:translate-x-0
            data-[state=closed]:translate-x-full"
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

            {person && (
              <div className="p-5 space-y-5">
                {/* Role + Company + status */}
                <div className="space-y-2">
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
                          href={`/?tab=companies&co=${person.companyId}`}
                          className="inline-flex items-center gap-1 text-fg-muted hover:text-accent transition-colors"
                        >
                          <Building2 size={11} /> {person.companyName}
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {!person.active && <Badge tone="default"><UserX size={10} className="inline mr-0.5" /> Inactive</Badge>}
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

                {/* Contact actions */}
                <div className="flex flex-wrap gap-1.5">
                  {person.email && (
                    <a
                      href={`mailto:${person.email}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:border-accent hover:text-accent transition-colors"
                    >
                      <Mail size={12} /> Email
                    </a>
                  )}
                  {person.whatsapp && (
                    <a
                      href={whatsappHref(person.whatsapp)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:border-accent hover:text-accent transition-colors"
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </a>
                  )}
                  {person.phone && (
                    <a
                      href={`tel:${person.phone}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:border-accent hover:text-accent transition-colors"
                    >
                      <Phone size={12} /> Call
                    </a>
                  )}
                  {!person.email && !person.whatsapp && !person.phone && (
                    <span className="text-xs text-danger inline-flex items-center gap-1">
                      <AlertCircle size={11} /> No contact info on file
                    </span>
                  )}
                </div>

                {/* Workload strip */}
                {data && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">
                      Workload
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Open", value: data.workload.open, tone: "default" },
                        { label: "Overdue", value: data.workload.overdue, tone: "danger" },
                        { label: "Due Soon", value: data.workload.dueSoon, tone: "warn" },
                        { label: "Blocked", value: data.workload.blocked, tone: "warn" },
                        { label: "Escalated", value: data.workload.escalated, tone: "danger" },
                        { label: "Done · mo", value: data.workload.completedThisMonth, tone: "success" },
                      ].map(({ label, value, tone }) => {
                        const color =
                          value === 0 ? "text-fg-subtle" :
                          tone === "danger" ? "text-danger" :
                          tone === "warn" ? "text-warn" :
                          tone === "success" ? "text-success" : "text-fg";
                        return (
                          <div key={label} className="card p-2.5">
                            <div className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</div>
                            <div className={`text-lg font-semibold tabular mt-0.5 ${color}`}>{value}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {person.notes && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2">Notes</div>
                    <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-wrap">{person.notes}</p>
                  </div>
                )}

                {/* Assigned tasks */}
                {data && data.assignedTasks.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium uppercase tracking-wider text-fg-muted inline-flex items-center gap-1.5">
                        <ListTodo size={11} /> Assigned tasks ({data.assignedTasks.length})
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {data.assignedTasks.slice(0, 10).map((t) => (
                        <TaskDrawerLink
                          key={t.id}
                          code={t.code}
                          className="block w-full text-left card p-2.5 hover:border-accent transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium line-clamp-2">{t.actionItem}</p>
                              <p className="text-[10px] text-fg-muted mt-0.5">
                                {t.code} · {t.companyName} · <span className={t.flag === "overdue" || t.flag === "escalate-now" ? "text-danger" : ""}>{t.status}</span>
                              </p>
                            </div>
                            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                          </div>
                        </TaskDrawerLink>
                      ))}
                      {data.assignedTasks.length > 10 && (
                        <p className="text-[10px] text-fg-subtle text-center py-1">
                          + {data.assignedTasks.length - 10} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent activity */}
                {data && data.recentUpdates.length > 0 && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-2 inline-flex items-center gap-1.5">
                      <Activity size={11} /> Recent activity
                    </div>
                    <div className="relative pl-4">
                      <div className="absolute left-1 top-1 bottom-1 w-px bg-border" />
                      <div className="space-y-2">
                        {data.recentUpdates.slice(0, 10).map((u) => (
                          <div key={u.id} className="relative">
                            <div className="absolute -left-2.5 top-1.5 w-1.5 h-1.5 rounded-full bg-accent" />
                            <div className="bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 space-y-0.5">
                              <p className="text-xs leading-relaxed">{u.body}</p>
                              <div className="flex items-center justify-between gap-2 text-[10px] text-fg-subtle">
                                <Link
                                  href={`/task/${u.taskCode}`}
                                  className="font-mono hover:text-accent transition-colors"
                                >
                                  {u.taskCode}
                                </Link>
                                <span>{fmtTime(new Date(u.createdAt))}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty state — no involvement */}
                {data && data.assignedTasks.length === 0 && data.recentUpdates.length === 0 && (
                  <div className="text-center py-8 text-fg-muted text-sm">
                    <p>No tasks assigned and no recent activity.</p>
                  </div>
                )}

                {/* Footer link to view all their tasks */}
                {person && (
                  <div className="pt-2 border-t border-border">
                    <Link
                      href={`/?tab=tasks&view=table&q=${encodeURIComponent(person.name)}&all=1`}
                      className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors"
                    >
                      <ExternalLink size={11} /> View all tasks involving {person.name.split(" ")[0]}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
