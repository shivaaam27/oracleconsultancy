/**
 * Paste-from-Excel parsers for the asset and site-tool importers. Pure and
 * client-safe: they turn the rows a person copied (header line included) into
 * the shapes `importAssetsAction` / `importSiteToolsAction` take. Moved here
 * from the old register tables (26 Sept 2026) so the Studio page keeps the
 * importer when those tables go.
 */
import type { AssetImportRow } from "@/app/hrms/assets/actions";
import type { SiteToolImportRow } from "@/app/hrms/assets/site-tools-actions";
import type { ToolCondition } from "@/lib/operations/site-tools-shared";

/* Map a spreadsheet header cell to an import field. */
function headerKey(h: string): keyof AssetImportRow | "ignore" {
  const k = h.trim().toLowerCase();
  if (/asset\s*id|^tag$/.test(k)) return "tag";
  if (/category/.test(k)) return "category";
  if (/device\s*type|^type$/.test(k)) return "name"; // device type becomes the name fallback
  if (/brand|make|manufacturer/.test(k)) return "brand";
  if (/model/.test(k)) return "model";
  if (/serial/.test(k)) return "serialNo";
  if (/assigned/.test(k)) return "notes"; // holder → notes (assign later)
  if (/department|dept/.test(k)) return "department";
  if (/handover|hand\s*over/.test(k)) return "handoverDate";
  if (/location|site/.test(k)) return "location";
  if (/^name$/.test(k)) return "name";
  if (/note|remark/.test(k)) return "notes";
  return "ignore";
}

function parseExcelDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y.length === 2 ? `20${y}` : y;
    const dt = new Date(`${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function parseAssetPaste(text: string): AssetImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(headerKey);
  const rows: AssetImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const row: AssetImportRow = { name: "" };
    let deviceType = "", brand = "", model = "", holder = "";
    headers.forEach((key, i) => {
      const val = (cells[i] ?? "").trim();
      if (!val || key === "ignore") return;
      if (key === "name") deviceType = val;
      else if (key === "brand") brand = val;
      else if (key === "model") model = val;
      else if (key === "notes" && headerCellIsHolder(lines[0].split(sep)[i])) holder = val;
      else if (key === "handoverDate") row.handoverDate = parseExcelDate(val);
      else (row[key] as string) = val;
    });
    // Build a human name: "Brand Model" or fall back to device type.
    row.name = [brand, model].filter(Boolean).join(" ") || deviceType || row.name;
    const extra = [deviceType && !row.name.includes(deviceType) ? deviceType : "", holder ? `Holder: ${holder}` : ""].filter(Boolean).join(" · ");
    if (extra) row.notes = [row.notes, extra].filter(Boolean).join(" · ");
    if (row.name.trim()) rows.push(row);
  }
  return rows;
}

function headerCellIsHolder(h: string | undefined): boolean {
  return !!h && /assigned/i.test(h);
}

function toolHeaderKey(h: string): keyof SiteToolImportRow | "ignore" {
  const k = h.trim().toLowerCase();
  if (/quantity|qty|count/.test(k)) return "quantity";
  if (/spec/.test(k)) return "specification";
  if (/location|site/.test(k)) return "location";
  if (/condition/.test(k)) return "condition";
  if (/purchas|bought|date/.test(k)) return "purchasedDate";
  if (/remark|note/.test(k)) return "remark";
  if (/tool|equip|name|^item$/.test(k)) return "name";
  return "ignore";
}

function parseToolDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // dd-MMM-yy / dd-MMM-yyyy
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y.length === 2 ? `20${y}` : y;
    const d2 = new Date(`${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
    return isNaN(d2.getTime()) ? null : d2.toISOString();
  }
  return null;
}

function parseCondition(v: string): ToolCondition {
  const k = v.trim().toLowerCase().replace(/\s+/g, "");
  if (k === "notgood" || /repair|broke|damag|faulty/.test(k)) return "needs_repair";
  if (/retir|disposed|scrap/.test(k)) return "retired";
  return "good";
}

export function parseToolPaste(text: string): SiteToolImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map(toolHeaderKey);
  const rows: SiteToolImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const row: SiteToolImportRow = { name: "" };
    headers.forEach((key, i) => {
      const val = (cells[i] ?? "").trim();
      if (!val || key === "ignore") return;
      if (key === "quantity") row.quantity = parseInt(val.replace(/[^\d]/g, ""), 10) || 1;
      else if (key === "condition") row.condition = parseCondition(val);
      else if (key === "purchasedDate") row.purchasedDate = parseToolDate(val);
      else (row[key] as string) = val;
    });
    if (row.name.trim()) rows.push(row);
  }
  return rows;
}
