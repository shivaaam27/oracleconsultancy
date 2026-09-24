"use client";

/**
 * The Studio list's own cells (design/studio-mockup, Main board): a status that
 * is a dot and a word, faces in each person's tint, and the ☆.
 *
 * ⚠️ THEY WRITE THROUGH THE SAME PATHS AS THE OLD CELLS — `useInlineField`
 * (status, with its undo toast) and `toggleTaskStar`. Only the look is new.
 */
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
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
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = 8 + options.length * 32;
    const below = r.bottom + 6 + h < window.innerHeight - 72;
    setPos({ left: Math.max(8, Math.min(r.left - 6, window.innerWidth - 220)), top: below ? r.bottom + 6 : r.top - 6 - h });
  }, [open, options.length]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    const scroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, { capture: true });
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", key); window.removeEventListener("scroll", scroll, { capture: true }); };
  }, [open]);

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={field === "status" ? "Change the status" : "Change the priority"}
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
        {showDot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dots[value] ?? "#B9BBBF" }} />}
        <span className="truncate">{value}{suffix}</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={menu}
          role="menu"
          style={{ left: pos.left, top: pos.top }}
          className="studio st-pop fixed z-[140] w-[210px] rounded-xl border border-[var(--st-line)] bg-[var(--st-surface)] p-1 shadow-[0_16px_40px_rgba(17,18,20,0.16)]"
        >
          {options.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); if (s !== value) save(s); }}
              className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] hover:bg-[var(--st-page)]", s === value && "font-medium")}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dots[s] }} />
              <span className="flex-1">{s}</span>
              {s === value && <Check size={13} />}
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
        <span
          key={n + i}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[var(--st-surface)] text-[9px] font-semibold text-[#111214]"
          style={{ background: avatarTint(n), marginLeft: i ? -7 : 0 }}
        >
          {initials(n)}
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
