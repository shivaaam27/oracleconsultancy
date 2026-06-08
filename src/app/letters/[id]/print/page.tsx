import { notFound } from "next/navigation";
import { getLetter } from "@/lib/letters";
import { PersonPackPrintButton } from "@/components/person-pack-print-button";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
}

export default async function LetterPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const letter = await getLetter(Number(id));
  if (!letter) notFound();
  const lh = letter.letterhead;
  const mode = lh?.mode ?? "typed";
  const topMm = lh?.contentTopMm ?? (mode === "typed" ? 0 : 45);
  const bottomMm = lh?.contentBottomMm ?? (mode === "typed" ? 0 : 30);

  return (
    <div className="bg-bg-muted min-h-screen">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { margin: 0 !important; background: #fff !important; }
          .print-hidden { display: none !important; }
          .letter-sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .letter-sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; color: #111; position: relative; }
        .lh-band { position: fixed; left: 0; right: 0; width: 210mm; margin: 0 auto; }
        .lh-band img { width: 210mm; display: block; }
        .letter-body { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.55; }
        .letter-body .meta { display: flex; justify-content: space-between; font-size: 10.5pt; }
        .letter-body .addressee { white-space: pre-wrap; margin-top: 14pt; }
        .letter-body .prose { white-space: pre-wrap; margin-top: 16pt; }
      `}</style>

      <div className="print-hidden sticky top-0 z-10 flex items-center justify-between gap-2 bg-bg-elev/90 backdrop-blur border-b border-border px-4 py-2">
        <a href={`/letters/${letter.id}`} className="text-sm text-fg-muted hover:text-accent">‹ Back to editor</a>
        <PersonPackPrintButton />
      </div>

      <div className="py-6 print:py-0">
        <div className="letter-sheet shadow-2xl print:shadow-none">
          {/* Designed letterhead */}
          {mode === "background" && lh?.backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lh.backgroundUrl} alt="" style={{ position: "fixed", inset: 0, width: "210mm", height: "297mm", objectFit: "cover" }} />
          )}
          {mode === "images" && lh?.headerUrl && (
            <div className="lh-band" style={{ top: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lh.headerUrl} alt="" />
            </div>
          )}
          {mode === "images" && lh?.footerUrl && (
            <div className="lh-band" style={{ bottom: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lh.footerUrl} alt="" />
            </div>
          )}

          <div className="letter-body" style={{ position: "relative", padding: `${Math.max(topMm, mode === "typed" ? 22 : topMm)}mm 18mm ${Math.max(bottomMm, mode === "typed" ? 22 : bottomMm)}mm 18mm` }}>
            {/* Typed/composed header */}
            {mode === "typed" && lh && (
              <div style={{ borderBottom: "1.5pt solid #111", paddingBottom: "10pt", marginBottom: "16pt", display: "flex", alignItems: "center", gap: "14pt" }}>
                {lh.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lh.logoUrl} alt="" style={{ height: "70px", objectFit: "contain" }} />
                )}
                <div>
                  <div style={{ fontSize: "15pt", fontWeight: 700 }}>{lh.legalName || lh.name}</div>
                  {lh.address && <div style={{ fontSize: "9.5pt" }}>{lh.address}</div>}
                  <div style={{ fontSize: "9.5pt" }}>
                    {[lh.phone, lh.email].filter(Boolean).join(" · ")}
                    {lh.registrationNo ? ` · Reg: ${lh.registrationNo}` : ""}{lh.tin ? ` · TIN: ${lh.tin}` : ""}
                  </div>
                </div>
              </div>
            )}

            <div className="meta">
              <span>{letter.ref ? `Ref: ${letter.ref}` : ""}</span>
              <span>{fmtDate(letter.letterDate)}</span>
            </div>

            {letter.addressee && <div className="addressee">{letter.addressee}</div>}

            <div className="prose">{letter.body}</div>

            {letter.status === "Draft" && (
              <div className="print-hidden" style={{ marginTop: "20pt", fontSize: "9pt", color: "#b45309" }}>
                DRAFT — not yet issued. Issue the letter to freeze the letterhead and stamp the reference.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
