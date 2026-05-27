import { cookies } from "next/headers";
import { getAllTasks, type TaskRow } from "./queries";

export const SCOPE_COOKIE = "cos.scope.company";

/**
 * Resolve the currently-scoped company id from the cookie.
 * Returns `null` when scope is "all companies".
 */
export async function getScopedCompanyId(): Promise<number | null> {
  const jar = await cookies();
  const raw = jar.get(SCOPE_COOKIE)?.value;
  if (!raw || raw === "all") return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * getAllTasks filtered by the active company scope (if any).
 * Pages that want unscoped data can still call getAllTasks directly.
 */
export async function getScopedTasks(): Promise<TaskRow[]> {
  const [rows, scopedId] = await Promise.all([getAllTasks(), getScopedCompanyId()]);
  if (scopedId == null) return rows;
  return rows.filter((r) => r.companyId === scopedId);
}

export type ScopeOption = {
  id: number;
  name: string;
  accent: string | null;
  open: number;
  overdue: number;
  riskScore: number;
};

/**
 * Build the list of companies with at-a-glance counts, for the switcher UI.
 * Reuses the cached getAllTasks() (React cache dedupes within a render).
 */
export async function getScopeOptions(): Promise<ScopeOption[]> {
  const rows = await getAllTasks();
  const map = new Map<number, ScopeOption & { _aging: number; _blocked: number; _total: number }>();
  for (const r of rows) {
    const cur = map.get(r.companyId) || {
      id: r.companyId,
      name: r.companyName,
      accent: r.companyAccent,
      open: 0,
      overdue: 0,
      riskScore: 0,
      _aging: 0,
      _blocked: 0,
      _total: 0,
    };
    cur._total += 1;
    if (r.status !== "Completed" && r.status !== "Closed") cur.open += 1;
    if (r.flag === "overdue" || r.flag === "escalate-now") cur.overdue += 1;
    if (r.flag === "aging") cur._aging += 1;
    if (r.status === "Blocked") cur._blocked += 1;
    map.set(r.companyId, cur);
  }
  const out: ScopeOption[] = [];
  for (const v of map.values()) {
    v.riskScore = v._total === 0 ? 0 : Math.round(((v.overdue * 3 + v._blocked * 2 + v._aging) / v._total) * 100);
    out.push({ id: v.id, name: v.name, accent: v.accent, open: v.open, overdue: v.overdue, riskScore: v.riskScore });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
