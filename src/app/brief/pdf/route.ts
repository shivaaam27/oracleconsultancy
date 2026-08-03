import { NextResponse, type NextRequest } from "next/server";
import { getBrief, parseBriefPeriod } from "@/lib/director-brief";
import { renderBriefPdf } from "@/lib/brief-pdf";
import { briefPdfFilename } from "@/lib/brief-pdf-shared";
import { parseBriefIdList, parseBriefPersonRole } from "@/lib/brief-links";

// Owner download of the Director Brief PDF. Reachable only with a valid admin
// cookie (the edge gate in src/proxy.ts covers /brief/*). Honours the same
// period + company filters as the on-screen /brief page.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // `co` is the brief's filter parameter; `company` is still accepted so links
  // shared before the rename keep producing the same PDF.
  const companyIds = parseBriefIdList(sp.get("co") ?? sp.get("company"));
  const personIds = parseBriefIdList(sp.get("who"));
  // The Lead/Working lens narrows the PDF's CONTENTS to match the screen, but is
  // deliberately absent from its title and filename (owner's call).
  const personRole = parseBriefPersonRole(sp.get("role"));
  const b = await getBrief(new Date(), parseBriefPeriod(sp.get("period")), companyIds, { personId: personIds, personRole });
  const buf = await renderBriefPdf(b);
  // `?download=1` forces a real file download (Save dialog) instead of opening
  // in the browser/phone PDF viewer. The Download button passes it; the
  // WhatsApp/Email share links omit it so they still open inline for preview.
  const disposition = sp.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${briefPdfFilename(b)}"`,
      "Cache-Control": "no-store",
    },
  });
}
