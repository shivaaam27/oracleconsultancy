"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X, ClipboardList, User, ArrowUpRight } from "lucide-react";
import type {
  PortalSearchResult,
  PortalSearchTask,
  PortalSearchPerson,
} from "@/lib/portal-search";

/* ------------------------------------------------------------------ *
 * Scoped staff-portal search overlay (Ctrl+K / ⌘K / Ctrl+Space).
 *
 * Strictly scoped: every result comes from the /api/portal/search route
 * handler, which re-checks the signed-in person's permissions. We fetch
 * a plain Route Handler (NOT a server action) so a keystroke never
 * re-renders the force-dynamic portal page. The client holds no unscoped
 * data and makes no other fetch. The admin command palette deliberately
 * bails on /portal, so this owns the ⌘K hotkey here.
 *
 * Aurora: a centred liquid-glass card, calm states, reduced-motion safe
 * (no framer — entrance is a CSS class that respects the portal's manual
 * data-motion="reduced" via globals.css / prefers-reduced-motion).
 * ------------------------------------------------------------------ */

const EMPTY: PortalSearchResult = { tasks: [], people: [] };

export function PortalSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PortalSearchResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against an out-of-order debounce write clobbering a newer one.
  const reqSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setLoading(false);
  }, []);

  // Hotkeys: ⌘K / Ctrl+K and Ctrl+Space open/toggle. Esc closes. The admin
  // palette bails on /portal, so there's no double-fire here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // Ctrl+Space (never Cmd+Space — that's Spotlight / the IME switcher).
      if (e.ctrlKey && (e.code === "Space" || e.key === " ")) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setOpen((o) => (o ? false : o));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A trigger button in the header dispatches this event to open the overlay.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("cos:portal-search", onOpen);
    return () => window.removeEventListener("cos:portal-search", onOpen);
  }, []);

  // Close on navigation so the overlay never lingers across a route change.
  useEffect(() => {
    close();
    // Intentionally only on pathname change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Reset + focus when opening; lock the page scroll while open.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(EMPTY);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Debounced scoped search via the /api/portal/search route handler. Fetching a
  // plain Route Handler (not a server action) is what keeps a keystroke from
  // re-rendering the force-dynamic portal page.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++reqSeq.current;
    // Cancel the in-flight request as soon as a newer keystroke supersedes it.
    const ac = new AbortController();
    const t = setTimeout(async () => {
      let data: PortalSearchResult = EMPTY;
      try {
        const res = await fetch(`/api/portal/search?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
          signal: ac.signal,
        });
        if (res.ok) data = (await res.json()) as PortalSearchResult;
      } catch {
        // Aborted or network blip → fall back to EMPTY (never throw).
        data = EMPTY;
      }
      // Drop stale responses (also skips the result of an aborted fetch).
      if (seq !== reqSeq.current) return;
      setResults(data);
      setLoading(false);
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, open]);

  if (!open) return null;

  const trimmed = query.trim();
  const hasResults = results.tasks.length > 0 || results.people.length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close search"
        onClick={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-xl"
      />

      {/* Card — .fade-in is reduced-motion safe both ways (OS media query +
          the portal's manual data-motion="reduced" toggle neutralise it). */}
      <div className="fade-in relative w-full max-w-xl overflow-hidden rounded-3xl glass-menu elevated ring-1 ring-border shadow-pill">
        {/* Input row */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <Search size={16} className="shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your tasks and colleagues…"
            className="min-w-0 flex-1 bg-transparent text-[15px] leading-6 outline-none placeholder:text-fg-subtle"
            aria-label="Search your tasks and colleagues"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
            >
              <X size={13} />
            </button>
          )}
          <kbd className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain p-1.5">
          {!trimmed ? (
            <p className="px-3 py-8 text-center text-sm text-fg-muted">
              Type to search your tasks and colleagues.
            </p>
          ) : loading && !hasResults ? (
            <p className="px-3 py-8 text-center text-sm text-fg-muted">Searching…</p>
          ) : !hasResults ? (
            <p className="px-3 py-8 text-center text-sm text-fg-muted">
              No matches for &ldquo;{trimmed}&rdquo;.
            </p>
          ) : (
            <>
              {results.tasks.length > 0 && (
                <Section label="Tasks">
                  {results.tasks.map((t) => (
                    <TaskRow key={t.code} task={t} onOpen={() => { close(); router.push(`/portal/task/${t.code}`); }} />
                  ))}
                </Section>
              )}
              {results.people.length > 0 && (
                <Section label="People">
                  {results.people.map((p) => (
                    <PersonRow
                      key={p.id}
                      person={p}
                      onOpen={p.canOpenProfile ? () => { close(); router.push(`/portal/people/${p.id}`); } : undefined}
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small, unobtrusive header affordance that opens the search overlay.
 *  Lives next to the notification bell. Aurora-styled; British aria-label. */
export function PortalSearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("cos:portal-search"))}
      aria-label="Search"
      title="Search (Ctrl K)"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
    >
      <Search size={16} />
    </button>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      {children}
    </div>
  );
}

function TaskRow({ task, onOpen }: { task: PortalSearchTask; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-bg-muted"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <ClipboardList size={14} />
      </span>
      <span className="w-[64px] shrink-0 truncate font-mono text-xs text-fg-muted">{task.code}</span>
      <span className="min-w-0 flex-1 truncate">{task.actionItem}</span>
      {task.companyName && (
        <span className="hidden shrink-0 max-w-[120px] truncate text-xs text-fg-subtle sm:inline">{task.companyName}</span>
      )}
      <span className="hidden shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[10px] text-fg-muted sm:inline">{task.status}</span>
    </button>
  );
}

function PersonRow({ person, onOpen }: { person: PortalSearchPerson; onOpen?: () => void }) {
  const meta = [person.role, person.company].filter(Boolean).join(" · ") || "—";
  const inner = (
    <>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <User size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        <span className="block truncate text-[11px] text-fg-muted">{meta}</span>
      </span>
      {onOpen && <ArrowUpRight size={15} className="shrink-0 text-fg-subtle" />}
    </>
  );

  // Staff (canOpenProfile false) get a calm, non-interactive row — name + role +
  // company only. They can't open a colleague's profile page (it guards them out).
  if (!onOpen) {
    return <div className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left">{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-muted"
    >
      {inner}
    </button>
  );
}
