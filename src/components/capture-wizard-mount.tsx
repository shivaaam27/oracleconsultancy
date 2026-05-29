import { sb } from "@/db/supabase";
import { CaptureWizard } from "./capture-wizard";

/**
 * Server wrapper that loads the company list once and renders the global
 * Capture Wizard. Mounted in the app shell so the popup is available on every
 * page and can be opened via the ?capture=open[&text=…] deep-link (used by the
 * command palette today, and by email-in / mobile share later).
 */
export async function CaptureWizardMount() {
  const { data } = await sb.from("companies").select("id,name").order("code");
  const companies = (data ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  return <CaptureWizard companies={companies} />;
}
