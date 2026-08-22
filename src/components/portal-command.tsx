"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, X, Sparkles, ClipboardList, User, Building2, FileText, CalendarClock, ArrowUpRight, Wand2, Loader2, CornerDownLeft, ArrowRight, Check, RotateCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { HighlightSnippet, WhyTag } from "./command-palette-bits";

/* ------------------------------------------------------------------ *
 * Portal ORI — the scoped staff-portal command surface (Ctrl+K / ⌘K /
 * Ctrl+Space).
 *
 * SLIM + STRICTLY SCOPED. Everything here talks ONLY to the portal ORI
 * route handlers, each of which re-checks the signed-in person's caps +
 * company scope server-side. The client mirrors those exact contracts:
 *
 *   GET  /api/portal/ori/search?q=…
 *     → { tasks, people, results }               (all pre-scoped)
 *
 *   POST /api/portal/ori/ask   { question }
 *     → { mode, answer?, note?, tasks, people, results }
 *       • answer = a structured SmartAnswer CARD (title/count/rows), not a
 *         string — group-wide viewers only. Scoped viewers get `note` +
 *         the scoped tasks/people/results instead.
 *
 *   POST /api/portal/ori/act   (canAct only — same shape as admin AgentCard)
 *     plan:    { messages: [{role,content}] }
 *              → { mode:"ask"|"answer"|"confirm", reply?, plan? }
 *     execute: { confirmPlan: plan }
 *              → { mode:"done", ok, results }
 *
 * The client holds NO unscoped data and imports NO server lib — plain
 * fetch to the portal endpoints only. It never touches the admin
 * command-palette, /api/search, /api/ask or /api/ori.
 *
 * Gating (props resolved server-side from me.caps in the layout):
 *   canAsk  = me.caps.oriAsk  → the whole surface (mount is gated on this too)
 *   canAct  = me.caps.oriAct  → the "ORI can do this" command box (else read-only)
 *
 * Aurora / §13: centred liquid-glass card, calm scrim, rounded-lg chips,
 * scroll-fade list, outline lucide icons. Reduced-motion safe both ways —
 * the entrance is the CSS `.fade-in` class which the OS media query AND the
 * portal's manual data-motion="reduced" toggle neutralise (globals.css).
 * No framer here.
 * ------------------------------------------------------------------ */

/* ── Server response shapes (mirror the route handlers) ─────────────── */

/** Wider entity results from unifiedSearch, hard-scoped server-side. */
type OriResultType =
  | "person" | "company" | "document" | "letter" | "meeting" | "vendor" | "asset"
  | "governance" | "risk" | "pipeline" | "commitment";

type OriResult = {
  type: OriResultType;
  id: number;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  snippet?: string | null;
};

/** The precisely-scoped task/person core (runPortalSearch). */
type CoreTask = { code: string; actionItem: string; companyName: string | null; status: string };
type CorePerson = { id: number; name: string; role: string | null; company: string | null; canOpenProfile: boolean };

/** A structured instant-answer CARD (SmartAnswer) — group-wide viewers only. */
type SmartRow = { label: string; sub?: string | null; badge?: string | null; href: string };
type SmartAnswer = { kind: string; title: string; count: number; rows: SmartRow[]; href?: string | null; note?: string | null };

type AskResponse = {
  mode: "answer" | "results";
  answer?: SmartAnswer | null;
  note?: string | null;
  tasks?: CoreTask[];
  people?: CorePerson[];
  results?: OriResult[];
};

type SearchResponse = { tasks?: CoreTask[]; people?: CorePerson[]; results?: OriResult[] };

/* ── Act (AgentCard) shapes ────────────────────────────────────────── */
type AgentMsg = { role: "user" | "assistant"; content: string };
type PlanStep = { tool: string; args: Record<string, unknown>; summary: string };
type ActRunResult = { tool: string; ok: boolean; message: string };
type ActPlanResponse = { mode: "ask" | "answer" | "confirm"; reply?: string; plan?: PlanStep[]; error?: string };
type ActExecResponse = { mode: "done"; ok: boolean; results: ActRunResult[] };

