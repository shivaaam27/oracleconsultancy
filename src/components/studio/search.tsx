"use client";
/* Studio search — ONE ranked list, not a dashboard.
 *
 * The owner (24 Sept 2026): search "is getting complicated and a lot … strip it
 * down so search acts as search of the whole system but smarter without opening
 * so many things". So: no preview pane, no hero card, no match-kind badges, no
 * history switch, no Create group, no page directory. What is left:
 *
 *   - empty: your recent tasks and pages, and three questions ORI answers;
 *   - typing: the best eight things across Oracle in one list, ranked; a row of
 *     quiet kinds (All · Tasks 12 · People 7 …) to narrow it, which Tab steps
 *     through; and "Ask ORI" as the last row — or the FIRST when what you typed
 *     reads like a question or an instruction.
 *
 * It only renders. The data (the one /api/search call, recent pages, the ORI
 * hand-off) stays in `CommandPaletteProvider`, so the Desk palette and this one
 * can never disagree about what was found. */
import { Command } from "cmdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, Sparkles, Search, CornerDownLeft, Clock, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { SearchResult } from "@/lib/search/search";
import type { DirectAnswer } from "@/lib/ai/direct-answer";
import type { SmartAnswer } from "@/lib/ai/smart-answer";
import type { NavRoute } from "@/lib/nav/nav";
import { cn } from "@/lib/cn";

export type StudioSearchItem = { code: string; label: string; sub: string; href: string; status: string; flag: string };
type TypeMeta = { label: string; icon: LucideIcon };

type Row = {
  key: string;
  kind: string;        // "tasks" | a SearchResult type | "page" | "answer"
  icon: LucideIcon;
  title: string;
  sub: string;
  tag: string;         // right-hand quiet label
  href: string;
};

const QUESTION = /\?\s*$|^(who|what|when|where|why|how|which|is|are|do|does|did|can|should|show|list|tell)\b/i;
const INSTRUCTION = /^(remind|create|add|draft|send|move|mark|complete|close|assign|raise|remember|set|schedule|book)\b/i;

const SUGGESTIONS = ["What needs me today?", "Who is overloaded?", "What changed since yesterday?"];

