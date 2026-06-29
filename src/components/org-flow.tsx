"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// elk.bundled bundles its web worker inline — works in the browser with no extra config.
import ELK from "elkjs/lib/elk.bundled.js";
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Scaling, Loader2, ShieldCheck, Plane, Printer, Network } from "lucide-react";
import { PersonDrawerLink } from "@/components/person-drawer-link";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/names";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import type { OrgPersonExtras } from "@/lib/org-extras";
import { personTier, managerIdSet, TIER_LABELS, type FlowPerson, type Tier } from "@/lib/org-flow";

export type OrgFlowCompany = { id: number; name: string; accentColor: string | null };

const CARD_W = 226;
const CARD_H = 84;

const TYPE_TINT: Record<string, string> = {
  local_staff: "bg-accent-soft text-accent ring-accent/25",
  outsider: "bg-bg-muted text-fg-muted ring-border",
  expat: "bg-info-soft text-info ring-info/25",
  candidate: "bg-warn-soft text-warn ring-warn/25",
};

const initials = getInitials; // honorific-stripped

type LaidNode = { id: number; x: number; y: number };
type LaidEdge = { id: string; kind: "primary" | "secondary"; d: string; from: number; to: number };
type Layout = { nodes: Map<number, LaidNode>; edges: LaidEdge[]; w: number; h: number; tierBands: Array<{ tier: Tier; y: number }> };

const ELK_OPTS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.partitioning.activate": "true",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.spacing.nodeNode": "34",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
};

