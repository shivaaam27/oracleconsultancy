"use client";

import {
  CheckCircle2,
  AlertOctagon,
  MessageSquarePlus,
  Plus,
  CircleDot,
  Flag,
  ArrowRight,
  HelpCircle,
  Layers,
  Send,
  BriefcaseBusiness,
} from "lucide-react";

// Mirrors the ParsedIntent union in /api/action. Kept loose (`any`) because the
// parser can return partial shapes; we only read fields when present.
type Intent = Record<string, unknown> & { type?: string };

function fmtDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const hasTime = /\d{2}:\d{2}/.test(v) && !v.endsWith("T00:00:00") && !/T00:00:00/.test(v);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

type Row = { label: string; value: string };

function describe(intent: Intent): {
  icon: React.ReactNode;
  title: string;
  rows: Row[];
} {
  const s = (k: string) => (typeof intent[k] === "string" ? (intent[k] as string) : "");
  const code = s("taskCode");

  switch (intent.type) {
    case "complete":
      return {
        icon: <CheckCircle2 size={15} className="text-success" />,
        title: "Mark task as complete",
        rows: [{ label: "Task", value: code }].filter((r) => r.value),
      };
    case "escalate":
      return {
        icon: <AlertOctagon size={15} className="text-danger" />,
        title: "Escalate task",
        rows: [{ label: "Task", value: code }].filter((r) => r.value),
      };
    case "update":
      return {
        icon: <MessageSquarePlus size={15} className="text-accent" />,
        title: "Add a progress update",
        rows: [
          { label: "Task", value: code },
          { label: "Update", value: s("body") },
          { label: "New status", value: s("newStatus") },
        ].filter((r) => r.value),
      };
    case "create":
      return {
        icon: <Plus size={15} className="text-accent" />,
        title: "Create a new task",
        rows: [
          { label: "Company", value: s("companyName") },
          { label: "Task", value: s("actionItem") },
          { label: "Priority", value: s("priority") },
          { label: "Owner", value: s("assignee") },
          { label: "Deadline", value: fmtDate(intent["deadline"]) || "" },
        ].filter((r) => r.value),
      };
    case "set_status":
      return {
        icon: <CircleDot size={15} className="text-accent" />,
        title: "Change status",
        rows: [
          { label: "Task", value: code },
          { label: "New status", value: s("status") },
        ].filter((r) => r.value),
      };
    case "set_priority":
      return {
        icon: <Flag size={15} className="text-accent" />,
        title: "Change priority",
        rows: [
          { label: "Task", value: code },
          { label: "New priority", value: s("priority") },
        ].filter((r) => r.value),
      };
    case "bulk": {
      const codes = Array.isArray(intent["taskCodes"]) ? (intent["taskCodes"] as string[]) : [];
      const op = s("op");
      const opLabel = op === "complete" ? "Complete" : op === "escalate" ? "Escalate"
        : op === "set_status" ? `Set status → ${s("status")}` : op === "set_priority" ? `Set priority → ${s("priority")}` : "Update";
      return {
        icon: <Layers size={15} className="text-accent" />,
        title: `${opLabel} · ${codes.length} task${codes.length === 1 ? "" : "s"}`,
        rows: [{ label: "Tasks", value: codes.join(", ") }].filter((r) => r.value),
      };
    }
    case "remind":
      return {
        icon: <Send size={15} className="text-accent" />,
        title: "Draft a reminder (not sent)",
        rows: [
          { label: "Person", value: s("personName") },
          { label: "About", value: s("about") },
        ].filter((r) => r.value),
      };
    case "draft_brief":
      return {
        icon: <BriefcaseBusiness size={15} className="text-accent" />,
        title: "Draft the Director Brief (not sent)",
        rows: [
          { label: "Scope", value: s("companyName") || "Whole portfolio" },
          { label: "Period", value: s("period") || "This month" },
        ],
      };
    case "navigate":
      return {
        icon: <ArrowRight size={15} className="text-accent" />,
        title: "Open a page",
        rows: [
          { label: "Go to", value: s("target") },
          { label: "Which", value: s("query") },
        ].filter((r) => r.value),
      };
    default:
      return {
        icon: <HelpCircle size={15} className="text-fg-muted" />,
        title: "Command",
        rows: Object.entries(intent)
          .filter(([k, v]) => k !== "type" && (typeof v === "string" || typeof v === "number"))
          .map(([k, v]) => ({ label: k, value: String(v) })),
      };
  }
}

/** Human-readable confirmation card for a parsed AI command (no raw JSON). */
export function IntentPreview({ intent }: { intent: Intent }) {
  const { icon, title, rows } = describe(intent);
  return (
    <div className="rounded-xl border border-border bg-bg-elev overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-subtle/60">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {rows.length > 0 && (
        <dl className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-3 px-3 py-2 text-sm">
              <dt className="w-24 shrink-0 text-fg-muted capitalize">{r.label}</dt>
              <dd className="flex-1 min-w-0 break-words font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
