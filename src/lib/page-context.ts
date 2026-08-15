/**
 * Derives a lightweight description of where the operator is — page AND
 * subsection (active tab, filters, open drawer) — so the COS assistant can
 * answer "what's on this page" / "escalate this" / "summarise this view" and
 * tailor its starter prompts. Resolved from pathname + search params only (no
 * data fetch).
 */
export type PageSection =
  | "overview" | "tasks" | "company" | "companies" | "task"
  | "people" | "outbox" | "settings" | "other";

export type PageContext = {
  label: string;
  /** A focused task (full task page, or an open task drawer ?task=). */
  taskCode?: string;
  companyId?: number;
  section: PageSection;
  /** Active sub-tab where relevant (e.g. company "timeline", workbook "notes"). */
  tab?: string;
  /** Human-readable summary of any active filters/scope on the current view. */
  filterSummary?: string;
};

type Params = { get(key: string): string | null } | null | undefined;

const FLAG_LABEL: Record<string, string> = {
  overdue: "overdue", "due-soon": "due soon", stalled: "stalled",
  escalated: "escalated", "no-deadline": "no deadline",
};

/** Build a short "Overdue · High · Oracle…" style summary from task filters. */
function taskFilterSummary(sp: NonNullable<Params>): string | undefined {
  const bits: string[] = [];
  const flag = sp.get("flag");
  if (flag) bits.push(FLAG_LABEL[flag] ?? flag);
  const priority = sp.get("priority");
  if (priority) bits.push(`${priority} priority`);
  const status = sp.get("status");
  if (status) bits.push(status);
  if (sp.get("noOwner") === "1") bits.push("no owner");
  const company = sp.get("company");
  if (company) bits.push(company);
  if (sp.get("q")) bits.push(`search "${sp.get("q")}"`);
  return bits.length ? bits.join(" · ") : undefined;
}

export function derivePageContext(pathname: string, params?: Params): PageContext {
  const p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const sp: NonNullable<Params> = params ?? new URLSearchParams();

  // An open task drawer (?task=CODE) takes focus on whatever page it's over.
  const drawerTask = sp.get("task");

  // /task/new must be tested FIRST — it also matches the record pattern below,
  // which used to label the create form "Task new".
  if (p === "/task/new") return { label: "New task form", section: "task" };
  const taskM = p.match(/^\/task\/([^/]+)$/);
  if (taskM) {
    const code = decodeURIComponent(taskM[1]);
    return { label: `Task ${code}`, taskCode: code, section: "task" };
  }

  if (p === "/") {
    const tab = sp.get("tab");
    if (tab === "tasks") {
      const summary = taskFilterSummary(sp);
      if (drawerTask) return { label: `Task ${drawerTask} (open)`, taskCode: drawerTask, section: "tasks", tab: "tasks", filterSummary: summary };
      const view = sp.get("view") || "table";
      return {
        label: summary ? `Task Management · ${summary}` : "Task Management",
        section: "tasks", tab: "tasks", filterSummary: summary || (view !== "table" ? `${view} view` : undefined),
      };
    }
    if (drawerTask) return { label: `Task ${drawerTask} (open)`, taskCode: drawerTask, section: "overview", tab: "overview" };
    return { label: "Command centre (Overview)", section: "overview", tab: "overview" };
  }

  if (p === "/companies") return { label: "Companies list", section: "companies" };
  const compM = p.match(/^\/companies\/(\d+)$/);
  if (compM) {
    const companyId = Number(compM[1]);
    const tab = sp.get("tab") || "overview";
    if (drawerTask) return { label: `Task ${drawerTask} (open)`, taskCode: drawerTask, companyId, section: "company", tab };
    const tabLabel = tab === "completed" ? " · Completed" : tab === "timeline" ? " · Timeline" : "";
    return { label: `Company${tabLabel}`, companyId, section: "company", tab };
  }

  if (p === "/people") return { label: "People directory", section: "people" };
  if (p === "/outbox") return { label: "Outbox (reminder drafts)", section: "outbox" };
  if (p === "/settings") return { label: "Settings", section: "settings" };
  if (p === "/registry") return { label: "Tasks registry table", section: "tasks", tab: "tasks" };

  return { label: `Page ${p}`, section: "other" };
}
