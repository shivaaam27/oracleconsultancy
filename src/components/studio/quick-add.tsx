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
import { useRegisteredActions } from "@/components/context-actions";
import { studioNewTaskOptions } from "@/app/task/actions";
import { QuickTaskPane, type Options } from "./tasks/new-task";
import { stBtn } from "./kit";
import { cn } from "@/lib/cn";

const LATER: Record<string, { phase: string; what: string }> = {
  note: { phase: "Phase 4", what: "A new note opens straight into the writing sheet." },
  event: { phase: "Phase 4", what: "The event form handles guests, invitations and papers that travel." },
  announcement: { phase: "Phase 4", what: "The composer sets who sees it and whether they must confirm." },
  person: { phase: "Phase 5", what: "The person form covers the profile, role, reporting line and portal access." },
  document: { phase: "Phase 5", what: "Drop the file there — it is read and the fields fill in for you to check." },
  company: { phase: "Phase 5", what: "The company form sets the name and the two-letter task code." },
};

/** The tab that fits the page you are on. */
function tabFor(pathname: string): string {
  if (pathname.startsWith("/people")) return "person";
  if (pathname.startsWith("/companies")) return "company";
  if (pathname.startsWith("/documents")) return "document";
  if (pathname.startsWith("/calendar")) return "event";
  if (pathname.startsWith("/notes")) return "note";
  if (pathname.startsWith("/announcements")) return "announcement";
  return "task";
}

export function StudioQuickAdd({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const router = useRouter();
  const items = creatables();
  const [tab, setTab] = useState(() => tabFor(pathname));
  const [options, setOptions] = useState<Options | null>(null);
  const submitRef = useRef<{ fn: () => void; busy: boolean; full: () => string } | null>(null);
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

  const register = useCallback((fn: () => void, busy: boolean, full: () => string) => {
    const was = submitRef.current?.busy;
    submitRef.current = { fn, busy, full };
    if (was !== busy) force((n) => n + 1);
  }, []);

  // A page's own create action that is not one of the tabs ("Add asset").
  const pageCreate = actions.find((a) => /\b(new|create|add|raise)\b/i.test(a.label) && !/\btask\b/i.test(a.label));
  const later = LATER[tab];
  const current = items.find((c) => c.id === tab);

  return (
    <div className="fixed inset-0 z-[45]" role="dialog" aria-label="Create something">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(14,15,16,0.32)]" />
      <div className="studio st-pop absolute bottom-[calc(64px+env(safe-area-inset-bottom)+8px)] right-3 flex max-h-[calc(100dvh-100px)] w-[min(700px,calc(100vw-24px))] flex-col gap-4 overflow-y-auto rounded-3xl bg-[var(--st-surface)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.30)] sm:right-6">
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-[11px] bg-[var(--st-seg)] p-[3px] [scrollbar-width:none]" role="tablist">
            {items.map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} onClick={() => setTab(c.id)}
                className={cn("h-[30px] shrink-0 whitespace-nowrap rounded-lg px-3 text-xs transition-colors", tab === c.id ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                {c.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--st-line)] hover:bg-[var(--st-page)]"><X size={13} /></button>
        </div>

        {/* The task pane stays MOUNTED while another tab is showing, so a
            half-typed task survives a look at the other tabs. */}
        <div className={tab === "task" ? "" : "hidden"}>
          {options ? (
            <QuickTaskPane options={options} defaultCompanyId={defaultCompanyId} onDone={(keep) => { if (!keep) onClose(); }} registerSubmit={register} />
          ) : (
            <div className="flex h-40 items-center justify-center text-[var(--st-muted)]"><Loader2 size={16} className="animate-spin" /></div>
          )}
        </div>
        {tab !== "task" && (
          <div className="st-tex-paper-dots flex min-h-[160px] flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-[var(--st-line)] px-6 py-5">
            <div className="rounded-xl bg-[var(--st-surface)] px-1 py-0.5">
              <div className="text-[15px] font-semibold">New {current?.label.toLowerCase()}</div>
              <p className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-[var(--st-sub)]">
                {later?.what} Its quick card here comes with the {later?.phase} redesign — for now the full form does the job.
              </p>
            </div>
          </div>
        )}

        {pageCreate && (
          <div className="flex items-center gap-2 text-xs text-[var(--st-muted)]">
            On this page:
            {pageCreate.href ? (
              <Link href={pageCreate.href} onClick={onClose} className="font-medium text-[var(--st-ink)] hover:underline">{pageCreate.label}</Link>
            ) : (
              <button type="button" onClick={() => { onClose(); pageCreate.onClick?.(); }} className="font-medium text-[var(--st-ink)] hover:underline">{pageCreate.label}</button>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-[var(--st-line-soft)] pt-3">
          {tab === "task" ? (
            <>
              <button type="button" onClick={() => { const href = submitRef.current?.full() ?? "/task/new"; onClose(); router.push(href); }}
                className="inline-flex items-center gap-1.5 text-[13px] text-[var(--st-sub)] hover:text-[var(--st-ink)]">
                Open as a full task<Maximize2 size={12} />
              </button>
              <button type="button" disabled={!options || submitRef.current?.busy} onClick={() => submitRef.current?.fn()} className={stBtn.dark}>
                {submitRef.current?.busy && <Loader2 size={13} className="animate-spin" />}Create task
              </button>
            </>
          ) : current ? (
            <Link href={current.href} onClick={onClose} className={stBtn.dark}>Continue to the form<ArrowRight size={13} /></Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
