// Dashboard widget registry — the desktop Overview is a reorderable, hideable
// stack of these widgets. Order/visibility persist via /api/prefs/dashboard.

export type WidgetId =
  | "metrics"
  | "attention"
  | "cosbar"
  | "companies"
  | "status"
  | "priority";

export type WidgetMeta = { id: WidgetId; title: string };

// Default order shown on a fresh dashboard.
export const WIDGETS: WidgetMeta[] = [
  { id: "metrics", title: "At a glance" },
  { id: "attention", title: "Needs attention" },
  { id: "cosbar", title: "Ask / Capture" },
  { id: "companies", title: "Open by company" },
  { id: "status", title: "Status distribution" },
  { id: "priority", title: "Priority breakdown" },
];

export const WIDGET_META: Record<WidgetId, WidgetMeta> = Object.fromEntries(
  WIDGETS.map((w) => [w.id, w])
) as Record<WidgetId, WidgetMeta>;

export const DEFAULT_ORDER: WidgetId[] = WIDGETS.map((w) => w.id);
export const DEFAULT_HIDDEN: WidgetId[] = [];

export type DashboardLayout = { order: WidgetId[]; hidden: WidgetId[] };

const ALL = new Set<string>(DEFAULT_ORDER);

/** Sanitise a stored layout: drop unknown ids, append any new widgets. */
export function normaliseLayout(raw: unknown): DashboardLayout {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<DashboardLayout>;
  const order = Array.isArray(obj.order)
    ? (obj.order.filter((id) => ALL.has(id)) as WidgetId[])
    : [];
  // Append widgets introduced after the layout was saved.
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  const hidden = Array.isArray(obj.hidden)
    ? (obj.hidden.filter((id) => ALL.has(id)) as WidgetId[])
    : [];
  return { order, hidden };
}
