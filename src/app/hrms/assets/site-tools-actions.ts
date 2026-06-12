"use server";

import { revalidatePath } from "next/cache";
import {
  createSiteTool,
  createSiteToolsBulk,
  updateSiteTool,
  setSiteToolQuantity,
  setSiteToolCondition,
  transferSiteTool,
  writeOffSiteTool,
  listSiteToolMovements,
  archiveSiteTool,
  type SiteToolInput,
} from "@/lib/site-tools";
import type { ToolCondition, SiteToolMovementRow } from "@/lib/site-tools-shared";

type Result = { ok: true; id?: number } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}
function intOr(fd: FormData, key: string, fallback: number): number {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function dateIso(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function condition(fd: FormData): ToolCondition {
  const v = (fd.get("condition") ?? "").toString().trim();
  return v === "needs_repair" || v === "retired" ? v : "good";
}

function invalidate() {
  revalidatePath("/hrms");
  revalidatePath("/hrms/assets");
}

function fromForm(fd: FormData): SiteToolInput | { error: string } {
  const name = str(fd, "name");
  if (!name) return { error: "A tool name is required." };
  return {
    companyId: numOrNull(fd, "companyId"),
    name,
    quantity: intOr(fd, "quantity", 1),
    minQty: intOr(fd, "minQty", 0),
    specification: str(fd, "specification"),
    location: str(fd, "location"),
    condition: condition(fd),
    purchasedDate: dateIso(fd, "purchasedDate"),
    remark: str(fd, "remark"),
  };
}

export async function createSiteToolAction(fd: FormData): Promise<Result> {
  const parsed = fromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createSiteTool(parsed);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the tool." };
  }
}

export async function updateSiteToolAction(id: number, fd: FormData): Promise<Result> {
  const parsed = fromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateSiteTool(id, parsed);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

export async function setSiteToolQuantityAction(id: number, quantity: number): Promise<Result> {
  try {
    await setSiteToolQuantity(id, quantity);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update quantity." };
  }
}

export async function setSiteToolConditionAction(id: number, condition: ToolCondition): Promise<Result> {
  try {
    await setSiteToolCondition(id, condition);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update condition." };
  }
}

export async function transferSiteToolAction(id: number, qty: number, toLocation: string): Promise<Result> {
  const loc = toLocation.trim();
  if (!loc) return { ok: false, error: "Choose a destination site." };
  if (!(qty > 0)) return { ok: false, error: "Quantity must be at least 1." };
  try {
    await transferSiteTool(id, qty, loc);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not transfer the tool." };
  }
}

export async function writeOffSiteToolAction(id: number, qty: number, reason: string | null): Promise<Result> {
  if (!(qty > 0)) return { ok: false, error: "Quantity must be at least 1." };
  try {
    await writeOffSiteTool(id, qty, reason?.trim() || null);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not write off the tool." };
  }
}

export async function listSiteToolMovementsAction(toolId?: number): Promise<
  { ok: true; rows: SiteToolMovementRow[] } | { ok: false; error: string }
> {
  try {
    const rows = await listSiteToolMovements(toolId);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load history." };
  }
}

export async function archiveSiteToolAction(id: number, archived: boolean): Promise<Result> {
  try {
    await archiveSiteTool(id, archived);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive the tool." };
  }
}

// Spreadsheet importer row — free-text; the client maps columns to these keys.
export type SiteToolImportRow = {
  name: string;
  quantity?: number | null;
  specification?: string | null;
  location?: string | null;
  condition?: ToolCondition | null;
  purchasedDate?: string | null; // ISO or null
  remark?: string | null;
};

export async function importSiteToolsAction(
  rows: SiteToolImportRow[],
  companyId: number | null
): Promise<Result> {
  const clean = rows
    .map((r) => ({ ...r, name: (r.name ?? "").trim() }))
    .filter((r) => r.name.length > 0);
  if (clean.length === 0) return { ok: false, error: "No rows with a name to import." };
  try {
    const n = await createSiteToolsBulk(
      clean.map((r) => ({
        companyId,
        name: r.name,
        quantity: r.quantity && r.quantity > 0 ? Math.floor(r.quantity) : 1,
        minQty: 0,
        specification: r.specification?.trim() || null,
        location: r.location?.trim() || null,
        condition: r.condition ?? "good",
        purchasedDate: r.purchasedDate || null,
        remark: r.remark?.trim() || null,
      }))
    );
    invalidate();
    return { ok: true, id: n };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not import tools." };
  }
}
