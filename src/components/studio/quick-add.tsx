"use client";

/**
 * The footer's "+ New" card (mockup board QuickAdd, approved 24 Sept 2026).
 *
 * ONE card, a tab per record type — the same shortlist the old New menu used
 * (`creatables()`, so the list still lives in entity-view.ts). It opens on the
 * tab that fits the page you are on.
 *
 * Task is built in full here (QuickTaskPane). The other types get their own
 * quick card in their phase (the CreateEdit board); until then their tab says
 * so and takes you to the form that already exists — nothing is lost.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, Maximize2, X } from "lucide-react";
import { creatables } from "@/lib/entity-view";
import { requestCreate } from "@/lib/use-create-param";
import { useRegisteredActions } from "@/components/context-actions";
import { studioNewTaskOptions } from "@/app/task/actions";
import { QuickTaskPane, type Options } from "./tasks/new-task";
import { QuickPersonPane } from "./people/quick-person";
import { QuickCompanyPane } from "./companies/quick-company";
import { QuickDocumentPane } from "./files/quick-document";
import { cn } from "@/lib/cn";

const LATER: Record<string, { phase: string; what: string }> = {
  note: { phase: "Phase 4", what: "A new note opens straight into the writing sheet." },
  event: { phase: "Phase 4", what: "The event form handles guests, invitations and papers that travel." },
  announcement: { phase: "Phase 4", what: "The composer sets who sees it and whether they must confirm." },
};

/** The tab that fits the page you are on. */
function tabFor(pathname: string): string {
  if (pathname.startsWith("/people")) return "person";
  if (pathname.startsWith("/companies")) return "company";
  if (pathname.startsWith("/files")) return "document";
  if (pathname.startsWith("/calendar")) return "event";
  if (pathname.startsWith("/notes")) return "note";
  if (pathname.startsWith("/announcements")) return "announcement";
  return "task";
}

