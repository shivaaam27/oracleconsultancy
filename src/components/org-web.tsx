"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Search, X, ShieldCheck, UserRound, Building2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { PERSON_TYPE_LABELS } from "@/lib/person-types";
import type { OrgPersonExtras } from "@/lib/org-extras";

type WebCompany = { id: number; name: string; accentColor: string | null };

export type WebPerson = {
  id: number;
  name: string;
  role: string | null;
  personType: string;
  companyId: number | null;
  companyName: string | null;
  accentColor: string | null;
  managerId: number | null;
  secondary: number[];
  relatedPersonId: number | null;
  associations: Array<{ companyId: number; relationship: string | null }>;
};

type EdgeKind = "director" | "secondary" | "related" | "employment" | "associated";
type Node = { key: string; kind: "person" | "company"; id: number; x: number; y: number; vx: number; vy: number; pinned: boolean; r: number };
type Edge = { from: string; to: string; kind: EdgeKind; label?: string | null };

const W = 1100;
const H = 720;
const q = (v: number) => Math.round(v * 100) / 100;

const EXTERNAL_TYPES = new Set(["outsider", "candidate"]);

const LINK_META: Record<EdgeKind, { label: string; color: string; dash?: string; width: number }> = {
  director: { label: "Reports to", color: "hsl(var(--fg-muted))", width: 1.6 },
  secondary: { label: "Also reports to", color: "hsl(var(--info))", dash: "5 4", width: 1.3 },
  related: { label: "Non-company link", color: "hsl(var(--fg-subtle))", dash: "2 4", width: 1.2 },
  employment: { label: "Employed at", color: "hsl(var(--border-strong))", width: 1.4 },
  associated: { label: "Associated with", color: "hsl(var(--warn))", dash: "4 4", width: 1.2 },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Settle a force-directed layout ONCE (synchronous, capped iterations) and
 * return final positions. Deterministic (seeded), so server and client agree.
 * No per-frame React re-render — keeps mobile devices from killing the tab.
 */
function computeLayout(nodes0: Node[], edges: Edge[]): Map<string, { x: number; y: number }> {
  const ns = nodes0.map((n) => ({ key: n.key, kind: n.kind, x: n.x, y: n.y, vx: 0, vy: 0 }));
  const map = new Map(ns.map((n) => [n.key, n]));
  let a = 1;
  for (let it = 0; it < 280; it++) {
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const A = ns[i], B = ns[j];
      const dx = A.x - B.x, dy = A.y - B.y; const d2 = dx * dx + dy * dy || 0.01; const d = Math.sqrt(d2);
      const f = (8200 * a) / d2; const ux = dx / d, uy = dy / d;
      A.vx += ux * f; A.vy += uy * f; B.vx -= ux * f; B.vy -= uy * f;
    }
    for (const e of edges) {
      const A = map.get(e.from), B = map.get(e.to); if (!A || !B) continue;
      const dx = B.x - A.x, dy = B.y - A.y; const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const rest = e.kind === "employment" ? 130 : e.kind === "director" ? 165 : e.kind === "associated" ? 185 : 210;
      const k = e.kind === "employment" ? 0.085 : 0.045;
      const f = ((d - rest) / d) * k * a;
      A.vx += dx * f; A.vy += dy * f; B.vx -= dx * f; B.vy -= dy * f;
    }
    for (const n of ns) { n.vx += (W / 2 - n.x) * 0.0016 * a; n.vy += (H / 2 - n.y) * 0.0016 * a; }
    for (const n of ns) { const damp = n.kind === "company" ? 0.7 : 0.82; n.vx *= damp; n.vy *= damp; n.x += n.vx; n.y += n.vy; }
    a *= 0.985;
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const n of ns) out.set(n.key, { x: q(n.x), y: q(n.y) });
  return out;
}

