"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SCOPE_COOKIE } from "@/lib/scope";

/**
 * Set the global company scope. Pass `null` (or no arg) to clear scope back to "all".
 * Persisted as a 1-year cookie so it survives across sessions.
 */
export async function setCompanyScope(companyId: number | null) {
  const jar = await cookies();
  if (companyId == null) {
    jar.set(SCOPE_COOKIE, "all", { path: "/", maxAge: 60 * 60 * 24 * 365 });
  } else {
    jar.set(SCOPE_COOKIE, String(companyId), { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  // Pages most affected by scope — revalidate so cached lists reflect the new filter.
  for (const p of ["/", "/task", "/registry", "/escalations", "/digest", "/outbox", "/companies"]) {
    revalidatePath(p);
  }
}