/** The words typed, for bolding in a title. */
function Hit({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-transparent font-semibold text-[var(--sh-fg)]">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

export function StudioSearch({
  query, setQuery, searching, items, results, directAnswer, smartAnswer,
  typeOrder, typeMeta, recentRoutes, routes, onOpen, onAsk,
}: {
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  items: StudioSearchItem[];
  results: SearchResult[];
  directAnswer: DirectAnswer | null;
  smartAnswer: SmartAnswer | null;
  typeOrder: string[];
  typeMeta: Record<string, TypeMeta>;
  recentRoutes: NavRoute[];
  routes: NavRoute[];
  onOpen: (href: string) => void;
  onAsk: (text: string) => void;
}) {
  const trimmed = query.trim();
  const [kind, setKind] = useState("all");
  const [active, setActive] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setKind("all"); }, [trimmed]);

  const words = useMemo(() => trimmed.toLowerCase().split(/\s+/).filter((w) => w.length >= 2), [trimmed]);
  const asks = QUESTION.test(trimmed) || INSTRUCTION.test(trimmed);

  /* Everything that matched, as rows, grouped by kind. */
  const byKind = useMemo(() => {
    const m = new Map<string, Row[]>();
    const push = (k: string, r: Row) => { if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); };
    if (!trimmed) return m;
    for (const it of items) push("tasks", {
      key: `t:${it.code}`, kind: "tasks", icon: CheckSquare, title: it.label,
      sub: [it.code, it.sub].filter(Boolean).join(" · "), tag: it.status, href: it.href,
    });
    for (const r of [...results].sort((a, b) => b.score - a.score)) {
      const meta = typeMeta[r.type];
      if (!meta) continue;
      push(r.type, {
        key: `r:${r.type}:${r.id}`, kind: r.type, icon: meta.icon, title: r.title,
        sub: r.subtitle, tag: meta.label.replace(/s$/, ""), href: r.href,
      });
    }
    const pages = routes.filter((p) => words.length && words.every((w) => p.label.toLowerCase().includes(w)));
    for (const p of pages.slice(0, 3)) push("page", { key: `p:${p.id}`, kind: "page", icon: p.icon, title: p.label, sub: "Page", tag: "Page", href: p.href });
    return m;
  }, [trimmed, items, results, typeMeta, routes, words]);

  /* "All": the best eight, one list. A strongly-matched person or company leads
     (you typed their name), then pages you named, then tasks and the rest by
     score — no kind takes more than four, so one noisy kind cannot fill it. */
  const ranked = useMemo(() => {
    if (!trimmed) return [];
    if (kind !== "all") return byKind.get(kind) ?? [];
    const strong = results.filter((r) => (r.type === "person" || r.type === "company") && r.score >= 60).map((r) => `r:${r.type}:${r.id}`);
    const pool: { row: Row; w: number }[] = [];
    byKind.forEach((rows, k) => rows.forEach((row, i) => {
      const res = results.find((r) => `r:${r.type}:${r.id}` === row.key);
      const base = strong.includes(row.key) ? 1000 : k === "page" ? 500 : k === "tasks" ? 90 - i * 4 : (res?.score ?? 0);
      pool.push({ row, w: base - i * 0.01 });
    }));
    pool.sort((a, b) => b.w - a.w);
    const taken = new Map<string, number>();
    const out: Row[] = [];
    for (const { row } of pool) {
      const n = taken.get(row.kind) ?? 0;
      if (n >= 4) continue;
      taken.set(row.kind, n + 1);
      out.push(row);
      if (out.length >= 8) break;
    }
    return out;
  }, [trimmed, kind, byKind, results]);

  const kinds = useMemo(() => {
    const list: [string, string, number][] = [];
    const order = ["tasks", ...typeOrder, "page"];
    for (const k of order) {
      const n = byKind.get(k)?.length ?? 0;
      if (n) list.push([k, k === "tasks" ? "Tasks" : k === "page" ? "Pages" : typeMeta[k]?.label ?? k, n]);
    }
    return list;
  }, [byKind, typeOrder, typeMeta]);
  const total = kinds.reduce((a, [, , n]) => a + n, 0);

  // The first row is the one Enter opens; follow the list as it changes.
  const firstKey = trimmed ? (asks ? "ask" : ranked[0]?.key ?? "ask") : "";
  useEffect(() => { setActive(firstKey); }, [firstKey]);

  const askRow = trimmed ? (
    <Command.Item key="ask" value="ask" onSelect={() => onAsk(trimmed)} className="st-srow">
      <span className="st-sicon st-sicon-on"><Sparkles size={14} /></span>
      <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--sh-fg)]">Ask ORI <span className="text-[var(--sh-sub)]">“{trimmed}”</span></span>
      <span className="st-stag"><CornerDownLeft size={11} /></span>
    </Command.Item>
  ) : null;

  const answer = trimmed && kind === "all" && (directAnswer || smartAnswer) ? (
    directAnswer ? (
      <Command.Item value="answer" onSelect={() => onOpen(directAnswer.href)} className="st-srow st-sanswer">
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] text-[var(--sh-muted)]">{directAnswer.entity} · {directAnswer.label}</span>
          <span className="block truncate text-[15px] font-medium text-[var(--sh-fg)]">{directAnswer.value ?? "Not recorded"}</span>
        </span>
        <ArrowUpRight size={14} className="text-[var(--sh-muted)]" />
      </Command.Item>
    ) : smartAnswer ? (
      <Command.Item value="answer" onSelect={() => smartAnswer.href && onOpen(smartAnswer.href)} className="st-srow st-sanswer">
        <span className="text-[22px] font-medium leading-none tabular-nums text-[var(--sh-fg)]">{smartAnswer.count}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-[var(--sh-fg)]">{smartAnswer.title}</span>
          {smartAnswer.note && <span className="block truncate text-[11px] text-[var(--sh-muted)]">{smartAnswer.note}</span>}
        </span>
        {smartAnswer.href && <ArrowUpRight size={14} className="text-[var(--sh-muted)]" />}
      </Command.Item>
    ) : null
  ) : null;

  return (
    <Command shouldFilter={false} loop value={active} onValueChange={setActive} className="flex min-h-0 flex-col">
      <div className="relative mx-3 mt-3 flex h-[52px] items-center gap-3 rounded-2xl border border-[var(--sh-field-line)] bg-[var(--sh-field)] pl-4 pr-2">
        <Search size={17} className="shrink-0 text-[var(--sh-sub)]" />
        <Command.Input
          ref={inputRef}
          autoFocus
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => {
            if (e.key === "Tab" && kinds.length > 1) {
              e.preventDefault();
              const seq = ["all", ...kinds.map(([k]) => k)];
              const i = seq.indexOf(kind);
              setKind(seq[(i + (e.shiftKey ? seq.length - 1 : 1)) % seq.length]);
            }
          }}
          placeholder="Search Oracle, or ask ORI"
          style={{ background: "transparent", border: 0, boxShadow: "none", color: "var(--sh-fg)" }}
          className="bare-field h-full min-w-0 flex-1 text-[17px] tracking-[-0.01em] outline-none placeholder:text-[var(--sh-muted)]"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[var(--sh-muted)] hover:text-[var(--sh-fg)]">Clear</button>
        )}
        <kbd className="shrink-0 rounded-md border border-[var(--sh-chip-line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--sh-muted)]">Esc</kbd>
        {/* A hairline that runs while the server is looking — the list above it
            keeps the last results, so nothing jumps while you type. */}
        <span aria-hidden className={cn("st-sbar pointer-events-none absolute inset-x-4 -bottom-px h-px overflow-hidden transition-opacity duration-200", searching ? "opacity-100" : "opacity-0")} />
      </div>

      {trimmed && kinds.length > 1 && (
        <div className="mx-3 mt-2 flex gap-0.5 overflow-x-auto [scrollbar-width:none]">
          {[["all", "All", total] as [string, string, number], ...kinds].map(([k, l, n]) => (
            <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setKind(k)}
              className={cn("h-7 shrink-0 whitespace-nowrap rounded-lg px-2.5 text-xs transition-colors",
                kind === k ? "bg-[var(--sh-hover)] font-medium text-[var(--sh-fg)]" : "text-[var(--sh-muted)] hover:text-[var(--sh-fg)]")}>
              {l}{k !== "all" && <span className="ml-1 tabular-nums opacity-60">{n}</span>}
            </button>
          ))}
        </div>
      )}

      <Command.List className="st-slist max-h-[min(440px,calc(100dvh-240px))] min-h-0 overflow-y-auto px-2 py-2 slim-scroll">
        {!trimmed ? (
          <>
            {items.length > 0 && (
              <Command.Group heading="Recent tasks">
                {items.slice(0, 4).map((it) => (
                  <Command.Item key={it.code} value={`t:${it.code}`} onSelect={() => onOpen(it.href)} className="st-srow">
                    <span className="st-sicon"><CheckSquare size={14} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-[var(--sh-fg)]">{it.label}</span><span className="block truncate text-[11px] text-[var(--sh-muted)]">{it.code}{it.sub ? ` · ${it.sub}` : ""}</span></span>
                    <span className="st-stag">{it.status}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {recentRoutes.length > 0 && (
              <Command.Group heading="Recent pages">
                {recentRoutes.slice(0, 4).map((r) => {
                  const Icon = r.icon;
                  return (
                    <Command.Item key={r.id} value={`p:${r.id}`} onSelect={() => onOpen(r.href)} className="st-srow">
                      <span className="st-sicon"><Icon size={14} /></span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--sh-fg)]">{r.label}</span>
                      <span className="st-stag"><Clock size={11} /></span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
            <Command.Group heading="Ask ORI">
              {SUGGESTIONS.map((q) => (
                <Command.Item key={q} value={`s:${q}`} onSelect={() => onAsk(q)} className="st-srow">
                  <span className="st-sicon"><Sparkles size={14} /></span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--sh-fg)]">{q}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </>
        ) : (
          <>
            {asks && askRow}
            {answer}
            {ranked.map((row) => {
              const Icon = row.icon;
              return (
                <Command.Item key={row.key} value={row.key} onSelect={() => onOpen(row.href)} className="st-srow">
                  <span className="st-sicon"><Icon size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-[var(--sh-fg)]"><Hit text={row.title} words={words} /></span>
                    {row.sub && <span className="block truncate text-[11px] text-[var(--sh-muted)]">{row.sub}</span>}
                  </span>
                  <span className="st-stag">{row.tag}</span>
                </Command.Item>
              );
            })}
            {!ranked.length && !searching && (
              <div className="px-3 py-3 text-[13px] text-[var(--sh-muted)]">Nothing called that. ORI may still know —</div>
            )}
            {!asks && askRow}
          </>
        )}
      </Command.List>

      <div className="flex items-center gap-3 border-t border-[var(--sh-line)] px-4 py-2 text-[11px] text-[var(--sh-muted)]">
        <span>↑↓ move</span><span>↵ open</span>{trimmed && kinds.length > 1 && <span>Tab narrow</span>}
        <span className="ml-auto">{trimmed && total ? `${total} found` : "Search everything"}</span>
      </div>
    </Command>
  );
}
