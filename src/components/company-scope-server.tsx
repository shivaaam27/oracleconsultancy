import { getScopedCompanyId, getScopeOptions } from "@/lib/scope";
import { CompanyScope } from "./company-scope";

/**
 * Server-rendered wrapper for the scope switcher. Mounted in the app shell
 * (layout.tsx) so the current scope is always visible and one click away.
 */
export async function CompanyScopeServer() {
  const [options, scopedId] = await Promise.all([getScopeOptions(), getScopedCompanyId()]);
  const current = scopedId != null ? options.find((o) => o.id === scopedId) ?? null : null;
  return <CompanyScope options={options} current={current} />;
}