export function OrgFlow({
  people, extras = {}, headIds, companies = [],
}: {
  people: FlowPerson[];
  extras?: Record<number, OrgPersonExtras>;
  /** People who are head of a department — tagged with a "Head" pill. */
  headIds?: Set<number>;
  /** Companies present in the chart, for the colour legend ("company = colour"). */
  companies?: OrgFlowCompany[];
}) {
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const mgrs = useMemo(() => managerIdSet(people), [people]);
  const tierOf = useCallback((p: FlowPerson) => personTier(p, mgrs.has(p.id)), [mgrs]);

  // Build the ELK graph: nodes partitioned by role tier, edges boss → report.
  const { graph, kinds, endpoints } = useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    const edges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
    const kinds = new Map<string, "primary" | "secondary">();
    const endpoints = new Map<string, { from: number; to: number }>();
    for (const p of people) {
      if (p.managerId != null && ids.has(p.managerId) && p.managerId !== p.id) {
        const id = `e${p.managerId}-${p.id}`;
        edges.push({ id, sources: [String(p.managerId)], targets: [String(p.id)] });
        kinds.set(id, "primary"); endpoints.set(id, { from: p.managerId, to: p.id });
      }
      for (const m of p.secondary) {
        if (ids.has(m) && m !== p.id && m !== p.managerId) {
          const id = `s${m}-${p.id}`;
          edges.push({ id, sources: [String(m)], targets: [String(p.id)] });
          kinds.set(id, "secondary"); endpoints.set(id, { from: m, to: p.id });
        }
      }
    }
    const children = people.map((p) => ({
      id: String(p.id), width: CARD_W, height: CARD_H,
      layoutOptions: { "elk.partitioning.partition": String(tierOf(p)) },
    }));
    return { graph: { id: "root", layoutOptions: ELK_OPTS, children, edges }, kinds, endpoints };
  }, [people, tierOf]);

  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elk = new (ELK as any)();
    elk.layout(graph)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((res: any) => {
        if (cancelled) return;
        const nodes = new Map<number, LaidNode>();
        const tierMinY = new Map<Tier, number>();
        for (const c of res.children ?? []) {
          const id = Number(c.id); const x = c.x ?? 0, y = c.y ?? 0;
          nodes.set(id, { id, x, y });
          const p = peopleById.get(id);
          if (p) { const t = tierOf(p); tierMinY.set(t, Math.min(tierMinY.get(t) ?? Infinity, y)); }
        }
        const edges: LaidEdge[] = [];
        for (const e of res.edges ?? []) {
          const sec = e.sections?.[0]; if (!sec) continue;
          const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint];
          const d = pts.map((pt: { x: number; y: number }, i: number) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
          const ep = endpoints.get(e.id);
          edges.push({ id: e.id, kind: kinds.get(e.id) ?? "primary", d, from: ep?.from ?? -1, to: ep?.to ?? -1 });
        }
        const tierBands = [...tierMinY.entries()].sort((a, b) => a[1] - b[1]).map(([tier, y]) => ({ tier, y }));
        setLayout({ nodes, edges, w: res.width ?? 0, h: res.height ?? 0, tierBands });
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setLayout(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [graph, kinds, endpoints, peopleById, tierOf]);

  // Neighbours for hover focus (a person + everyone directly linked to them).
  const neighbours = useMemo(() => {
    const m = new Map<number, Set<number>>();
    const add = (a: number, b: number) => { (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b); };
    for (const e of layout?.edges ?? []) { add(e.from, e.to); add(e.to, e.from); }
    return m;
  }, [layout]);

  // Split the line counts: the page header counts chain-of-command (primary)
  // only, so the toolbar must label its two kinds separately (P1-ORG-02).
  const { primaryLines, secondaryLines } = useMemo(() => {
    let primaryLines = 0, secondaryLines = 0;
    for (const e of layout?.edges ?? []) (e.kind === "secondary" ? secondaryLines++ : primaryLines++);
    return { primaryLines, secondaryLines };
  }, [layout]);

  // Pan + zoom.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isFs, setIsFs] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const fit = useCallback(() => {
    const box = canvasRef.current; if (!box || !layout) return;
    const cw = box.clientWidth, ch = box.clientHeight;
    const s = Math.min(1.4, Math.max(0.15, +Math.min((cw - 48) / (layout.w + 80), (ch - 48) / (layout.h + 80), 1).toFixed(2)));
    setScale(s);
    setPan({ x: Math.max(24, (cw - layout.w * s) / 2), y: 24 });
  }, [layout]);
  useEffect(() => { const r = requestAnimationFrame(fit); return () => cancelAnimationFrame(r); }, [fit]);

  useEffect(() => {
    if (!isFs) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFs(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const r = requestAnimationFrame(() => requestAnimationFrame(fit));
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; cancelAnimationFrame(r); };
  }, [isFs, fit]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if ((e.target as HTMLElement).closest("a,button,.flow-card")) return;
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    canvasRef.current?.classList.add("dragging");
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) });
  };
  const endDrag = () => { drag.current = null; canvasRef.current?.classList.remove("dragging"); };
  const zoom = (d: number) => setScale((s) => Math.min(1.6, Math.max(0.2, +(s + d).toFixed(2))));

  // Print: scale the whole laid-out canvas to fit one A4 landscape page via the
  // shared --org-print-scale variable (the same approach the per-company tree
  // uses), then call the browser print dialog. The print CSS expands the canvas
  // to overflow:visible and applies the scale to .org-flow-stage.
  const print = () => {
    if (!layout) return;
    const treeW = layout.w + 80, treeH = layout.h + 80;
    const s = Math.min(1040 / treeW, 624 / treeH, 1); // landscape printable px (≈277×190mm) minus header
    document.documentElement.style.setProperty("--org-print-scale", s.toFixed(3));
    window.print();
    window.setTimeout(() => document.documentElement.style.removeProperty("--org-print-scale"), 800);
  };

  const ctrlBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle/80 ring-1 ring-border text-fg-muted hover:text-fg transition-colors";
  const focusOn = hovered != null;
  const isActive = (id: number) => !focusOn || id === hovered || (neighbours.get(hovered!)?.has(id) ?? false);

  // Only show companies that actually appear in the chart (locked design:
  // company = colour), so the legend doesn't list empty companies.
  const legendCompanies = useMemo(() => {
    const present = new Set<number>();
    for (const p of people) if (p.companyId != null) present.add(p.companyId);
    return companies.filter((c) => present.has(c.id));
  }, [companies, people]);

  return (
    <div className={cn("space-y-3 org-root", isFs && "fixed inset-0 z-[90] bg-bg p-4 sm:p-5")}>
      {/* Print-only masthead — identical typography to the per-company tree. */}
      <div className="org-print-title print-only mb-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5">Organogram</div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">Portfolio</h1>
        <p className="text-[11px] text-fg-muted mt-0.5">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {people.length} people · {primaryLines} reporting lines</p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap print-hidden">
        <div className="flex items-center gap-3 text-[11px] text-fg-subtle flex-wrap">
          <span>{people.length} people · {primaryLines} reporting line{primaryLines === 1 ? "" : "s"}{secondaryLines > 0 && <> · {secondaryLines} also-reports-to</>}</span>
          <span className="inline-flex items-center gap-1"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="hsl(var(--fg-muted))" strokeWidth="1.7" /></svg> primary</span>
          <span className="inline-flex items-center gap-1"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="hsl(var(--info))" strokeWidth="1.4" strokeDasharray="5 4" /></svg> also reports to</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => zoom(-0.1)} title="Zoom out" className={ctrlBtn}><ZoomOut size={14} /></button>
          <button type="button" onClick={() => { setScale(1); setPan({ x: 24, y: 24 }); }} title="Reset" className={cn(ctrlBtn, "w-auto px-2 text-[11px] tabular")}>{Math.round(scale * 100)}%</button>
          <button type="button" onClick={() => zoom(0.1)} title="Zoom in" className={ctrlBtn}><ZoomIn size={14} /></button>
          <button type="button" onClick={fit} title="Fit to screen" className={ctrlBtn}><Scaling size={14} /></button>
          <button type="button" onClick={() => setIsFs((v) => !v)} title={isFs ? "Exit fullscreen" : "Fullscreen"} className={cn(ctrlBtn, isFs && "bg-accent text-accent-fg ring-accent")}>{isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <button type="button" onClick={print} disabled={!layout} title="Print" className="h-8 inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle/80 ring-1 ring-border px-2.5 text-xs text-fg-muted hover:text-fg transition-colors disabled:opacity-40"><Printer size={13} /> Print</button>
        </div>
      </div>

      {/* Company colour legend — "company = colour" is the locked design. */}
      {legendCompanies.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-fg-subtle print-hidden">
          <span className="inline-flex items-center gap-1 text-fg-muted"><Network size={12} /> Companies</span>
          {legendCompanies.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.accentColor || "hsl(var(--accent))" }} aria-hidden />
              {c.name}
            </span>
          ))}
        </div>
      )}

      <div className="org-printable rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-fg-subtle text-sm gap-2"><Loader2 size={16} className="animate-spin" /> Laying out the chart…</div>
        )}
        {!loading && people.length === 0 && (
          <div className="flex items-center justify-center py-16 px-4">
            <p className="text-sm text-fg-subtle italic text-center">No active people to chart yet.</p>
          </div>
        )}
        {!loading && people.length > 0 && !layout && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center">
            <p className="text-sm text-fg-muted">Couldn&apos;t lay out the chart.</p>
            <button type="button" onClick={() => { setScale(1); setPan({ x: 24, y: 24 }); }} className="h-8 inline-flex items-center rounded-lg bg-bg-subtle/80 ring-1 ring-border px-3 text-xs text-fg-muted hover:text-fg transition-colors">Reset</button>
          </div>
        )}
        {(loading || layout) && (
          <div ref={canvasRef} className="org-canvas overflow-auto" style={{ height: isFs ? "calc(100dvh - 110px)" : "74vh" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
            <div className="org-flow-stage relative" style={{ width: (layout?.w ?? 0) + 48, height: (layout?.h ?? 0) + 48, transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: "0 0" }}>
              {layout && (
                <>
                  {/* tier band labels down the left edge */}
                  {layout.tierBands.map((b) => (
                    <div key={b.tier} className="absolute -left-1 hidden sm:block text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle/70 -translate-x-full pr-2 whitespace-nowrap" style={{ top: b.y + CARD_H / 2 - 6 }}>
                      {TIER_LABELS[b.tier]}
                    </div>
                  ))}
                  <svg className="absolute inset-0 pointer-events-none overflow-visible" width={layout.w} height={layout.h} aria-hidden>
                    {layout.edges.map((e) => {
                      const active = !focusOn || e.from === hovered || e.to === hovered;
                      return (
                        <path key={e.id} d={e.d} fill="none"
                          stroke={e.kind === "secondary" ? "hsl(var(--info))" : "hsl(var(--fg-muted))"}
                          strokeWidth={e.kind === "secondary" ? 1.4 : 1.8}
                          strokeDasharray={e.kind === "secondary" ? "5 4" : undefined}
                          strokeLinejoin="round" strokeLinecap="round"
                          opacity={focusOn ? (active ? 0.95 : 0.06) : e.kind === "secondary" ? 0.5 : 0.7} />
                      );
                    })}
                  </svg>
                  {[...layout.nodes.values()].map((n) => {
                    const p = peopleById.get(n.id); if (!p) return null;
                    return (
                      <div key={n.id} className="absolute flow-card" style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H, opacity: isActive(n.id) ? 1 : 0.25, transition: "opacity 120ms" }}
                        onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)}>
                        <FlowCard p={p} x={extras[n.id]} isHead={headIds?.has(n.id) ?? false} />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowCard({ p, x, isHead }: { p: FlowPerson; x?: OrgPersonExtras; isHead?: boolean }) {
  const accent = p.accentColor || "hsl(var(--accent))";
  return (
    <div className="relative h-full w-full flex items-center gap-2 rounded-xl glass elevated pl-1 pr-2 py-1.5 ring-1 ring-border/60 hover:ring-accent/40 hover:shadow-lg transition-all">
      {isHead && <span className="absolute -top-2 left-2 z-10 text-[9px] font-semibold uppercase tracking-wide bg-accent text-accent-fg rounded-full px-1.5 py-0.5 shadow-sm">Head</span>}
      <span className="self-stretch w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} aria-hidden />
      <span className={cn("h-9 w-9 rounded-full ring-1 flex items-center justify-center text-[12px] font-semibold shrink-0", TYPE_TINT[p.personType] ?? TYPE_TINT.outsider)}>{initials(p.name)}</span>
      <div className="min-w-0 flex-1">
        <PersonDrawerLink id={p.id} name={p.name} className="block text-[13px] font-semibold text-fg hover:text-accent truncate leading-tight" />
        <div className="text-[10.5px] text-fg-muted truncate leading-tight">{p.role || PERSON_TYPE_LABELS[p.personType as keyof typeof PERSON_TYPE_LABELS] || ""}</div>
        {p.companyName && <div className="text-[10px] font-medium truncate leading-tight" style={{ color: accent }}>{p.companyName}</div>}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {x?.overdue ? (
          <span title={`${x.overdue} overdue`} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger-soft text-danger text-[10px] font-bold tabular">{x.overdue}</span>
        ) : x?.open ? (
          <span title={`${x.open} open`} className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-info-soft text-info text-[10px] font-bold tabular">{x.open}</span>
        ) : null}
        <div className="flex items-center gap-1">
          {x?.onLeaveToday && <Plane size={11} className="text-warn" />}
          {x?.compliancePct != null && (
            <span title={`Compliance ${x.compliancePct}%`} className={cn("w-2 h-2 rounded-full", x.complianceStatus === "Risk" ? "bg-danger" : x.complianceStatus === "Watch" ? "bg-warn" : "bg-success")} />
          )}
        </div>
      </div>
    </div>
  );
}