const EMPTY_RESULTS: OriResult[] = [];
const EMPTY_TASKS: CoreTask[] = [];
const EMPTY_PEOPLE: CorePerson[] = [];

const TYPE_ICON: Record<string, typeof ClipboardList> = {
  task: ClipboardList,
  person: User,
  company: Building2,
  document: FileText,
  letter: FileText,
  meeting: CalendarClock,
  vendor: Building2,
  asset: ClipboardList,
  governance: Building2,
  risk: Sparkles,
  pipeline: ClipboardList,
  commitment: FileText,
};

/** Best-effort deep link for a wider-entity result when the route omits href. */
function hrefFor(r: OriResult): string | null {
  if (r.href) return r.href;
  if (r.type === "company") return `/portal`;
  if (r.type === "person") return `/portal/profile`;
  return null;
}

export function PortalCommand({ canAct = false }: { canAct?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"find" | "act">("find");
  const [query, setQuery] = useState("");

  // Native scoped search state.
  const [results, setResults] = useState<OriResult[]>(EMPTY_RESULTS);
  const [tasks, setTasks] = useState<CoreTask[]>(EMPTY_TASKS);
  const [people, setPeople] = useState<CorePerson[]>(EMPTY_PEOPLE);
  const [loading, setLoading] = useState(false);

  // ORI Ask state (the "answer" that sits above the native results).
  const [answer, setAnswer] = useState<SmartAnswer | null>(null);
  const [askNote, setAskNote] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against an out-of-order debounce write clobbering a newer one.
  const reqSeq = useRef(0);

  const reset = useCallback(() => {
    setQuery("");
    setResults(EMPTY_RESULTS);
    setTasks(EMPTY_TASKS);
    setPeople(EMPTY_PEOPLE);
    setLoading(false);
    setAnswer(null);
    setAskNote(null);
    setAsking(false);
    setAsked(false);
    setMode("find");
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // Hotkeys: ⌘K / Ctrl+K and Ctrl+Space open/toggle. Esc closes. This surface
  // owns the ⌘K hotkey inside /portal (the admin palette bails on /portal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // Ctrl+Space only (never Cmd+Space — that's Spotlight / the IME switcher).
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

  // A trigger button (nav pill / header) dispatches this to open the surface.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("cos:portal-ori", onOpen);
    return () => window.removeEventListener("cos:portal-ori", onOpen);
  }, []);

  // Close on navigation so the surface never lingers across a route change.
  useEffect(() => {
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Reset + focus when opening; lock the page scroll while open.
  useEffect(() => {
    if (!open) return;
    reset();
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open, reset]);

  // Debounced scoped search via /api/portal/ori/search (a plain Route Handler,
  // so a keystroke never re-renders the force-dynamic portal page). Every result
  // is re-scoped server-side to this person's caps + company scope. The route
  // returns { tasks, people, results } — render all three.
  useEffect(() => {
    if (!open || mode !== "find") return;
    const q = query.trim();
    if (q.length < 1) {
      setResults(EMPTY_RESULTS);
      setTasks(EMPTY_TASKS);
      setPeople(EMPTY_PEOPLE);
      setLoading(false);
      setAnswer(null);
      setAskNote(null);
      setAsked(false);
      return;
    }
    setLoading(true);
    const seq = ++reqSeq.current;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      let out: SearchResponse = {};
      try {
        const res = await fetch(`/api/portal/ori/search?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
          signal: ac.signal,
        });
        if (res.ok) out = (await res.json()) as SearchResponse;
      } catch {
        out = {}; // aborted / network blip → never throw
      }
      if (seq !== reqSeq.current) return; // drop stale
      setResults(out.results ?? EMPTY_RESULTS);
      setTasks(out.tasks ?? EMPTY_TASKS);
      setPeople(out.people ?? EMPTY_PEOPLE);
      setLoading(false);
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query, open, mode]);

  // Ask ORI — fired on Enter in the find box. Scoped answer only.
  // Body is { question }; response is { mode, answer?, note?, tasks, people, results }.
  const runAsk = useCallback(async () => {
    const question = query.trim();
    if (!question || asking) return;
    setAsking(true);
    setAsked(true);
    setAnswer(null);
    setAskNote(null);
    try {
      const res = await fetch("/api/portal/ori/ask", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.ok) {
        const data = (await res.json()) as AskResponse;
        setAnswer(data.answer ?? null);
        setAskNote(data.note ?? null);
        // The ask endpoint also returns freshly-scoped rows — prefer them over
        // whatever the debounced search left, so the answer + its evidence agree.
        if (data.tasks) setTasks(data.tasks);
        if (data.people) setPeople(data.people);
        if (data.results) setResults(data.results);
      } else {
        setAskNote("ORI couldn't answer that just now.");
      }
    } catch {
      setAskNote("ORI couldn't answer that just now.");
    } finally {
      setAsking(false);
    }
  }, [query, asking]);

  if (!open) return null;

  const trimmed = query.trim();
  const hasAny = results.length > 0 || tasks.length > 0 || people.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="ORI"
    >
      {/* Calm scrim */}
      <button
        type="button"
        aria-label="Close ORI"
        onClick={close}
        className="absolute inset-0 bg-black/40 backdrop-blur-xl"
      />

      {/* Card — .fade-in is reduced-motion safe both ways. */}
      <div className="fade-in relative w-full max-w-xl overflow-hidden rounded-3xl glass-menu elevated ring-1 ring-border shadow-pill">
        {/* Mode switch — Find & ask (always) and Do (only when canAct). */}
        {canAct && (
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <ModeChip active={mode === "find"} onClick={() => setMode("find")} icon={Search} label="Find & ask" />
            <ModeChip active={mode === "act"} onClick={() => setMode("act")} icon={Wand2} label="ORI can do this" />
          </div>
        )}

        {mode === "find" ? (
          <>
            {/* Input row */}
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
              <Sparkles size={16} className="shrink-0 text-accent" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); runAsk(); }
                }}
                placeholder="Search, or ask ORI a question…"
                className="min-w-0 flex-1 bg-transparent text-[15px] leading-6 outline-none placeholder:text-fg-subtle"
                aria-label="Search or ask ORI"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setAnswer(null); setAskNote(null); setAsked(false); }}
                  aria-label="Clear"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bg-subtle text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
                >
                  <X size={13} />
                </button>
              )}
              <kbd className="shrink-0 rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-fg-subtle">ESC</kbd>
            </div>

            {/* Body — scroll-fade list */}
            <div className="scroll-fade-y max-h-[min(62vh,30rem)] overflow-y-auto overscroll-contain p-1.5">
              {/* Ask ORI answer, above the native results */}
              {(asking || answer || (asked && askNote)) && (
                <div className="mb-1.5 rounded-2xl bg-accent-soft/50 p-3 ring-1 ring-accent/15">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
                    <Sparkles size={12} /> ORI
                  </div>
                  {asking ? (
                    <p className="flex items-center gap-2 text-sm text-fg-muted">
                      <Loader2 size={14} className="animate-spin" /> Thinking…
                    </p>
                  ) : answer ? (
                    <AnswerCard
                      answer={answer}
                      onOpen={(href) => { close(); router.push(href); }}
                    />
                  ) : askNote ? (
                    <p className="text-base leading-relaxed text-fg-muted">{askNote}</p>
                  ) : null}
                  {/* A scoped viewer's note sits under the card (or standalone). */}
                  {!asking && answer && askNote && (
                    <p className="mt-1.5 text-xs text-fg-subtle">{askNote}</p>
                  )}
                </div>
              )}

              {/* Ask hint when there's a query but no answer yet */}
              {trimmed && !asked && !asking && (
                <button
                  type="button"
                  onClick={runAsk}
                  className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-bg-muted"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                    <Sparkles size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    Ask ORI: <span className="text-fg-muted">&ldquo;{trimmed}&rdquo;</span>
                  </span>
                  <CornerDownLeft size={14} className="shrink-0 text-fg-subtle" />
                </button>
              )}

              {/* Native scoped results — tasks, people, then wider entities */}
              {!trimmed ? (
                <p className="px-3 py-8 text-center text-sm text-fg-muted">
                  Search your tasks, people and documents — or ask ORI anything within your remit.
                </p>
              ) : loading && !hasAny ? (
                <p className="px-3 py-8 text-center text-sm text-fg-muted">Searching…</p>
              ) : hasAny ? (
                <>
                  {tasks.length > 0 && (
                    <Group label="Tasks">
                      {tasks.map((t) => (
                        <TaskRow key={t.code} task={t} onOpen={() => { close(); router.push(`/portal/task/${t.code}`); }} />
                      ))}
                    </Group>
                  )}
                  {people.length > 0 && (
                    <Group label="People">
                      {people.map((p) => (
                        <PersonRow
                          key={p.id}
                          person={p}
                          onOpen={p.canOpenProfile ? () => { close(); router.push(`/portal/profile`); } : undefined}
                        />
                      ))}
                    </Group>
                  )}
                  {results.length > 0 && (
                    <Group label="More">
                      {results.map((r) => {
                        const href = hrefFor(r);
                        return (
                          <ResultRow
                            key={`${r.type}-${r.id}`}
                            result={r}
                            onOpen={href ? () => { close(); router.push(href); } : undefined}
                          />
                        );
                      })}
                    </Group>
                  )}
                </>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-fg-muted">No direct matches — try asking ORI.</p>
              )}
            </div>
          </>
        ) : (
          /* ---- Act mode (canAct only) ---- */
          <ActPanel onNavigate={(href) => { close(); router.push(href); }} />
        )}
      </div>
    </div>
  );
}

/* ================================================================== *
 * ACT — clarify → confirm → execute, modelled on the admin AgentCard.
 * plan:    POST /act { messages }            → {mode:"ask"|"answer"|"confirm", reply?, plan?}
 * execute: POST /act { confirmPlan: plan }   → {mode:"done", ok, results}
 * ================================================================== */

function ActPanel({ onNavigate }: { onNavigate: (href: string) => void }) {
  type Phase =
    | { kind: "idle" }
    | { kind: "thinking" }
    | { kind: "ask"; reply: string }
    | { kind: "confirm"; reply: string; plan: PlanStep[] }
    | { kind: "running" }
    | { kind: "answer"; reply: string }
    | { kind: "done"; reply: string; results: ActRunResult[] }
    | { kind: "error"; message: string };

  const historyRef = useRef<AgentMsg[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [instruction, setInstruction] = useState(""); // the initial command box
  const [reply, setReply] = useState(""); // a clarify answer being typed
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setTimeout(() => boxRef.current?.focus(), 20); return () => clearTimeout(t); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phase]);

  // Send the current history to the planner.
  const plan = useCallback(async () => {
    setPhase({ kind: "thinking" });
    try {
      const res = await fetch("/api/portal/ori/act", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: historyRef.current }),
      });
      const d = (await res.json().catch(() => ({}))) as ActPlanResponse;
      if (!res.ok) { setPhase({ kind: "error", message: d.error || "ORI couldn't plan that just now." }); return; }
      if (d.mode === "ask") {
        historyRef.current.push({ role: "assistant", content: d.reply || "" });
        setPhase({ kind: "ask", reply: d.reply || "Could you give me a little more detail?" });
      } else if (d.mode === "confirm") {
        setPhase({ kind: "confirm", reply: d.reply || "Here's what I'll do — shall I go ahead?", plan: d.plan ?? [] });
      } else {
        setPhase({ kind: "answer", reply: d.reply || "I'm not sure how to action that yet." });
      }
    } catch {
      setPhase({ kind: "error", message: "Couldn't reach ORI just now — try again." });
    }
  }, []);

  // Kick off with the initial instruction.
  const start = () => {
    const first = instruction.trim();
    if (!first) return;
    historyRef.current = [{ role: "user", content: first }];
    void plan();
  };

  // Answer a clarify question and re-plan.
  const sendClarify = () => {
    const a = reply.trim();
    if (!a) return;
    historyRef.current.push({ role: "user", content: a });
    setReply("");
    void plan();
  };

  // Execute a confirmed plan.
  const runPlan = async (steps: PlanStep[]) => {
    setPhase({ kind: "running" });
    try {
      const res = await fetch("/api/portal/ori/act", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmPlan: steps }),
      });
      const d = (await res.json().catch(() => ({}))) as ActExecResponse;
      const results = d.results ?? [];
      setPhase({ kind: "done", reply: d.ok ? "Done." : "Ran with some issues:", results });
    } catch {
      setPhase({ kind: "error", message: "Couldn't run that just now — try again." });
    }
  };

  const restart = () => {
    historyRef.current = [];
    setInstruction("");
    setReply("");
    setPhase({ kind: "idle" });
    setTimeout(() => boxRef.current?.focus(), 20);
  };

  return (
    <div className="p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
        <Wand2 size={13} /> ORI can do this
      </p>

      {/* Initial command box — only while idle. */}
      {phase.kind === "idle" && (
        <>
          <textarea
            ref={boxRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); start(); }
            }}
            rows={3}
            placeholder="e.g. “Create a task for Shivam to renew the TRA licence, due Friday.”"
            className="w-full resize-none rounded-2xl bg-bg-subtle px-3.5 py-3 text-[14px] leading-relaxed outline-none ring-1 ring-border placeholder:text-fg-subtle focus:ring-accent/40"
            aria-label="Tell ORI what to do"
          />
          <p className="mt-1.5 text-xs text-fg-subtle">
            ORI will show you what it plans to do first — nothing happens until you confirm. Actions stay within your permissions and company scope.
          </p>
          <button
            type="button"
            disabled={!instruction.trim()}
            onClick={start}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-base font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Wand2 size={14} /> Ask ORI to plan it
          </button>
        </>
      )}

      {/* Conversation transcript once a command has started. */}
      {phase.kind !== "idle" && (
        <div className="space-y-2.5 text-sm">
          {phase.kind === "thinking" && (
            <div className="flex items-center gap-2 text-fg-muted"><Loader2 size={14} className="animate-spin text-accent" /> Thinking it through…</div>
          )}

          {phase.kind === "ask" && (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap leading-relaxed text-fg">{phase.reply}</p>
              <div className="flex items-center gap-2 rounded-xl bg-bg-subtle px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendClarify(); } }}
                  placeholder="Your answer…"
                  autoFocus
                  className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-fg-subtle"
                />
                <button type="button" onClick={sendClarify} disabled={!reply.trim()} aria-label="Send" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg disabled:opacity-40"><ArrowRight size={14} /></button>
              </div>
            </div>
          )}

          {phase.kind === "confirm" && (
            <div className="space-y-2">
              <p className="whitespace-pre-wrap leading-relaxed text-fg">{phase.reply}</p>
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-bg-subtle/60">
                {phase.plan.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
                    <span className="text-base text-fg">{s.summary}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-0.5">
                <button onClick={() => runPlan(phase.plan)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90">
                  <Check size={12} /> Approve &amp; run
                </button>
                <button onClick={() => setPhase({ kind: "answer", reply: "Cancelled — nothing was changed." })} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:text-fg">
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          )}

          {phase.kind === "running" && (
            <div className="flex items-center gap-2 text-fg-muted"><Loader2 size={14} className="animate-spin text-accent" /> Running…</div>
          )}

          {phase.kind === "answer" && <p className="whitespace-pre-wrap leading-relaxed text-fg">{phase.reply}</p>}

          {phase.kind === "done" && (
            <div className="space-y-1.5">
              <div className="font-medium text-fg">{phase.reply}</div>
              {phase.results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-base">
                  {r.ok ? <Check size={14} className="mt-0.5 shrink-0 text-success" /> : <X size={14} className="mt-0.5 shrink-0 text-danger" />}
                  <span className={cn("flex-1", r.ok ? "text-fg" : "text-danger")}>{r.message}</span>
                </div>
              ))}
            </div>
          )}

          {phase.kind === "error" && (
            <div className="space-y-2 text-danger">
              <p>{phase.message}</p>
              <button onClick={() => plan()} className="inline-flex items-center gap-1.5 text-xs font-medium text-fg transition-colors hover:text-accent">
                <RotateCw size={12} /> Try again
              </button>
            </div>
          )}

          {/* New request after any terminal phase. */}
          {(phase.kind === "answer" || phase.kind === "done") && (
            <button onClick={restart} className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-accent">
              <Sparkles size={12} /> Ask ORI something else
            </button>
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * Presentational bits
 * ================================================================== */

/** A structured SmartAnswer card — title, count, up to N linked rows. */
function AnswerCard({ answer, onOpen }: { answer: SmartAnswer; onOpen: (href: string) => void }) {
  return (
    <div>
      <p className="text-base font-semibold text-fg">
        {answer.title}
        {answer.count > 0 && <span className="ml-1.5 text-fg-muted">· {answer.count}</span>}
      </p>
      {answer.note && <p className="mt-0.5 text-xs text-fg-subtle">{answer.note}</p>}
      {answer.rows.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {answer.rows.map((row, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onOpen(row.href)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-muted/60"
            >
              <span className="min-w-0 flex-1 truncate text-base text-fg">{row.label}</span>
              {row.sub && <span className="shrink-0 text-xs text-fg-subtle">{row.sub}</span>}
              {row.badge && <span className="shrink-0 rounded-md bg-bg-muted px-1.5 py-0.5 text-xs text-fg-muted">{row.badge}</span>}
              <ArrowUpRight size={13} className="shrink-0 text-fg-subtle" />
            </button>
          ))}
        </div>
      )}
      {answer.href && (
        <button
          type="button"
          onClick={() => onOpen(answer.href!)}
          className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          See all <ArrowUpRight size={13} />
        </button>
      )}
    </div>
  );
}

/** A section label + its rows. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      {children}
    </div>
  );
}

/** The trigger button that opens the ORI surface. */
export function PortalCommandTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("cos:portal-ori"))}
      aria-label="ORI"
      title="ORI — search & ask (Ctrl K)"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
    >
      <Sparkles size={16} />
    </button>
  );
}

function ModeChip({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Search; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
      )}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function RowShell({ onOpen, children }: { onOpen?: () => void; children: React.ReactNode }) {
  if (!onOpen) {
    return <div className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-bg-muted"
    >
      {children}
    </button>
  );
}

function TaskRow({ task, onOpen }: { task: CoreTask; onOpen?: () => void }) {
  return (
    <RowShell onOpen={onOpen}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <ClipboardList size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-xs text-fg-muted">{task.code}</span>
          <span className="min-w-0 truncate text-sm">{task.actionItem}</span>
        </span>
        <span className="block truncate text-xs text-fg-muted">
          {[task.companyName, task.status].filter(Boolean).join(" · ")}
        </span>
      </span>
      {onOpen && <ArrowUpRight size={15} className="shrink-0 self-center text-fg-subtle" />}
    </RowShell>
  );
}

function PersonRow({ person, onOpen }: { person: CorePerson; onOpen?: () => void }) {
  return (
    <RowShell onOpen={onOpen}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <User size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="min-w-0 truncate text-sm">{person.name}</span>
        <span className="block truncate text-xs text-fg-muted">
          {[person.role, person.company].filter(Boolean).join(" · ")}
        </span>
      </span>
      {onOpen && <ArrowUpRight size={15} className="shrink-0 self-center text-fg-subtle" />}
    </RowShell>
  );
}

function ResultRow({ result, onOpen }: { result: OriResult; onOpen?: () => void }) {
  const Icon = TYPE_ICON[result.type] ?? Sparkles;
  return (
    <RowShell onOpen={onOpen}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="min-w-0 truncate text-sm">{result.title}</span>
        {result.subtitle && <span className="block truncate text-xs text-fg-muted">{result.subtitle}</span>}
        {result.snippet && <HighlightSnippet text={result.snippet} />}
      </span>
      <WhyTag kind={undefined} />
      {onOpen && <ArrowUpRight size={15} className="shrink-0 self-center text-fg-subtle" />}
    </RowShell>
  );
}
