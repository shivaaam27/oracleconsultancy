"use client";

import { createContext, useContext } from "react";

/**
 * Carries server-resolved nav-visibility flags to the client nav surfaces (the
 * launcher pill, ⌘K page-jump and Settings pins) so a paused area can be hidden
 * everywhere from ONE flag. Today the only flag is the Tax & Legal master pause
 * (settings.commandCentrePaused) — when on, /hrms/command-centre is dropped from
 * every "go to" surface. Provided once in the root layout.
 */
export type NavVisibility = {
  /** Tax & Legal area paused → hide /hrms/command-centre from all nav. */
  commandCentrePaused: boolean;
};

const NavVisibilityContext = createContext<NavVisibility>({ commandCentrePaused: false });

export function NavVisibilityProvider({
  value,
  children,
}: {
  value: NavVisibility;
  children: React.ReactNode;
}) {
  return <NavVisibilityContext.Provider value={value}>{children}</NavVisibilityContext.Provider>;
}

export function useNavVisibility(): NavVisibility {
  return useContext(NavVisibilityContext);
}

/** Hrefs that should be hidden from every nav surface given the current flags. */
export function hiddenNavHrefs(v: NavVisibility): Set<string> {
  const hidden = new Set<string>();
  if (v.commandCentrePaused) hidden.add("/hrms/command-centre");
  return hidden;
}

/** True when a nav href should be hidden under the current visibility flags. */
export function isHiddenNavHref(href: string, v: NavVisibility): boolean {
  return hiddenNavHrefs(v).has(href.split("?")[0]);
}
