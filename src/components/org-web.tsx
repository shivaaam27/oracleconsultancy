"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, ShieldCheck } from "lucide-react";
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
};

type Sim = { id: number; x: number; y: number; vx: number; vy: number; pinned: boolean; r: number };
type Edge = { a: number; b: number; kind: "primary" | "secondary" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const W = 1000;
const H = 680;

/** Round to 2dp so server- and client-rendered SVG coords match (no hydration drift). */
const q = (v: number) => Math.round(v * 100) / 100;

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

  const accentOf = (companyId: number | null) =>
    companies.find((c) => c.id === companyId)?.accentColor || "hsl(var(--accent))";

  // Build node set + edges (primary solid, secondary dashed). Cross-company kept.
  const { nodes0, edges, reportsCount } = useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    const reports = new Map<number, number>();
    const edges: Edge[] = [];
    for (const p of people) {
      if (p.managerId != null && ids.has(p.managerId) && p.managerId !== p.id) {
        edges.push({ a: p.managerId, b: p.id, kind: "primary" });
        reports.set(p.managerId, (reports.get(p.managerId) ?? 0) + 1);
      }
      for (const m of p.secondary) if (ids.has(m) && m !== p.id) edges.push({ a: m, b: p.id, kind: "secondary" });
    }
    // Seed positions in loose per-company clusters around a circle.
    const compIndex = new Map<number | null, number>();
    const comps = [...new Set(people.map((p) => p.companyId))];
    comps.forEach((c, i) => compIndex.set(c, i));
    const nodes0: Sim[] = people.map((p, i) => {
      const ci = compIndex.get(p.companyId) ?? 0;
      const ang = (ci / Math.max(1, comps.length)) * Math.PI * 2;
      const cx = W / 2 + Math.cos(ang) * 220;
      const cy = H / 2 + Math.sin(ang) * 150;
      const jitter = 80;
      return {
        id: p.id,
        x: cx + (Math.sin(i * 12.9) * jitter),
        y: cy + (Math.cos(i * 7.7) * jitter),
        vx: 0, vy: 0, pinned: false,
        r: 16 + Math.min(10, (reports.get(p.id) ?? 0) * 2),
      };
    });
    return { nodes0, edges, reportsCount: reports };
  }, [people]);

  const simRef = useRef<Sim[]>(nodes0);
  useEffect(() => { simRef.current = nodes0.map((n) => ({ ...n })); alphaRef.current = 1; }, [nodes0]);
  const [, setFrame] = useState(0);
  const alphaRef = useRef(1);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // View transform + interaction.
  const [t, setT] = useState({ scale: 0.85, x: 0, y: 0 });
  const dragNode = useRef<number | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Force simulation loop (cooling). Cheap for ≤ a few hundred nodes.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const ns = simRef.current;
      const alpha = alphaRef.current;
      if (alpha > 0.02) {
        // repulsion
        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const a = ns[i], b = ns[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let d2 = dx * dx + dy * dy || 0.01;
            const f = (3500 * alpha) / d2;
            const d = Math.sqrt(d2);
            const ux = dx / d, uy = dy / d;
            a.vx += ux * f; a.vy += uy * f; b.vx -= ux * f; b.vy -= uy * f;
          }
        }
        // springs
        for (const e of edges) {
          const a = ns.find((n) => n.id === e.a), b = ns.find((n) => n.id === e.b);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const rest = e.kind === "primary" ? 120 : 150;
          const f = ((d - rest) / d) * 0.05 * alpha;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
        // centring gravity
        for (const n of ns) { n.vx += (W / 2 - n.x) * 0.002 * alpha; n.vy += (H / 2 - n.y) * 0.002 * alpha; }
        // integrate
        for (const n of ns) {
          if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
          n.vx *= 0.82; n.vy *= 0.82;
          n.x += n.vx; n.y += n.vy;
        }
        alphaRef.current = alpha * 0.985;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [edges]);

  const ns = simRef.current;
  const posById = new Map(ns.map((n) => [n.id, n]));

  const openPerson = (id: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", String(id)); params.delete("task");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Pointer handling: drag a node, or pan the canvas.
  const svgPoint = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width * W - t.x) / t.scale,
      y: ((e.clientY - rect.top) / rect.height * H - t.y) / t.scale,
    };
  };
  const onDown = (e: React.PointerEvent) => {
    const target = (e.target as Element).closest("[data-node]");
    if (target) {
      dragNode.current = Number(target.getAttribute("data-node"));
      const n = posById.get(dragNode.current!); if (n) n.pinned = true;
    } else {
      panRef.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragNode.current != null) {
      const p = svgPoint(e); const n = posById.get(dragNode.current);
      if (n) { n.x = p.x; n.y = p.y; n.vx = 0; n.vy = 0; }
      alphaRef.current = Math.max(alphaRef.current, 0.3);
      setFrame((f) => f + 1);
    } else if (panRef.current) {
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const sx = W / r.width, sy = H / r.height;
      setT((prev) => ({ ...prev, x: panRef.current!.tx + (e.clientX - panRef.current!.x) * sx, y: panRef.current!.ty + (e.clientY - panRef.current!.y) * sy }));
    }
  };
  const onUp = () => { dragNode.current = null; panRef.current = null; };

  const zoom = (d: number) => setT((p) => ({ ...p, scale: Math.min(2, Math.max(0.4, +(p.scale + d).toFixed(2))) }));
  const reset = () => { setT({ scale: 0.85, x: 0, y: 0 }); simRef.current = nodes0.map((n) => ({ ...n })); alphaRef.current = 1; };
  const fullscreen = () => {
    if (!document.fullscreenElement) wrapRef.current?.requestFullscreen?.(); else document.exitFullscreen?.();
  };

  const ctrlBtn = "h-8 w-8 inline-flex items-center justify-center rounded-lg bg-bg-subtle/80 ring-1 ring-border text-fg-muted hover:text-fg transition-colors";
  const hoveredPerson = hover != null ? peopleById.get(hover) : null;
  const hoveredPos = hover != null ? posById.get(hover) : null;
  const hx = hover != null ? extras[hover] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] text-fg-subtle">
          Everyone across {companies.length} companies · {edges.length} connection{edges.length === 1 ? "" : "s"}.
          <span className="ml-2">Drag nodes · scroll companies below.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => zoom(-0.15)} title="Zoom out" className={ctrlBtn}><ZoomOut size={14} /></button>
          <button type="button" onClick={reset} title="Reset" className={ctrlBtn}><RotateCcw size={13} /></button>
          <button type="button" onClick={() => zoom(0.15)} title="Zoom in" className={ctrlBtn}><ZoomIn size={14} /></button>
          <button type="button" onClick={fullscreen} title="Fullscreen" className={ctrlBtn}><Maximize2 size={14} /></button>
        </div>
      </div>

      <div ref={wrapRef} className="relative rounded-2xl bg-bg-subtle/40 ring-1 ring-border/60 overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none select-none"
          style={{ height: "72vh", cursor: dragNode.current != null ? "grabbing" : "grab" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        >
          <g transform={`translate(${t.x} ${t.y}) scale(${t.scale})`}>
            {/* edges */}
            {edges.map((e, i) => {
              const a = posById.get(e.a), b = posById.get(e.b);
              if (!a || !b) return null;
              return (
                <line key={i} x1={q(a.x)} y1={q(a.y)} x2={q(b.x)} y2={q(b.y)}
                  stroke="hsl(var(--border-strong))" strokeWidth={e.kind === "primary" ? 1.5 : 1}
                  strokeDasharray={e.kind === "secondary" ? "4 4" : undefined} opacity={0.7} />
              );
            })}
            {/* nodes */}
            {ns.map((n) => {
              const p = peopleById.get(n.id); if (!p) return null;
              const accent = accentOf(p.companyId);
              const isHover = hover === n.id;
              return (
                <g key={n.id} data-node={n.id} transform={`translate(${q(n.x)} ${q(n.y)})`}
                  className="cursor-pointer"
                  onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  onClick={() => { if (dragNode.current == null) openPerson(n.id); }}>
                  <circle r={n.r} fill="hsl(var(--bg-elev))" stroke={accent} strokeWidth={isHover ? 3 : 2} />
                  <text textAnchor="middle" dy="0.35em" fontSize="11" fontWeight={600} fill="hsl(var(--fg))">{initials(p.name)}</text>
                  <text textAnchor="middle" y={n.r + 13} fontSize="10" fill="hsl(var(--fg-muted))">{p.name.split(/\s+/)[0]}</text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* hover popover (HTML overlay, positioned in SVG space → % of viewBox) */}
        {hoveredPerson && hoveredPos && (
          <div
            className="pointer-events-none absolute z-20 w-56 rounded-xl glass glass-menu elevated p-2.5"
            style={{
              left: `${((hoveredPos.x * t.scale + t.x) / W) * 100}%`,
              top: `${((hoveredPos.y * t.scale + t.y) / H) * 100}%`,
              transform: "translate(-50%, calc(-100% - 14px))",
            }}
          >
            <div className="text-[13px] font-semibold text-fg leading-tight">{hoveredPerson.name}</div>
            <div className="text-[11px] text-fg-muted">{hoveredPerson.role || PERSON_TYPE_LABELS[hoveredPerson.personType as keyof typeof PERSON_TYPE_LABELS] || ""}{hoveredPerson.companyName ? ` · ${hoveredPerson.companyName}` : ""}</div>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              {(reportsCount.get(hoveredPerson.id) ?? 0) > 0 && <span className="rounded bg-accent-soft text-accent px-1.5 py-0.5 font-medium">{reportsCount.get(hoveredPerson.id)} report{reportsCount.get(hoveredPerson.id) === 1 ? "" : "s"}</span>}
              {hx?.open ? <span className="rounded bg-info-soft text-info px-1.5 py-0.5 font-medium">{hx.open} open</span> : null}
              {hx?.overdue ? <span className="rounded bg-danger-soft text-danger px-1.5 py-0.5 font-medium">{hx.overdue} overdue</span> : null}
              {hx?.compliancePct != null && <span className="inline-flex items-center gap-0.5 rounded bg-bg-muted text-fg-muted px-1.5 py-0.5 font-medium"><ShieldCheck size={9} />{hx.compliancePct}%</span>}
            </div>
            <div className="mt-1 text-[10px] text-fg-subtle italic">Click to open profile</div>
          </div>
        )}

        {/* legend */}
        <div className="absolute bottom-2 left-2 flex items-center gap-3 rounded-lg bg-bg-overlay/80 ring-1 ring-border/60 px-2.5 py-1 text-[10px] text-fg-muted backdrop-blur">
          <span className="inline-flex items-center gap-1"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="hsl(var(--border-strong))" strokeWidth="1.5" /></svg> reports to</span>
          <span className="inline-flex items-center gap-1"><svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="hsl(var(--border-strong))" strokeWidth="1" strokeDasharray="3 3" /></svg> also reports to</span>
        </div>
      </div>

      {/* company chips — quick jump into a single tree */}
      <div className="flex flex-wrap gap-1.5">
        {companies.map((c) => (
          <button key={c.id} type="button" onClick={() => onPickCompany?.(c.id)}
            className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle/70 ring-1 ring-border px-2.5 py-1 text-xs text-fg-muted hover:text-fg hover:ring-accent/40 transition-colors">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.accentColor || "hsl(var(--accent))" }} />
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