export function OrgWeb({
  people, companies, extras, onPickCompany,
}: {
  people: WebPerson[];
  companies: WebCompany[];
  extras: Record<number, OrgPersonExtras>;
  onPickCompany?: (companyId: number) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const accentOf = (id: number | null) => (id != null ? companyById.get(id)?.accentColor : null) || "hsl(var(--accent))";

  // Build nodes (people + company hubs) and typed edges.
  const { nodes0, edges, reportsCount, headcount, neighbors } = useMemo(() => {
    const pIds = new Set(people.map((p) => p.id));
    const reports = new Map<number, number>();
    const headcount = new Map<number, number>();
    const usedCompanies = new Set<number>();
    const edges: Edge[] = [];

    for (const p of people) {
      if (p.companyId != null) { headcount.set(p.companyId, (headcount.get(p.companyId) ?? 0) + 1); usedCompanies.add(p.companyId); edges.push({ from: `p${p.id}`, to: `c${p.companyId}`, kind: "employment" }); }
      if (p.managerId != null && pIds.has(p.managerId) && p.managerId !== p.id) { edges.push({ from: `p${p.managerId}`, to: `p${p.id}`, kind: "director" }); reports.set(p.managerId, (reports.get(p.managerId) ?? 0) + 1); }
      for (const m of p.secondary) if (pIds.has(m) && m !== p.id) edges.push({ from: `p${m}`, to: `p${p.id}`, kind: "secondary" });
      if (p.relatedPersonId != null && pIds.has(p.relatedPersonId) && p.relatedPersonId !== p.id) edges.push({ from: `p${p.id}`, to: `p${p.relatedPersonId}`, kind: "related" });
      for (const a of p.associations) { usedCompanies.add(a.companyId); edges.push({ from: `p${p.id}`, to: `c${a.companyId}`, kind: "associated", label: a.relationship }); }
    }

    // Seed: company hubs on a ring, people near their primary company hub.
    const comps = companies.filter((c) => usedCompanies.has(c.id));
    const hubPos = new Map<number, { x: number; y: number }>();
    comps.forEach((c, i) => {
      const ang = (i / Math.max(1, comps.length)) * Math.PI * 2 - Math.PI / 2;
      hubPos.set(c.id, { x: W / 2 + Math.cos(ang) * 300, y: H / 2 + Math.sin(ang) * 220 });
    });

    const nodes0: Node[] = [];
    for (const c of comps) {
      const pos = hubPos.get(c.id)!;
      nodes0.push({ key: `c${c.id}`, kind: "company", id: c.id, x: pos.x, y: pos.y, vx: 0, vy: 0, pinned: false, r: 46 });
    }
    people.forEach((p, i) => {
      const hub = p.companyId != null ? hubPos.get(p.companyId) : undefined;
      const bx = hub?.x ?? W / 2, by = hub?.y ?? H / 2;
      nodes0.push({ key: `p${p.id}`, kind: "person", id: p.id, x: bx + Math.sin(i * 12.9) * 90, y: by + Math.cos(i * 7.7) * 90, vx: 0, vy: 0, pinned: false, r: 27 + Math.min(13, (reports.get(p.id) ?? 0) * 3) });
    });

    const neighbors = new Map<string, Set<string>>();
    for (const e of edges) {
      (neighbors.get(e.from) ?? neighbors.set(e.from, new Set()).get(e.from)!).add(e.to);
      (neighbors.get(e.to) ?? neighbors.set(e.to, new Set()).get(e.to)!).add(e.from);
    }
    return { nodes0, edges, reportsCount: reports, headcount, neighbors };
  }, [people, companies]);

  // Node metadata (kind/id/radius) keyed for rendering.
  const meta = useMemo(() => new Map(nodes0.map((n) => [n.key, n])), [nodes0]);

  // Compute a settled layout ONCE (no per-frame React re-render — mobile-safe).
  const layout = useMemo(() => computeLayout(nodes0, edges), [nodes0, edges]);
  const [pos, setPos] = useState<Map<string, { x: number; y: number }>>(layout);
  useEffect(() => { setPos(layout); }, [layout]);

  // Auto-fit: zoom/translate so the laid-out content fills the viewBox (the
  // viewBox then fills the SVG) — fixes "everything is tiny even at max zoom".
  const fitT = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes0) { const p = layout.get(n.key); if (!p) continue; const r = n.r + 46; minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r); minY = Math.min(minY, p.y - r); maxY = Math.max(maxY, p.y + r); }
    if (!isFinite(minX)) return { scale: 1, x: 0, y: 0 };
    const cw = maxX - minX, ch = maxY - minY;
    const scale = Math.min(W / cw, H / ch, 2.4);
    return { scale: +scale.toFixed(3), x: +((W - cw * scale) / 2 - minX * scale).toFixed(1), y: +((H - ch * scale) / 2 - minY * scale).toFixed(1) };
  }, [nodes0, layout]);

  const [t, setT] = useState(fitT);
  useEffect(() => { setT(fitT); }, [fitT]);

  // Soft company "territory" bubbles behind the clusters.
  const territories = useMemo(() => {
    const out: { id: number; name: string; accent: string; x: number; y: number; r: number }[] = [];
    for (const c of companies) {
      const hub = pos.get(`c${c.id}`); if (!hub) continue;
      let maxd = 96;
      for (const p of people) if (p.companyId === c.id) { const pp = pos.get(`p${p.id}`); if (pp) maxd = Math.max(maxd, Math.hypot(pp.x - hub.x, pp.y - hub.y) + 38); }
      out.push({ id: c.id, name: c.name, accent: c.accentColor || "hsl(var(--accent))", x: hub.x, y: hub.y, r: Math.min(maxd, 380) });
    }
    return out;
  }, [companies, people, pos]);
  const dragKey = useRef<string | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState<Record<EdgeKind, boolean>>({ director: true, secondary: true, related: true, employment: true, associated: true });

  const posByKey = pos;

  const openPerson = (id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(id)); params.delete("task");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // active set for focus + search dimming
  const qlc = query.trim().toLowerCase();
  const matchKeys = useMemo(() => {
    if (!qlc) return null;
    const s = new Set<string>();
    for (const p of people) if (p.name.toLowerCase().includes(qlc) || (p.role ?? "").toLowerCase().includes(qlc)) s.add(`p${p.id}`);
    for (const c of companies) if (c.name.toLowerCase().includes(qlc)) s.add(`c${c.id}`);
    return s;
  }, [qlc, people, companies]);

  const focusSet = useMemo(() => {
    if (!selected) return null;
    const s = new Set<string>([selected]);
    for (const k of neighbors.get(selected) ?? []) s.add(k);
    return s;
  }, [selected, neighbors]);

  const isActive = (key: string) => (!focusSet || focusSet.has(key)) && (!matchKeys || matchKeys.has(key));
  const anyDim = !!focusSet || !!matchKeys;

  // pointer interaction
  const svgPoint = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width * W - t.x) / t.scale, y: ((e.clientY - rect.top) / rect.height * H - t.y) / t.scale };
  };
  const movedRef = useRef(false);
  // Coalesce pointermove → at most one state update per animation frame.
  // Without this, dragging fires setPos ~60×/s, re-rendering every node and
  // edge each time, which freezes/crashes low-end phones.
  const rafRef = useRef<number | null>(null);
  const pendingDrag = useRef<{ key: string; x: number; y: number } | null>(null);
  const pendingPan = useRef<{ x: number; y: number } | null>(null);
  const flush = () => {
    rafRef.current = null;
    if (pendingDrag.current) {
      const d = pendingDrag.current; pendingDrag.current = null;
      setPos((prev) => { const m = new Map(prev); m.set(d.key, { x: d.x, y: d.y }); return m; });
    }
    if (pendingPan.current) {
      const pn = pendingPan.current; pendingPan.current = null;
      setT((prev) => ({ ...prev, x: pn.x, y: pn.y }));
    }
  };
  const schedule = () => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush); };
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const onDown = (e: React.PointerEvent) => {
    const target = (e.target as Element).closest("[data-key]");
    movedRef.current = false;
    if (target) dragKey.current = target.getAttribute("data-key");
    else panRef.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragKey.current) {
      const p = svgPoint(e);
      pendingDrag.current = { key: dragKey.current, x: q(p.x), y: q(p.y) };
      movedRef.current = true;
      schedule();
    } else if (panRef.current) {
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      pendingPan.current = { x: panRef.current.tx + (e.clientX - panRef.current.x) * (W / r.width), y: panRef.current.ty + (e.clientY - panRef.current.y) * (H / r.height) };
      movedRef.current = true;
      schedule();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    flush();
    const target = (e.target as Element).closest("[data-key]");
    if (target && !movedRef.current) setSelected((s) => (s === target.getAttribute("data-key") ? null : target.getAttribute("data-key")));
    else if (!target && !movedRef.current && panRef.current) setSelected(null);
    dragKey.current = null; panRef.current = null;
  };

  const zoom = (d: number) => setT((p) => ({ ...p, scale: Math.min(3.2, Math.max(0.3, +(p.scale + d).toFixed(2))) }));
  const reset = () => { setT(fitT); setSelected(null); setPos(new Map(layout)); };
  const fullscreen = () => {
    try { if (!document.fullscreenElement) wrapRef.current?.requestFullscreen?.(); else document.exitFullscreen?.(); } catch {}
  };

  const ctrlBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle/80 ring-1 ring-border text-fg-muted hover:text-fg transition-colors";

  const selNode = selected ? meta.get(selected) : null;
  const selPos = selected ? posByKey.get(selected) : null;
  const selPerson = selNode?.kind === "person" ? peopleById.get(selNode.id) : null;
  const selCompany = selNode?.kind === "company" ? companyById.get(selNode.id) : null;
  const selX = selNode ? extras[selNode.id] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[11px] text-fg-subtle">Tap a node to focus its links · drag to rearrange · tap empty space to clear.</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[9rem] sm:flex-none">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person…" className="h-8 w-full sm:w-40 rounded-full bg-bg-subtle/70 ring-1 ring-border pl-7 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-accent/40" />
            {query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" aria-label="Clear"><X size={12} /></button>}
          </div>
          <button type="button" onClick={() => zoom(-0.15)} title="Zoom out" className={ctrlBtn}><ZoomOut size={14} /></button>
          <button type="button" onClick={reset} title="Reset" className={ctrlBtn}><RotateCcw size={13} /></button>
          <button type="button" onClick={() => zoom(0.15)} title="Zoom in" className={ctrlBtn}><ZoomIn size={14} /></button>
          <button type="button" onClick={fullscreen} title="Fullscreen" className={ctrlBtn}><Maximize2 size={14} /></button>
        </div>
      </div>

      {/* legend / filter toggles */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(LINK_META) as EdgeKind[]).map((k) => {
          const m = LINK_META[k]; const on = visible[k];
          return (
            <button key={k} type="button" onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1 transition-all", on ? "bg-bg-elev/70 ring-border text-fg" : "bg-transparent ring-border/60 text-fg-subtle line-through opacity-60")}>
              <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke={m.color} strokeWidth={m.width} strokeDasharray={m.dash} /></svg>
              {m.label}
            </button>
          );
        })}
      </div>

      <div ref={wrapRef} className="org-web-wrap relative rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none" style={{ height: "72vh", cursor: dragKey.current ? "grabbing" : "grab" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } dragKey.current = null; panRef.current = null; }}>
          <g transform={`translate(${t.x} ${t.y}) scale(${t.scale})`}>
            {/* company territory bubbles (behind everything) */}
            {territories.map((c) => {
              const active = !anyDim || isActive(`c${c.id}`);
              return (
                <g key={`t${c.id}`} opacity={active ? 1 : 0.25}>
                  <circle cx={q(c.x)} cy={q(c.y)} r={q(c.r)} fill={c.accent} fillOpacity={0.06} stroke={c.accent} strokeOpacity={0.18} strokeWidth={1.5} />
                  <text x={q(c.x)} y={q(c.y - c.r + 18)} textAnchor="middle" fontSize="12" fontWeight={700} fill={c.accent} opacity={0.65}>{c.name}</text>
                </g>
              );
            })}
            {edges.map((e, i) => {
              if (!visible[e.kind]) return null;
              const A = posByKey.get(e.from), B = posByKey.get(e.to); if (!A || !B) return null;
              const m = LINK_META[e.kind];
              const active = isActive(e.from) && isActive(e.to);
              // Gentle curve for a more organic, modern feel.
              const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
              const nx = -(B.y - A.y), ny = B.x - A.x; const nl = Math.hypot(nx, ny) || 1;
              const bend = Math.min(36, Math.hypot(B.x - A.x, B.y - A.y) * 0.12);
              const cxp = mx + (nx / nl) * bend, cyp = my + (ny / nl) * bend;
              return <path key={i} d={`M ${q(A.x)} ${q(A.y)} Q ${q(cxp)} ${q(cyp)} ${q(B.x)} ${q(B.y)}`} fill="none" stroke={m.color} strokeWidth={m.width} strokeDasharray={m.dash} opacity={anyDim ? (active ? 0.9 : 0.05) : 0.55} />;
            })}
            {nodes0.map((n) => {
              const pp = posByKey.get(n.key); if (!pp) return null;
              const active = isActive(n.key);
              const op = anyDim ? (active ? 1 : 0.18) : 1;
              if (n.kind === "company") {
                const c = companyById.get(n.id); const accent = c?.accentColor || "hsl(var(--accent))";
                const code = (c?.name ?? "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3);
                return (
                  <g key={n.key} data-key={n.key} transform={`translate(${q(pp.x)} ${q(pp.y)})`} className="cursor-pointer" opacity={op}>
                    <circle r={n.r} fill={accent} stroke="hsl(var(--bg-elev))" strokeWidth={selected === n.key ? 5 : 3} />
                    <text textAnchor="middle" dy="0.35em" fontSize="17" fontWeight={800} fill="#fff" style={{ letterSpacing: "0.02em" }}>{code}</text>
                  </g>
                );
              }
              const p = peopleById.get(n.id); if (!p) return null;
              const external = EXTERNAL_TYPES.has(p.personType);
              const accent = accentOf(p.companyId);
              const fn = p.name.split(/\s+/)[0] || p.name;
              const label = fn.length > 9 ? fn.slice(0, 8) + "…" : fn;
              const fs = Math.max(10, Math.min(13.5, n.r * 0.52));
              return (
                <g key={n.key} data-key={n.key} transform={`translate(${q(pp.x)} ${q(pp.y)})`} className="cursor-pointer" opacity={op}>
                  <circle r={n.r} fill="hsl(var(--bg-elev))" stroke={accent} strokeWidth={selected === n.key ? 4 : 2.5} strokeDasharray={external ? "4 3" : undefined} />
                  <text textAnchor="middle" dy="0.35em" fontSize={fs} fontWeight={600} fill="hsl(var(--fg))">{label}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* selected info card */}
        {selPos && (selPerson || selCompany) && (
          <div className="org-pop absolute z-20 w-60 rounded-xl p-3" style={{ left: `${((selPos.x * t.scale + t.x) / W) * 100}%`, top: `${((selPos.y * t.scale + t.y) / H) * 100}%`, transform: "translate(-50%, calc(-100% - 16px))" }}>
            {selPerson ? (
              <>
                <div className="text-[13px] font-semibold text-fg leading-tight">{selPerson.name}</div>
                <div className="text-[11px] text-fg-muted">{selPerson.role || PERSON_TYPE_LABELS[selPerson.personType as keyof typeof PERSON_TYPE_LABELS] || ""}{selPerson.companyName ? ` · ${selPerson.companyName}` : ""}</div>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                  {(reportsCount.get(selPerson.id) ?? 0) > 0 && <span className="rounded bg-accent-soft text-accent px-1.5 py-0.5 font-medium">{reportsCount.get(selPerson.id)} report{reportsCount.get(selPerson.id) === 1 ? "" : "s"}</span>}
                  {selX?.open ? <span className="rounded bg-info-soft text-info px-1.5 py-0.5 font-medium">{selX.open} open</span> : null}
                  {selX?.overdue ? <span className="rounded bg-danger-soft text-danger px-1.5 py-0.5 font-medium">{selX.overdue} overdue</span> : null}
                  {selX?.compliancePct != null && <span className="inline-flex items-center gap-0.5 rounded bg-bg-muted text-fg-muted px-1.5 py-0.5 font-medium"><ShieldCheck size={9} />{selX.compliancePct}%</span>}
                </div>
                <button type="button" onClick={() => openPerson(selPerson.id)} className="mt-2 w-full h-7 inline-flex items-center justify-center gap-1 rounded-lg bg-accent text-accent-fg text-[11px] font-medium hover:bg-accent-hover transition-colors"><UserRound size={12} /> Open profile</button>
              </>
            ) : selCompany ? (
              <>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-fg leading-tight"><Building2 size={13} style={{ color: selCompany.accentColor || undefined }} /> {selCompany.name}</div>
                <div className="text-[11px] text-fg-muted mt-0.5">{headcount.get(selCompany.id) ?? 0} employed</div>
                {onPickCompany && <button type="button" onClick={() => onPickCompany(selCompany.id)} className="mt-2 w-full h-7 inline-flex items-center justify-center gap-1 rounded-lg bg-accent text-accent-fg text-[11px] font-medium hover:bg-accent-hover transition-colors">Open company tree <ArrowRight size={12} /></button>}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* company chips — quick jump into a single tree */}
      <div className="flex flex-wrap gap-1.5">
        {companies.map((c) => (
          <button key={c.id} type="button" onClick={() => onPickCompany?.(c.id)} className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/70 ring-1 ring-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg hover:ring-accent/40 transition-colors">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.accentColor || "hsl(var(--accent))" }} />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
