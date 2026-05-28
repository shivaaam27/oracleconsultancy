"use client";

import { ChevronUp, ChevronDown, Plus, X } from "lucide-react";
import { NAV_ROUTES, ROUTE_BY_ID, type NavRoute } from "@/lib/nav";
import { usePins } from "@/lib/use-pins";

/**
 * Reorder / pin / unpin the nav-pill buttons. Writes to the same server-backed
 * pin store the pill reads, so changes here drive the bottom navigation.
 */
export function NavSettings() {
  const { pins, move, toggle, loaded } = usePins();

  const pinnedRoutes = pins.map((id) => ROUTE_BY_ID[id]).filter(Boolean) as NavRoute[];
  const unpinned = NAV_ROUTES.filter((r) => !pins.includes(r.id));

  if (!loaded) {
    return <div className="text-xs text-fg-muted">Loading navigation…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-fg-muted">
          Pinned buttons, in the order they appear in the bottom bar. Use the arrows to reorder.
        </p>
        {pinnedRoutes.length === 0 ? (
          <p className="text-sm text-fg-muted py-2">Nothing pinned. Add a button below.</p>
        ) : (
          <ul className="space-y-1.5">
            {pinnedRoutes.map((r, i) => {
              const Icon = r.icon;
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2"
                >
                  <span className="text-fg-subtle tabular text-xs w-4 text-center">{i + 1}</span>
                  <Icon size={15} className="text-accent shrink-0" />
                  <span className="text-sm flex-1 truncate">{r.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={`Move ${r.label} up`}
                      disabled={i === 0}
                      onClick={() => move(r.id, -1)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${r.label} down`}
                      disabled={i === pinnedRoutes.length - 1}
                      onClick={() => move(r.id, 1)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${r.label}`}
                      onClick={() => toggle(r.id)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-muted hover:text-danger hover:bg-danger-soft"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {unpinned.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-fg-muted">Available to pin</p>
          <div className="flex flex-wrap gap-2">
            {unpinned.map((r) => {
              const Icon = r.icon;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:text-fg hover:bg-bg-muted transition-colors"
                >
                  <Icon size={14} />
                  {r.label}
                  <Plus size={13} className="text-fg-subtle" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
