"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BACK_PARAM, safeReturn } from "@/lib/nav/return-to";

/**
 * Which page is under the "New task" form?
 *
 * The full form opens as a MODAL over the list (an intercepting route), so its
 * own address is `/task/new` — the filtered list you were looking at is not in
 * it anywhere. Saving then landed you on the new task with no return address,
 * and its "‹ Tasks" went to the bare, unfiltered list.
 *
 * So the app remembers the last few addresses it showed (in memory only — this
 * is navigation, not data), and the form submits the most recent one that is
 * not the form itself as `back`. `createTask` hands it on to the new task.
 */
const recent: string[] = [];

function isForm(path: string) {
  return path.split("?")[0] === "/task/new";
}

export function LocationTracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  useEffect(() => {
    const here = `${pathname}${qs ? `?${qs}` : ""}`;
    if (recent[recent.length - 1] === here) return;
    recent.push(here);
    if (recent.length > 8) recent.shift();
  }, [pathname, qs]);
  return null;
}

/** The page the form was opened over, if it was opened from inside the app. */
function pageBeneath(): string | null {
  for (let i = recent.length - 1; i >= 0; i--) {
    if (!isForm(recent[i])) return safeReturn(recent[i]);
  }
  return null;
}

/** Hidden `back` field for a create form. Empty (and absent) on a fresh visit. */
export function ReturnField() {
  const params = useSearchParams();
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(safeReturn(params.get(BACK_PARAM)) ?? pageBeneath());
  }, [params]);
  return value ? <input type="hidden" name={BACK_PARAM} value={value} /> : null;
}
