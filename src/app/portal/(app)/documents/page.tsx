import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { Hero } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { getPortalPerson, seesAllCompanies } from "@/lib/portal-auth";
import { portalCapabilities } from "@/lib/portal-capabilities";
import { listPortalDocuments } from "@/lib/portal-documents";
import { PortalDocumentsLibrary } from "@/components/portal-documents-library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents — Oracle Consultancy" };

export default async function PortalDocumentsPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Management only (managers/HR/directors). Staff never reach the company library.
  if (!portalCapabilities(me.portalRole).isManagement) redirect("/portal");

  const docs = await listPortalDocuments(me);
  const scopeNote = seesAllCompanies(me)
    ? "Every company's documents."
    : "Your companies' documents and their people's records.";

  return (
    <div className="flex flex-col gap-5">
      <Reveal delay={0}>
        <Hero title="Documents" subtitle={scopeNote}>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <FileText size={15} /> {docs.length} document{docs.length === 1 ? "" : "s"}
          </div>
        </Hero>
      </Reveal>
      <Reveal delay={0.05}>
        <PortalDocumentsLibrary docs={docs} />
      </Reveal>
    </div>
  );
}
