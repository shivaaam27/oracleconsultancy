import { listAssets } from "@/lib/assets";
import { listSiteTools, siteToolMetrics } from "@/lib/site-tools";
import { ASSET_STATUS_LABELS } from "@/lib/assets-shared";
import { TOOL_CONDITION_LABELS, isLowStock } from "@/lib/site-tools-shared";
import { PersonPackPrintButton } from "@/components/person-pack-print-button";

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export default async function AssetRegisterPrintPage() {
  const [assets, tools] = await Promise.all([listAssets(), listSiteTools()]);
  const tm = siteToolMetrics(tools);
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="bg-bg-muted min-h-screen">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        @media print {
          html, body { margin: 0 !important; background: #fff !important; }
          .print-hidden { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; }
        }
        .sheet { width: 277mm; margin: 0 auto; background: #fff; color: #111; padding: 10mm; font-family: var(--font-sans); }
        .reg-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
        .reg-table th, .reg-table td { border: 1px solid #d4d4d4; padding: 4px 6px; text-align: left; vertical-align: top; }
        .reg-table th { background: #f3f3f3; font-weight: 600; }
        .reg-table tr { break-inside: avoid; }
        h1 { font-size: 16pt; margin: 0; }
        h2 { font-size: 12pt; margin: 18px 0 6px; }
        .muted { color: #555; font-size: 9.5pt; }
      `}</style>

      <div className="print-hidden sticky top-0 z-10 flex items-center justify-between gap-2 bg-bg-elev/90 backdrop-blur border-b border-border px-4 py-2">
        <a href="/hrms/assets" className="text-sm text-fg-muted hover:text-accent">‹ Back to register</a>
        <PersonPackPrintButton />
      </div>

      <div className="py-6 print:py-0">
        <div className="sheet shadow-2xl print:shadow-none">
          <h1>Asset, Tools &amp; Equipment Register</h1>
          <p className="muted">Generated {today} · {assets.length} assets · {tm.units} tool units across {tm.lines} lines{tm.lowStock > 0 ? ` · ${tm.lowStock} low on stock` : ""}</p>

          <h2>Assets</h2>
          <table className="reg-table">
            <thead>
              <tr>
                <th>Tag</th><th>Name</th><th>Category</th><th>Brand / Model</th><th>Serial</th>
                <th>Dept</th><th>Company</th><th>Location</th><th>Status</th><th>Holder</th><th>Since</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.tag ?? "—"}</td>
                  <td>{a.name}</td>
                  <td>{a.category ?? "—"}</td>
                  <td>{[a.brand, a.model].filter(Boolean).join(" ") || "—"}</td>
                  <td>{a.serialNo ?? "—"}</td>
                  <td>{a.department ?? "—"}</td>
                  <td>{a.companyName ?? "—"}</td>
                  <td>{a.location ?? "—"}</td>
                  <td>{ASSET_STATUS_LABELS[a.status]}</td>
                  <td>{a.assignedToName ?? (a.assignedToCompanyName ? `${a.assignedToCompanyName} (shared)` : "—")}</td>
                  <td>{fmt(a.assignedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Tools &amp; equipment by site</h2>
          <table className="reg-table">
            <thead>
              <tr>
                <th>Tool</th><th>Qty</th><th>Min</th><th>Spec</th><th>Site</th><th>Condition</th><th>Company</th><th>Purchased</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}{isLowStock(t) ? " ⚠" : ""}</td>
                  <td>{t.quantity}</td>
                  <td>{t.minQty || "—"}</td>
                  <td>{t.specification ?? "—"}</td>
                  <td>{t.location ?? "—"}</td>
                  <td>{TOOL_CONDITION_LABELS[t.condition]}</td>
                  <td>{t.companyName ?? "—"}</td>
                  <td>{fmt(t.purchasedDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
