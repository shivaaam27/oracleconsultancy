"use client";
/**
 * The folder (owner's component, 24 Sept 2026): a back panel, three ruled
 * papers and a frosted flap that swings open. The tile it sits in decides
 * `hovered` / `open`, so hovering anywhere on the tile — name included —
 * animates it, and the page can play "open" before it changes folder.
 *
 * Built on framer-motion (the prompt's `motion/react` is the same API) with the
 * prompt's springs. One change, measured against his reference picture: the
 * black flap is 0.82 opaque, not 0.25 — at 0.25 the white papers showed
 * through and the folder read as nearly white.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import type { FolderColor } from "@/lib/files-shared";

const THEMES = {
  black: { back: "#000", backShadow: "inset 0 0 6px 2px rgba(255,255,255,0.37)", flap: "#3A3A3A", flapOpacity: 0.82, flapStroke: "#979797", card: "#F1F1F1", cardStroke: "#E0E0E0", line: "#D4D4D4" },
  white: { back: "#fff", backShadow: "inset 0 0 6px 2px rgba(178,178,178,0.25), 0 1px 2px rgba(0,0,0,0.08)", flap: "#f5f5f5", flapOpacity: 0.85, flapStroke: "#d4d4d4", card: "#262626", cardStroke: "#404040", line: "#737373" },
  blue: { back: "#50B1FD", backShadow: "inset 0 0 6px 2px rgba(255,255,255,0.35)", flap: "#3a9ae8", flapOpacity: 0.45, flapStroke: "#7ec8ff", card: "#F1F1F1", cardStroke: "#E0E0E0", line: "#D4D4D4" },
} as const;

const W = 321;
const H = 270;
const FLAP = "M0 25C0 11.1929 11.1929 0 25 0H136.084C143.044 0 149.689 2.90139 154.42 8.00608L178.08 33.5343C182.811 38.639 189.456 41.5404 196.416 41.5404H296C309.807 41.5404 321 52.7333 321 66.5404V216C321 229.807 309.807 241 296 241H25C11.1929 241 0 229.807 0 216V25Z";
const SPRING = { type: "spring", stiffness: 120, damping: 13 } as const;

/** Papers: [rest, hover, open] positions — the prompt's numbers. */
const PAPERS = [
  { rest: { x: 40, y: -10, rotate: 10 }, hover: { x: 40, y: -30, rotate: 14 }, open: { x: 70, y: -160, rotate: 18 }, delay: [0, 0.12, 0.1] },
  { rest: { x: 3, y: -20, rotate: 2 }, hover: { x: 3, y: -35, rotate: -1 }, open: { x: 0, y: -180, rotate: -3 }, delay: [0, 0.06, 0.05] },
  { rest: { x: -40, y: -22, rotate: -5 }, hover: { x: -40, y: -44, rotate: -9 }, open: { x: -65, y: -170, rotate: -14 }, delay: [0, 0, 0] },
];

export type FolderBadge = { text: string; bg: string; fg: string };

export function FolderIcon({ color = "black", scale = 0.46, hovered = false, open = false, badges = [] }: {
  color?: FolderColor;
  /** 1 = the prompt's 321×270. The page uses ~0.46; a picker, ~0.14. */
  scale?: number;
  hovered?: boolean;
  open?: boolean;
  /** Small round marks on the flap — the company's prefix. */
  badges?: FolderBadge[];
}) {
  const t = THEMES[color] ?? THEMES.black;
  const still = useReducedMotion();
  const state = open ? "open" : hovered ? "hover" : "rest";
  const uid = useId().replace(/:/g, "");
  return (
    <div aria-hidden className="relative shrink-0 select-none" style={{ width: W * scale, height: H * scale }}>
      <div className="absolute left-1/2 top-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})`, perspective: 800 }}>
        <div className="absolute inset-0" style={{ borderRadius: 25, background: t.back, boxShadow: t.backShadow }} />
        <div className="absolute left-1/2 top-1/2">
          {PAPERS.map((p, i) => (
            <motion.div key={i} className="absolute" style={{ left: -82, top: -107 }}
              initial={false}
              animate={p[state]}
              transition={still ? { duration: 0 } : { ...SPRING, delay: p.delay[state === "rest" ? 0 : state === "hover" ? 1 : 2] }}>
              <Paper t={t} />
            </motion.div>
          ))}
        </div>
        <motion.div className="absolute left-1/2 top-1/2" style={{ width: W, height: 241, marginTop: 16, x: "-50%", y: "-50%", transformOrigin: "bottom center", transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateX: open ? -55 : hovered ? -45 : -15 }}
          transition={still ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 14 }}>
          <div className="absolute inset-0" style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", clipPath: `path('${FLAP}')`, WebkitClipPath: `path('${FLAP}')`, transform: "translateZ(0)", backfaceVisibility: "hidden" }} />
          <svg className="absolute inset-0" width={W} height={241} viewBox="0 0 321 241" fill="none">
            <g filter={`url(#fl-${uid})`}>
              <path d={FLAP} fill={t.flap} fillOpacity={t.flapOpacity} />
              <path d="M25 0.5H136.084C142.905 0.5 149.417 3.3431 154.054 8.3457L177.713 33.874C182.539 39.0808 189.317 42.04 196.416 42.04H296C309.531 42.04 320.5 53.0092 320.5 66.54V216C320.5 229.531 309.531 240.5 296 240.5H25C11.469 240.5 0.5 229.531 0.5 216V25C0.5 11.469 11.469 0.5 25 0.5Z" stroke={t.flapStroke} />
            </g>
            <defs>
              <filter id={`fl-${uid}`} x="-25.4" y="-25.4" width="371.8" height="291.8" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
                <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                <feGaussianBlur stdDeviation="2.65" />
                <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
                <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
                <feBlend mode="normal" in2="shape" />
              </filter>
            </defs>
          </svg>
          {badges.length > 0 && (
            <div className="absolute bottom-5 left-5 flex">
              {badges.map((b, i) => (
                <span key={i} className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white/90 text-[15px] font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.2)] [font-family:var(--font-geist-mono),monospace]"
                  style={{ background: b.bg, color: b.fg }}>{b.text}</span>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Paper({ t }: { t: (typeof THEMES)[keyof typeof THEMES] }) {
  const rows = [];
  for (let r = 0; r < 9; r++) {
    const y = 61 + r * 14.1;
    rows.push(<rect key={`a${r}`} x="14.8" y={y} width="64.5" height="5.9" rx="2.9" fill={t.line} />, <rect key={`b${r}`} x="84.4" y={y} width="64.5" height="5.9" rx="2.9" fill={t.line} />);
  }
  return (
    <svg width="164" height="214" viewBox="0 0 164 214" fill="none">
      <rect width="163.078" height="213.262" rx="20" fill={t.card} />
      <rect x="0.5" y="0.5" width="162.078" height="212.262" rx="19.5" stroke={t.cardStroke} />
      <rect x="14.1193" y="31.2091" width="134.84" height="11.8892" rx="5.94459" fill={t.line} />
      {rows}
    </svg>
  );
}
