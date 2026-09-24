"use client";
/* Small shared pieces of the Files page: the file icon, the expiry pill, who
 * added it, relative dates, the pop-up menu. */
import { useEffect, useRef, type ReactNode } from "react";
import { kindOf, KIND_BADGE, type FileRow } from "@/lib/files-shared";
import { cn } from "@/lib/cn";

export function FileIcon({ ext, size = 30 }: { ext: string; size?: number }) {
  const kind = kindOf(ext);
  const b = KIND_BADGE[kind];
  return (
    <span className="relative shrink-0" style={{ width: size, height: size * 1.2 }} aria-hidden>
      <svg viewBox="0 0 30 36" width={size} height={size * 1.2}>
        <path d="M4 1h15l8 8v24a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="var(--st-surface)" stroke="var(--st-line)" />
        <path d="M19 1v6a2 2 0 0 0 2 2h6" fill="none" stroke="var(--st-line)" />
      </svg>
      <span className="absolute -left-[3px] bottom-[5px] rounded px-1 font-semibold leading-[14px] text-white [font-family:var(--font-geist-mono),monospace]"
        style={{ background: b.color, fontSize: Math.max(7, size * 0.27) }}>{b.label(ext)}</span>
    </span>
  );
}

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ExpiryPill({ f }: { f: FileRow }) {
  if (!f.expiryDate) return <span className="text-xs text-[var(--st-muted)]">—</span>;
  const tone = f.status === "expired" ? ["var(--st-bad-wash)", "var(--st-late-text)", "var(--st-late)", "Expired"]
    : f.status === "soon" ? ["var(--st-warn-wash)", "var(--st-soon-text)", "var(--st-soon)", "Renew by"]
      : ["var(--st-ok-wash)", "var(--st-ok-text)", "var(--st-ok)", "To"];
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 text-[11px]" style={{ background: tone[0], color: tone[1] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone[2] }} />{tone[3]} {fmtDay(f.expiryDate)}
    </span>
  );
}

/** Who put it there, in words: "You", "Claude", or the member of staff. */
export function addedBy(createdBy: string): string {
  if (!createdBy || createdBy === "web-ui" || createdBy === "files-setup") return "You";
  if (createdBy.startsWith("portal:")) return createdBy.slice(7);
  if (createdBy.startsWith("mcp:")) return "Claude";
  if (createdBy === "ai-command" || createdBy.startsWith("ori")) return "ORI";
  return createdBy;
}

export function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export type MenuItem = { label: string; icon?: ReactNode; kbd?: string; bad?: boolean; onSelect: () => void } | "-";

/** A pop-up menu at a point on the screen; closes on a pick, Escape or a click
 *  anywhere else. Kept on screen near the edges. */
export function PopMenu({ at, items, onClose, children }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.left = `${Math.max(8, Math.min(at.x, innerWidth - r.width - 8))}px`;
      el.style.top = `${Math.max(8, Math.min(at.y, innerHeight - r.height - 76))}px`;
      el.style.visibility = "visible";
      el.querySelector<HTMLButtonElement>("button")?.focus();
    }
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, [at, onClose]);
  return (
    <div ref={ref} role="menu" style={{ visibility: "hidden", left: at.x, top: at.y }}
      className="st-pop fixed z-[90] min-w-[216px] rounded-[14px] border border-[var(--st-line)] bg-[var(--st-surface)] p-1.5 text-[13px] text-[var(--st-ink)] shadow-[0_16px_40px_rgba(17,18,20,0.16)]">
      {items.map((it, i) => it === "-" ? <div key={i} className="mx-1 my-1 h-px bg-[var(--st-line-soft)]" /> : (
        <button key={i} type="button" role="menuitem" onClick={() => { onClose(); it.onSelect(); }}
          className={cn("flex h-[34px] w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left outline-none hover:bg-[var(--st-page)] focus-visible:bg-[var(--st-page)]", it.bad && "text-[var(--st-late-text)]")}>
          <span className="flex w-4 justify-center text-[var(--st-sub)]">{it.icon}</span>{it.label}
          {it.kbd && <kbd className="ml-auto text-[11px] text-[var(--st-muted)] [font-family:var(--font-geist-mono),monospace]">{it.kbd}</kbd>}
        </button>
      ))}
      {children}
    </div>
  );
}
