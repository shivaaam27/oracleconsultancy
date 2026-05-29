"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Eye, EyeOff, SlidersHorizontal, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDashboardLayout } from "@/lib/use-dashboard-layout";
import { WIDGET_META, type WidgetId } from "@/lib/dashboard";

export type WidgetNode = { id: WidgetId; node: React.ReactNode };

function Widget({
  id,
  children,
  editing,
  onHide,
}: {
  id: WidgetId;
  children: React.ReactNode;
  editing: boolean;
  onHide: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="relative"
    >
      {editing && (
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing touch-none text-fg-subtle hover:text-fg"
            aria-label="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
          <span className="text-xs font-medium text-fg-muted">{WIDGET_META[id].title}</span>
          <button
            type="button"
            onClick={onHide}
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-danger"
          >
            <EyeOff size={13} /> Hide
          </button>
        </div>
      )}
      <div className={cn(editing && "rounded-2xl ring-1 ring-dashed ring-border p-2 bg-bg-subtle/40")}>
        {children}
      </div>
    </Reorder.Item>
  );
}

export function DashboardGrid({ widgets }: { widgets: WidgetNode[] }) {
  const { order, hidden, loaded, setOrder, toggleHidden, reset } = useDashboardLayout();
  const [editing, setEditing] = useState(false);

  const nodeById = new Map(widgets.map((w) => [w.id, w.node]));
  // Avoid a layout flash before prefs load: render default order until loaded.
  const visible = order.filter((id) => !hidden.includes(id) && nodeById.has(id));
  const hiddenList = hidden.filter((id) => nodeById.has(id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {editing && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg px-2 py-1 rounded-lg"
          >
            <RotateCcw size={13} /> Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
            editing
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-fg-muted hover:text-fg hover:border-accent"
          )}
        >
          {editing ? <><Check size={13} /> Done</> : <><SlidersHorizontal size={13} /> Customise</>}
        </button>
      </div>

      <Reorder.Group
        axis="y"
        values={visible}
        onReorder={(next) => {
          // Splice the reordered visible ids back into the full order (keeping hidden in place).
          const nextOrder: WidgetId[] = [];
          let vi = 0;
          for (const id of order) {
            if (hidden.includes(id) || !nodeById.has(id)) nextOrder.push(id);
            else nextOrder.push(next[vi++]);
          }
          setOrder(nextOrder);
        }}
        className="space-y-5"
        layoutScroll
      >
        {visible.map((id) => (
          <Widget key={id} id={id} editing={editing} onHide={() => toggleHidden(id)}>
            {nodeById.get(id)}
          </Widget>
        ))}
      </Reorder.Group>

      {editing && hiddenList.length > 0 && (
        <div className="rounded-2xl border border-dashed border-border p-3 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Hidden widgets</p>
          <div className="flex flex-wrap gap-2">
            {hiddenList.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleHidden(id)}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-fg-muted hover:text-accent hover:border-accent"
              >
                <Eye size={13} /> {WIDGET_META[id].title}
              </button>
            ))}
          </div>
        </div>
      )}

      {loaded && visible.length === 0 && (
        <p className="text-center text-sm text-fg-muted py-8">
          All widgets hidden. Tap Customise to bring some back.
        </p>
      )}
    </div>
  );
}
