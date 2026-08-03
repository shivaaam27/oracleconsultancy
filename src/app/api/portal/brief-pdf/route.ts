import { NextResponse, type NextRequest } from "next/server";
import { getPortalPerson } from "@/lib/portal-auth";
import { getBrief, parseBriefPeriod } from "@/lib/director-brief";
import { renderBriefPdf } from "@/lib/brief-pdf";
import { briefPdfFilename } from "@/lib/brief-pdf-shared";
import { resolvePortalBriefFilters } from "@/lib/portal-brief-scope";

// Director download of the Director Brief PDF from the portal. Excluded from the
// admin edge gate (see src/proxy.ts), so it verifies the portal session itself.
//
// Access is the owner-configurable `directorBrief` capability, NOT a hard-coded
// role (see the forward rule in CLAUDE.md); its default mirrors the old
// directors-only behaviour exactly.
//
// EVERY filter is re-resolved server-side against this person's own scope in
// resolvePortalBriefFilters — a hand-edited link cannot widen it. A company-
// scoped director gets ONLY their companies; anything outside is dropped and
// the report falls back to their full scope. Carries no salary/wage figures.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getPortalPerson();
  if (!me || !me.caps.directorBrief) {
    return new NextResponse("Not authorised", { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const { companyId, personId, personRole } = await resolvePortalBriefFilters(me, sp);
  const b = await getBrief(new Date(), parseBriefPeriod(sp.get("period")), companyId, { personId, personRole });
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
