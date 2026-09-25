"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

/**
 * Lazy-load the three global overlays. They only appear when a ?task= / ?person= /
 * ?company= URL param opens them, so deferring their (large) code via next/dynamic
 * keeps it out of every admin page's initial download — the page becomes
 * interactive sooner, and the drawer code loads the moment one is opened.
 */
const TaskDrawer = dynamic(() => import("../tasks/task-drawer").then((m) => m.TaskDrawer), { ssr: false });
const PersonDrawer = dynamic(() => import("../people/person-drawer").then((m) => m.PersonDrawer), { ssr: false });
const CompanyDrawer = dynamic(() => import("../companies/company-drawer").then((m) => m.CompanyDrawer), { ssr: false });

export function GlobalDrawers() {
  return (
    <Suspense>
      <TaskDrawer />
      <PersonDrawer />
      <CompanyDrawer />
    </Suspense>
  );
}
