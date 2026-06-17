import { NextResponse, type NextRequest } from "next/server";
import { getBrief, parseBriefPeriod } from "@/lib/director-brief";
import { renderBriefPdf } from "@/lib/brief-pdf";
import { briefPdfFilename } from "@/lib/brief-pdf-shared";

// Owner download of the Director Brief PDF. Reachable only with a valid admin
// cookie (the edge gate in src/proxy.ts covers /brief/*). Honours the same
// period + company filters as the on-screen /brief page.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const companyId = /^\d+$/.test(sp.get("company") ?? "") ? parseInt(sp.get("company")!, 10) : null;
  const b = await getBrief(new Date(), parseBriefPeriod(sp.get("period")), companyId);
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
