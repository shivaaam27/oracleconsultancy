"use client";

/**
 * Where the shared Studio screens point (26 Sept 2026, owner: "the system is a
 * unification"). People, a person, Companies and a company are ONE set of
 * screens for the owner, directors, managers — and staff. Staff reach them
 * under /portal/* (they are not a Viewer — lib/auth/viewer.ts), so every link inside
 * those screens asks here instead of writing "/people/5" itself.
 *
 * `staff` also turns on the staff limits inside the screens (owner's choice,
 * "own work only"): no workload, no files, no HR details, no one else's tasks,
 * never an edit. The server sends none of that data to a staff page either —
 * the screen hiding it is the second lock, not the first.
 */
import { createContext, useContext, type ReactNode } from "react";
import { taskHref } from "@/lib/tasks/task-href";
import { portalTaskHref } from "@/lib/portal/portal-task-href";

export type StudioPaths = {
  staff: boolean;
  person: (id: number) => string;
  people: (query?: string) => string;
  company: (id: number, tab?: string) => string;
  companies: () => string;
  task: (code: string) => string;
};

const withQuery = (base: string, q?: string) => (q ? `${base}?${q.replace(/^\?/, "")}` : base);

const OWNER: StudioPaths = {
  staff: false,
  person: (id) => `/people/${id}`,
  people: (q) => withQuery("/people", q),
  company: (id, tab) => (tab && tab !== "overview" ? `/companies/${id}?tab=${tab}` : `/companies/${id}`),
  companies: () => "/companies",
  task: (code) => taskHref(code),
};

const STAFF: StudioPaths = {
  staff: true,
  person: (id) => `/portal/people/${id}`,
  people: (q) => withQuery("/portal/people", q),
  company: (id, tab) => (tab && tab !== "overview" ? `/portal/companies/${id}?tab=${tab}` : `/portal/companies/${id}`),
  companies: () => "/portal/companies",
  task: (code) => portalTaskHref(code),
};

const Ctx = createContext<StudioPaths>(OWNER);

export function StudioPathsProvider({ staff, children }: { staff: boolean; children: ReactNode }) {
  return <Ctx.Provider value={staff ? STAFF : OWNER}>{children}</Ctx.Provider>;
}

export function useStudioPaths(): StudioPaths {
  return useContext(Ctx);
}
