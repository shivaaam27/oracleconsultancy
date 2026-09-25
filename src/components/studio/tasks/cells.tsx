"use client";

/**
 * The Studio list's own cells (design/studio-mockup, Main board): a status that
 * is a dot and a word, faces in each person's tint, and the ☆.
 *
 * ⚠️ THEY WRITE THROUGH THE SAME PATHS AS THE OLD CELLS — `useInlineField`
 * (status, with its undo toast) and `toggleTaskStar`. Only the look is new.
 */
import { PersonFace } from "@/components/studio/face";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useInlineField } from "@/components/task-inline-edit";
import { toggleTaskStar } from "@/app/task/actions";
import { useToast } from "@/components/toast";
import { STATUS_DOT, avatarTint, initials } from "./task-words";
import { cn } from "@/lib/cn";

const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_DOT: Record<string, string> = { Critical: "#E0479E", High: "#F5A524", Medium: "#2490EF", Low: "#B9BBBF" };

/** Status as the mockup draws it — a dot and a word — opening the status menu. */
export function StudioStatusCell({ code, status, tone = "light", className }: { code: string; status: string; tone?: "light" | "dark"; className?: string }) {
  return <StudioFieldMenu code={code} field="status" value={status} options={STATUSES} dots={STATUS_DOT} tone={tone} className={className} />;
}

/** Priority, the same way ("Medium priority" on the record's band). */
export function StudioPriorityCell({ code, priority, tone = "light", suffix, className }: { code: string; priority: string; tone?: "light" | "dark"; suffix?: string; className?: string }) {
  return <StudioFieldMenu code={code} field="priority" value={priority} options={PRIORITIES} dots={PRIORITY_DOT} tone={tone} suffix={suffix} showDot={tone === "light"} className={className} />;
}

function StudioFieldMenu({
  code, field, value, options, dots, tone, suffix, showDot = true, className,
}: {
  code: string; field: "status" | "priority"; value: string; options: string[]; dots: Record<string, string>;
  tone: "light" | "dark"; suffix?: string; showDot?: boolean; className?: string;
}) {
  const { save, pending } = useInlineField(code, field, field === "status" ? "Status" : "Priority");
  return (
    <StudioChoiceMenu
      value={value}
      options={options.map((o) => ({ value: o, label: o, dot: dots[o] }))}
      onPick={(v) => { if (v !== value) save(v); }}
      tone={tone}
      suffix={suffix}
      showDot={showDot}
      pending={pending}
      title={field === "status" ? "Change the status" : "Change the priority"}
      className={className}
    />
  );
}

export type ChoiceOption = { value: string; label: string; dot?: string; muted?: boolean };

/**
 * The one Studio pick-list: a trigger (a dot and a word, or a dark band chip)
 * and a card of choices portalled to <body> and kept on screen. Every
 * in-place choice on a Studio page is this — status, priority, risk,
 * category, company — so they all look and behave the same.
 */
export function StudioChoiceMenu({
  value, options, onPick, tone = "light", suffix, showDot = true, pending, title, className, empty = "Not set", width = 220, prefix, icon,
}: {
  /** A quiet word before the value — the "+ New" card's chips ("Priority High"). */
  prefix?: string;
  icon?: ReactNode;
  value: string | null;
  options: ChoiceOption[];
  onPick: (value: string) => void;
  tone?: "light" | "dark";
  suffix?: string;
  showDot?: boolean;
  pending?: boolean;
  title?: string;
  className?: string;
  /** Shown when there is no value. */
  empty?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const want = 8 + options.length * 32;
    const roomBelow = window.innerHeight - 80 - r.bottom;
    const roomAbove = r.top - 16;
    const below = roomBelow >= Math.min(want, 240) || roomBelow >= roomAbove;
    const maxH = Math.max(120, Math.min(want, below ? roomBelow : roomAbove));
    setPos({
      left: Math.max(8, Math.min(r.left - 6, window.innerWidth - width - 8)),
      top: below ? r.bottom + 6 : r.top - 6 - maxH,
      maxH,
    });
  }, [open, options.length, width]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, { capture: true });
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key, true); window.removeEventListener("scroll", scroll, { capture: true }); };
  }, [open]);

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex max-w-full items-center gap-[7px] whitespace-nowrap transition-colors",
          tone === "light"
            ? "-mx-1.5 rounded-md px-1.5 py-0.5 text-[13px] hover:bg-[var(--st-page)]"
            : "h-7 rounded-lg bg-[#1F2023] px-2.5 text-xs text-[#F2F2F0] hover:bg-[#2A2C30]",
          pending && "opacity-60",
          className,
        )}
      >
        {icon && <span className="shrink-0 text-[var(--st-muted)]">{icon}</span>}
        {prefix && <span className="st-prefix shrink-0 text-[var(--st-sub)]">{prefix}</span>}
        {showDot && current?.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current.dot }} />}
        {current ? <span className={cn("truncate", prefix && "font-medium")}>{current.label}{suffix}</span> : <span className="st-prefix truncate text-[var(--st-muted)]">{empty}</span>}
      </button>
      {open && pos && createPortal(
        <div
          ref={menu}
          role="menu"
          data-st-menu
          style={{ left: pos.left, top: pos.top, width, maxHeight: pos.maxH }}
          className="studio st-pop fixed z-[140] overflow-y-auto rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] p-1 shadow-[0_16px_40px_rgba(17,18,20,0.16)]"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onPick(o.value); }}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] hover:bg-[var(--st-page)]",
                o.value === value && "font-medium",
                o.muted && "text-[var(--st-muted)]",
              )}
            >
              {o.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.dot }} />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value && <Check size={13} className="shrink-0" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** Up to three faces in each person's tint, overlapping like the mockup's. */
export function StudioFaces({ names, max = 3 }: { names: string[]; max?: number }) {
  if (names.length === 0) return <span className="text-xs text-[var(--st-muted)]">—</span>;
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <span className="flex" title={names.join(", ")}>
      {shown.map((n, i) => (
        <span key={n + i} className="flex rounded-full border-2 border-[var(--st-surface)]" style={{ marginLeft: i ? -7 : 0 }}>
          <PersonFace name={n} size={22} peek />
        </span>
      ))}
      {more > 0 && (
        <span className="-ml-[7px] flex h-[26px] min-w-[26px] items-center justify-center rounded-full border-2 border-[var(--st-surface)] bg-[var(--st-seg)] px-1 text-[9px] font-semibold text-[var(--st-sub)]">+{more}</span>
      )}
    </span>
  );
}

/** ☆ — star a task to the top of your list. Optimistic; the server confirms. */
export function StudioStar({ taskId, starred }: { taskId: number; starred: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [on, setOn] = useState(starred);
  const [, start] = useTransition();
  useEffect(() => setOn(starred), [starred]);
  return (
    <button
      type="button"
      aria-label={on ? "Unstar — stop keeping it at the top" : "Star — keep it at the top of the list"}
      title={on ? "Starred — kept at the top" : "Star it to keep it at the top"}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await toggleTaskStar(taskId);
          if (!res.ok) { setOn(!next); toast("Couldn't change the star.", { tone: "warn" }); return; }
          router.refresh();
        });
      }}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-[var(--st-page)]",
        on ? "text-[var(--st-ink)]" : "text-[#C4C5C9] hover:text-[var(--st-sub)]",
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
      </svg>
    </button>
  );
}