export function StudioQuickAdd({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const router = useRouter();
  const items = creatables();
  const [tab, setTab] = useState(() => initialTab ?? tabFor(pathname));
  const [options, setOptions] = useState<Options | null>(null);
  const submitRef = useRef<{ fn: (again: boolean) => void; busy: boolean; full: () => string } | null>(null);
  const personRef = useRef<{ fn: (again: boolean) => void; busy: boolean; full: () => string } | null>(null);
  const companyRef = useRef<{ fn: (again: boolean) => void; busy: boolean; full: () => string } | null>(null);
  const [, force] = useState(0);
  const { actions } = useRegisteredActions();

  useEffect(() => { studioNewTaskOptions().then(setOptions).catch(() => setOptions({ companies: [], people: [], departments: [] })); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The company the list is filtered to, else the one you used last.
  let defaultCompanyId: number | null = null;
  if (options) {
    const named = params.get("company");
    defaultCompanyId = (named && options.companies.find((c) => c.name === named)?.id) || null;
    if (!defaultCompanyId) {
      try { const c = Number(localStorage.getItem("studio.newTask.company")); if (options.companies.some((x) => x.id === c)) defaultCompanyId = c; } catch { /* fine */ }
    }
  }

  const register = useCallback((fn: (again: boolean) => void, busy: boolean, full: () => string) => {
    const was = submitRef.current?.busy;
    submitRef.current = { fn, busy, full };
    if (was !== busy) force((n) => n + 1);
  }, []);
  const registerCompany = useCallback((fn: (again: boolean) => void, busy: boolean, full: () => string) => {
    const was = companyRef.current?.busy;
    companyRef.current = { fn, busy, full };
    if (was !== busy) force((n) => n + 1);
  }, []);
  const registerPerson = useCallback((fn: (again: boolean) => void, busy: boolean, full: () => string) => {
    const was = personRef.current?.busy;
    personRef.current = { fn, busy, full };
    if (was !== busy) force((n) => n + 1);
  }, []);

  // A page's own create action that is not one of the tabs ("Add asset").
  const pageCreate = actions.find((a) => /\b(new|create|add|raise)\b/i.test(a.label) && !/\btask\b/i.test(a.label));
  const later = LATER[tab];
  const current = items.find((c) => c.id === tab);

  const sub = submitRef.current;
  return (
    <div className="fixed inset-0 z-[45]" role="dialog" aria-label="Create something">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.35)]" />
      {/* Dark and dotted, like the Go-to panel — both open from the footer. */}
      <div className="studio st-sheet st-sheet-dots st-pop absolute bottom-[calc(var(--foot-h)+env(safe-area-inset-bottom)+8px)] right-3 flex max-h-[calc(100dvh-100px)] w-[min(720px,calc(100vw-24px))] flex-col gap-4 overflow-y-auto rounded-3xl bg-[var(--sh-bg)] p-5 text-[var(--sh-fg)] shadow-[0_30px_80px_rgba(0,0,0,0.4)] sm:right-6">
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]" role="tablist">
            {items.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} onClick={() => setTab(c.id)}
                className={cn("h-8 shrink-0 whitespace-nowrap rounded-[10px] px-3 text-xs transition-colors",
                  tab === c.id ? "bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]")}>
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--sh-chip-line)] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]"><X size={13} /></button>
        </div>

        {/* The task pane stays MOUNTED while another tab is showing, so a
            half-typed task survives a look at the other tabs. */}
        <div className={tab === "task" ? "" : "hidden"}>
          {options ? (
            <QuickTaskPane options={options} defaultCompanyId={defaultCompanyId} onDone={(again) => { if (!again) onClose(); }} registerSubmit={register} />
          ) : (
            <div className="flex h-40 items-center justify-center text-[var(--sh-muted)]"><Loader2 size={16} className="animate-spin" /></div>
          )}
        </div>
        <div className={tab === "person" ? "" : "hidden"}>
          {options ? (
            <QuickPersonPane options={options} defaultCompanyId={defaultCompanyId} onDone={(again) => { if (!again) onClose(); }} registerSubmit={registerPerson} />
          ) : (
            <div className="flex h-40 items-center justify-center text-[var(--sh-muted)]"><Loader2 size={16} className="animate-spin" /></div>
          )}
        </div>
        {tab === "company" && <QuickCompanyPane onDone={(again) => { if (!again) onClose(); }} registerSubmit={registerCompany} />}
        {tab === "document" && <QuickDocumentPane onClose={onClose} />}
        {tab !== "task" && tab !== "person" && tab !== "company" && tab !== "document" && (
          <div className="flex min-h-[150px] flex-col justify-center gap-1.5 rounded-2xl border border-[var(--sh-line)] bg-[var(--sh-card)] px-5 py-5">
            <div className="text-[18px] font-medium tracking-[-0.01em]">New {current?.label.toLowerCase()}</div>
            <p className="max-w-[460px] text-[13px] leading-relaxed text-[var(--sh-sub)]">
              {later?.what} Its quick card here comes with the {later?.phase} redesign — for now the full form does the job.
            </p>
          </div>
        )}

        {pageCreate && (
          <div className="flex items-center gap-2 text-xs text-[var(--sh-muted)]">
            On this page:
            {pageCreate.href ? (
              <Link href={pageCreate.href} onClick={onClose} className="font-medium text-[var(--sh-fg)] hover:underline">{pageCreate.label}</Link>
            ) : (
              <button type="button" onClick={() => { onClose(); pageCreate.onClick?.(); }} className="font-medium text-[var(--sh-fg)] hover:underline">{pageCreate.label}</button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--sh-line)] pt-3">
          {tab === "task" ? (
            <>
              <button type="button" onClick={() => { const href = sub?.full() ?? "/task/new"; onClose(); router.push(href); }}
                className="inline-flex h-9 items-center gap-1.5 px-1 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">
                Open as a full task<Maximize2 size={12} />
              </button>
              <button type="button" disabled={!options || sub?.busy} onClick={() => sub?.fn(true)}
                className="inline-flex h-9 items-center rounded-[10px] border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)] disabled:opacity-50">
                Create and add another
              </button>
              <button type="button" disabled={!options || sub?.busy} onClick={() => sub?.fn(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-4 text-[13px] font-semibold text-[var(--sh-on-fg)] hover:opacity-90 disabled:opacity-50">
                {sub?.busy && <Loader2 size={13} className="animate-spin" />}Create task
              </button>
            </>
          ) : tab === "person" ? (
            <>
              <button type="button" disabled={!options || personRef.current?.busy} onClick={() => personRef.current?.fn(true)}
                className="inline-flex h-9 items-center rounded-[10px] border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)] disabled:opacity-50">
                Create and add another
              </button>
              <button type="button" disabled={!options || personRef.current?.busy} onClick={() => personRef.current?.fn(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-4 text-[13px] font-semibold text-[var(--sh-on-fg)] hover:opacity-90 disabled:opacity-50">
                {personRef.current?.busy && <Loader2 size={13} className="animate-spin" />}Create person
              </button>
            </>
          ) : tab === "company" ? (
            <>
              <button type="button" disabled={companyRef.current?.busy} onClick={() => companyRef.current?.fn(true)}
                className="inline-flex h-9 items-center rounded-[10px] border border-[var(--sh-chip-line)] px-3.5 text-[13px] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)] disabled:opacity-50">
                Create and add another
              </button>
              <button type="button" disabled={companyRef.current?.busy} onClick={() => companyRef.current?.fn(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-4 text-[13px] font-semibold text-[var(--sh-on-fg)] hover:opacity-90 disabled:opacity-50">
                {companyRef.current?.busy && <Loader2 size={13} className="animate-spin" />}Create company
              </button>
            </>
          ) : tab === "document" ? (
            <Link href="/files" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 px-1 text-[13px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)]">Go to Files<ArrowRight size={13} /></Link>
          ) : current ? (
            <button type="button" onClick={() => { onClose(); requestCreate(current.href, pathname, (h) => router.push(h)); }} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sh-on-bg)] px-4 text-[13px] font-semibold text-[var(--sh-on-fg)] hover:opacity-90">Continue to the form<ArrowRight size={13} /></button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
