import { NextResponse, type NextRequest } from "next/server";
import { getPortalPerson, companyScope } from "@/lib/portal-auth";
import { getBrief, parseBriefPeriod } from "@/lib/director-brief";
import { renderBriefPdf } from "@/lib/brief-pdf";
import { briefPdfFilename } from "@/lib/brief-pdf-shared";

// Director download of the Director Brief PDF from the portal. Excluded from the
// admin edge gate (see src/proxy.ts), so it verifies the portal director session
// itself. The brief is SCOPED to the director's companies: a portfolio director
// gets the whole group (companyScope → null), a company-scoped director gets ONLY
// their assigned companies — never other companies' data. Carries no salary/wage
// figures. See src/lib/portal-auth.ts companyScope.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getPortalPerson();
  if (!me || me.portalRole !== "director") {
    return new NextResponse("Not authorised", { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  // null = all companies (portfolio director); array = that director's companies only.
  const scope = await companyScope(me);
  const b = await getBrief(new Date(), parseBriefPeriod(sp.get("period")), scope);
  const buf = await renderBriefPdf(b);
  // `?download=1` forces a real file download (Save dialog); without it the PDF
  // opens inline in the phone's PDF viewer (save + share from there).
  const disposition = sp.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${briefPdfFilename(b)}"`,
      "Cache-Control": "no-store",
    },
  });
}
