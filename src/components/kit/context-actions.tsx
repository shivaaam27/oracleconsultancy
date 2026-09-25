"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* --------------------------------------------------------------------- */
/* Types                                                                  */
/* --------------------------------------------------------------------- */

export type ContextAction = {
  /** Stable id within its source — used for React keys. */
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Link target. Mutually exclusive with onClick. */
  href?: string;
  onClick?: () => void;
  tone?: "accent" | "default" | "danger";
  /** Exactly one action per page should be primary (the filled one). */
  primary?: boolean;
  /** Hide the text label on mobile (icon-only) to save width. */
  compact?: boolean;
};

/* --------------------------------------------------------------------- */
/* Provider — pages register their actions here; the bar consumes them.   */
/* --------------------------------------------------------------------- */

type Ctx = {
  register: (sourceId: string, actions: ContextAction[]) => void;
  unregister: (sourceId: string) => void;
  actions: ContextAction[];
};

const ActionsContext = createContext<Ctx | null>(null);

export function ContextActionsProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<Record<string, ContextAction[]>>({});

  const register = useCallback((sourceId: string, actions: ContextAction[]) => {
    setSources((s) => ({ ...s, [sourceId]: actions }));
  }, []);
  const unregister = useCallback((sourceId: string) => {
    setSources((s) => {
      if (!(sourceId in s)) return s;
      const next = { ...s };
      delete next[sourceId];
      return next;
    });
  }, []);

  const actions = Object.values(sources).flat();

  return (
    <ActionsContext.Provider value={{ register, unregister, actions }}>
      {children}
    </ActionsContext.Provider>
  );
}

/** Read the currently-registered actions. */
export function useRegisteredActions() {
  const ctx = useContext(ActionsContext);
  return { actions: ctx?.actions ?? [] };
}

/**
 * Register this page/component's contextual actions. Pass a stable `sourceId`
 * and re-run when `deps` change. Cleans itself up on unmount.
 */
export function useContextActions(sourceId: string, actions: ContextAction[], deps: React.DependencyList) {
  const ctx = useContext(ActionsContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx) return;
    ctx.register(sourceId, actions);
    return () => ctx.unregister(sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
