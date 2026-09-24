"use client";

/**
 * Which task the update card is showing. Shared by the rows (a click picks) and
 * the card (× or Esc lets go). Lives in memory only: the address still belongs to
 * the list's filters, and the record keeps its own URL (/task/CODE) for "expand".
 *
 * ⚠️ `useStudioPick()` RETURNS NULL OUTSIDE THE PROVIDER — that is how the shared
 * TableView tells "Studio, pick the row" from "the old page, open the row". The
 * old page never renders the provider, so it behaves exactly as it always has.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Pick = { code: string | null; setCode: (code: string | null) => void };
const Ctx = createContext<Pick | null>(null);

export function StudioPickProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<string | null>(null);
  // Esc lets go of the picked task — unless something else (a menu, a dialog,
  // a field) is the thing Esc is for right now.
  useEffect(() => {
    if (!code) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      setCode(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code]);
  return <Ctx.Provider value={{ code, setCode }}>{children}</Ctx.Provider>;
}

export function useStudioPick(): Pick | null {
  return useContext(Ctx);
}
