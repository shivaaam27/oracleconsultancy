import { NextResponse, type NextRequest } from "next/server";
import { getPortalPerson } from "@/lib/portal-auth";
import { getBrief, parseBriefPeriod } from "@/lib/director-brief";
import { renderBriefPdf } from "@/lib/brief-pdf";
import { briefPdfFilename } from "@/lib/brief-pdf-shared";

// Director download of the group Director Brief PDF from the portal. Excluded
// from the admin edge gate (see src/proxy.ts), so it verifies the portal
// director session itself. Group-wide scope (no company filter); the detailed
// brief carries no salary/wage figures, so it is safe for directors.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getPortalPerson();
  if (!me || me.portalRole !== "director") {
    return new NextResponse("Not authorised", { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const b = await getBrief(new Date(), parseBriefPeriod(sp.get("period")), null);
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
