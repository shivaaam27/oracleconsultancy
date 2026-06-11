import { sb } from "@/db/supabase";
import { CaptureWizard } from "./capture-wizard";

/**
 * Server wrapper that loads the company list once and renders the global
 * Capture Wizard. Mounted in the app shell so the popup is available on every
 * page and can be opened via the ?capture=open[&text=…] deep-link (used by the
 * command palette today, and by email-in / mobile share later).
 */
export async function CaptureWizardMount() {
  const [{ data: companyData }, { data: peopleData }] = await Promise.all([
    sb.from("companies").select("id,name").order("code"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const companies = (companyData ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleData ?? []).map((p) => ({ id: p.id as number, name: p.name as string })).filter((p) => p.name);
  return <CaptureWizard companies={companies} people={people} />;
}
