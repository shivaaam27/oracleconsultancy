import { notFound } from "next/navigation";
import { getAsset } from "@/lib/assets";
import { sb } from "@/db/supabase";
import { ASSET_STATUS_LABELS } from "@/lib/assets-shared";
import { PersonPackPrintButton } from "@/components/person-pack-print-button";

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

export default async function AssetReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(Number(id));
  if (!asset) notFound();

  // Company branding (signatory + legal name) for the footer, if available.
  let company: { legal_name?: string | null; name?: string | null; signatory_name?: string | null; signatory_title?: string | null } | null = null;
  if (asset.companyId) {
    const { data } = await sb.from("companies")
      .select("name,legal_name,signatory_name,signatory_title").eq("id", asset.companyId).maybeSingle();
    company = data ?? null;
  }
  const holder = asset.assignedToName ?? (asset.assignedToCompanyName ? `${asset.assignedToCompanyName} (shared, custodian ${asset.custodianName ?? "—"})` : null);
  const isReturn = !holder;
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const orgName = company?.legal_name || company?.name || "Company";

  const rows: Array<[string, string]> = [
    ["Asset", asset.name],
    ["Tag", asset.tag ?? "—"],
    ["Category", asset.category ?? "—"],
    ["Brand / Model", [asset.brand, asset.model].filter(Boolean).join(" ") || "—"],
    ["Serial number", asset.serialNo ?? "—"],
    ["Status", ASSET_STATUS_LABELS[asset.status]],
    ["Location / site", asset.location ?? "—"],
    ["Handover date", fmt(asset.assignedAt)],
  ];

  return (
    <div className="bg-bg-muted min-h-screen">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { margin: 0 !important; background: #fff !important; }
          .print-hidden { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; }
        }
        .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; color: #111; padding: 24mm 22mm; font-family: var(--font-sans); font-size: 11pt; line-height: 1.5; }
        .sheet h1 { font-size: 17pt; margin: 0 0 2px; }
        .sheet .muted { color: #555; font-size: 10pt; }
        .rcpt-table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        .rcpt-table td { padding: 7px 4px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
        .rcpt-table td:first-child { color: #555; width: 38%; }
        .sign { margin-top: 56px; display: flex; justify-content: space-between; gap: 40px; }
        .sign .line { border-top: 1px solid #111; padding-top: 6px; font-size: 10pt; color: #333; width: 45%; }
      `}</style>

      <div className="print-hidden sticky top-0 z-10 flex items-center justify-between gap-2 bg-bg-elev/90 backdrop-blur border-b border-border px-4 py-2">
        <a href="/hrms/assets" className="text-sm text-fg-muted hover:text-accent">‹ Back to register</a>
        <PersonPackPrintButton />
      </div>

      <div className="py-6 print:py-0">
        <div className="sheet shadow-2xl print:shadow-none">
          <h1>{orgName}</h1>
          <div className="muted">Equipment {isReturn ? "Return" : "Handover"} Receipt · {today}</div>

          <table className="rcpt-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}><td>{k}</td><td>{v}</td></tr>
              ))}
              <tr><td>{isReturn ? "Returned by" : "Issued to"}</td><td>{holder ?? "—"}</td></tr>
            </tbody>
          </table>

          <p style={{ marginTop: 22 }}>
            {isReturn
              ? "I confirm the above equipment has been returned in the condition noted, and that I have no further responsibility for it."
              : "I acknowledge receipt of the above equipment and accept responsibility for its safekeeping and proper use while in my possession."}
          </p>

          <div className="sign">
            <div className="line">{isReturn ? "Returned by" : "Received by"} (name &amp; signature, date)</div>
            <div className="line">{company?.signatory_name ? `${company.signatory_name}${company.signatory_title ? `, ${company.signatory_title}` : ""}` : "For " + orgName} (signature, date)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
