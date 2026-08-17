import "server-only";
import { sb } from "@/db/supabase";
import type { ToolDef } from "@/lib/ori/tools";
import { str, resolveCompany, resolvePerson } from "@/lib/ori/tools";

// Assets & Vendors (durable equipment / suppliers)
import {
  createAssetAction,
  updateAssetAction,
  assignAssetAction,
  returnAssetAction,
  setAssetStatusAction,
  archiveAssetAction,
} from "@/app/hrms/assets/actions";
import { createVendorAction, updateVendorAction, archiveVendorAction } from "@/app/hrms/vendors/actions";
// Stock (OECR)
import { createStockItemAction, recordPurchaseAction, recordIssueAction } from "@/app/hrms/actions";
// Cleaning (OCR)
import { toggleCheckAction, signDayAction } from "@/app/hrms/cleaning/actions";
// Reference data (departments / sites / roles)
import {
  createDepartment,
  renameDepartment,
  mergeDepartments,
  deleteDepartment,
} from "@/app/companies/department-actions";
import {
  createSite,
  renameSite,
  mergeSites,
  deleteSite,
  createRole,
  renameRole,
  mergeRoles,
  deleteRole,
} from "@/app/companies/reference-actions";
// Company profile
import { saveCompanyProfileAction } from "@/app/companies/[id]/actions";
// Settings (owner-only automation mode)
import { setAutomationModeAction } from "@/app/automations/actions";

/* ------------------------------------------------------------------ */
/* Small local helpers                                                */
/* ------------------------------------------------------------------ */

/** Coerce a planner-supplied value to a positive integer id, or null. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(str(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Build a FormData from a flat record so we can reuse the existing
 *  FormData-based server actions verbatim (assets/vendors/stock). Skips
 *  null/undefined/empty so blank fields become "not set", not "".  */
function form(fields: Record<string, string | number | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    const s = typeof v === "number" ? String(v) : v;
    if (s.trim() === "") continue;
    fd.set(k, s);
  }
  return fd;
}

/** Resolve an asset by tag or name → { id, name, status, archived }. */
async function resolveAsset(
  ref: string
): Promise<{ id: number; name: string; status: string; archived: boolean } | null> {
  const q = ref.trim();
  if (!q) return null;
  const byId = num(q);
  const sel = "id, name, status, archived";
  if (byId) {
    const { data } = await sb.from("assets").select(sel).eq("id", byId).maybeSingle();
    if (data) return data as { id: number; name: string; status: string; archived: boolean };
  }
  // Exact tag first, then a fuzzy name match.
  const { data: byTag } = await sb.from("assets").select(sel).ilike("tag", q).limit(1);
  if (byTag && byTag.length) return byTag[0] as { id: number; name: string; status: string; archived: boolean };
  const { data: byName } = await sb.from("assets").select(sel).ilike("name", `%${q}%`).limit(1);
  if (byName && byName.length) return byName[0] as { id: number; name: string; status: string; archived: boolean };
  return null;
}

/** Resolve a vendor by name → { id, name }. */
async function resolveVendor(ref: string): Promise<{ id: number; name: string } | null> {
  const q = ref.trim();
  if (!q) return null;
  const byId = num(q);
  if (byId) {
    const { data } = await sb.from("vendors").select("id, name").eq("id", byId).maybeSingle();
    if (data) return data as { id: number; name: string };
  }
  const { data } = await sb.from("vendors").select("id, name").ilike("name", `%${q}%`).limit(1);
  if (data && data.length) return data[0] as { id: number; name: string };
  return null;
}

/** Resolve one reference-list row (departments/sites/job_titles) by name or id. */
async function resolveRef(
  table: "departments" | "sites" | "job_titles",
  ref: string
): Promise<{ id: number; name: string } | null> {
  const q = ref.trim();
  if (!q) return null;
  const byId = num(q);
  if (byId) {
    const { data } = await sb.from(table).select("id, name").eq("id", byId).maybeSingle();
    if (data) return data as { id: number; name: string };
  }
  const { data: exact } = await sb.from(table).select("id, name").ilike("name", q).maybeSingle();
  if (exact) return exact as { id: number; name: string };
  const { data } = await sb.from(table).select("id, name").ilike("name", `%${q}%`).limit(1);
  if (data && data.length) return data[0] as { id: number; name: string };
  return null;
}

/* ------------------------------------------------------------------ */
/* Tools                                                              */
/* ------------------------------------------------------------------ */

export const OPS_TOOLS: ToolDef[] = [
  /* ---------------------------- Assets ---------------------------- */
  {
    name: "create_asset",
    tier: 2,
    description: "Register a durable asset (laptop, phone, vehicle, tool) in the Asset Register.",
    params: {
      name: { type: "string", required: true, description: "What the asset is (e.g. 'Dell Latitude laptop')." },
      category: { type: "string", required: false, description: "Category (Computer, Phone, Vehicle, Furniture…)." },
      tag: { type: "string", required: false, description: "Asset tag / inventory number." },
      brand: { type: "string", required: false, description: "Brand / make." },
      model: { type: "string", required: false, description: "Model." },
      serialNo: { type: "string", required: false, description: "Serial number." },
      company: { type: "string", required: false, description: "Owning company (name or code)." },
      location: { type: "string", required: false, description: "Where it is kept." },
      notes: { type: "string", required: false, description: "Any notes." },
    },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the asset a name." };
      let companyId: number | null = null;
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        companyId = c.id;
      }
      const res = await createAssetAction(
        form({
          name,
          category: str(args.category),
          tag: str(args.tag),
          brand: str(args.brand),
          model: str(args.model),
          serialNo: str(args.serialNo),
          companyId,
          location: str(args.location),
          notes: str(args.notes),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Registered "${name}".`, redirect: `/hrms/assets` };
    },
  },
  {
    name: "update_asset",
    tier: 2,
    description: "Edit an asset's core details (name, category, brand, model, serial, location, notes).",
    params: {
      asset: { type: "string", required: true, description: "The asset — its id, tag or current name." },
      name: { type: "string", required: false, description: "New name." },
      category: { type: "string", required: false, description: "New category." },
      tag: { type: "string", required: false, description: "New tag." },
      brand: { type: "string", required: false, description: "New brand." },
      model: { type: "string", required: false, description: "New model." },
      serialNo: { type: "string", required: false, description: "New serial number." },
      location: { type: "string", required: false, description: "New location." },
      notes: { type: "string", required: false, description: "New notes." },
    },
    async run(args) {
      const asset = await resolveAsset(str(args.asset));
      if (!asset) return { ok: false, message: `Couldn't find an asset matching "${str(args.asset)}".` };
      // Snapshot the full editable row BEFORE the write so undo can restore it.
      const { data: before } = await sb
        .from("assets")
        .select("tag, name, category, brand, model, serial_no, company_id, location, notes")
        .eq("id", asset.id)
        .maybeSingle();
      // updateAssetAction reparses the WHOLE form, so we must resend every field —
      // fall back to the current value when the planner didn't supply one, else the
      // action would null the omitted columns.
      const b = (before ?? {}) as Record<string, unknown>;
      const keep = (k: string, v: string): string | null => (str(args[k]) || (b[v] == null ? null : String(b[v])));
      const res = await updateAssetAction(
        asset.id,
        form({
          name: str(args.name) || asset.name,
          category: keep("category", "category"),
          tag: keep("tag", "tag"),
          brand: keep("brand", "brand"),
          model: keep("model", "model"),
          serialNo: keep("serialNo", "serial_no"),
          companyId: b.company_id == null ? null : String(b.company_id),
          location: keep("location", "location"),
          notes: keep("notes", "notes"),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Updated "${str(args.name) || asset.name}".`,
        redirect: `/hrms/assets`,
        undo: { kind: "ori.asset.update", payload: { assetId: asset.id, before: b } },
      };
    },
  },
  {
    name: "assign_asset",
    tier: 2,
    description: "Assign an asset to a person (hands the equipment to a staff member).",
    params: {
      asset: { type: "string", required: true, description: "The asset — its id, tag or name." },
      person: { type: "string", required: true, description: "Who to assign it to — their name." },
      notes: { type: "string", required: false, description: "Handover notes." },
    },
    async run(args) {
      const asset = await resolveAsset(str(args.asset));
      if (!asset) return { ok: false, message: `Couldn't find an asset matching "${str(args.asset)}".` };
      const person = await resolvePerson(str(args.person));
      if (!person) return { ok: false, message: `Couldn't find a person matching "${str(args.person)}".` };
      const res = await assignAssetAction(asset.id, person.id, str(args.notes) || null);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Assigned "${asset.name}" to ${person.name}.`, redirect: `/hrms/assets` };
    },
  },
  {
    name: "return_asset",
    tier: 2,
    description: "Return an asset to the store (unassign it from whoever holds it).",
    params: {
      asset: { type: "string", required: true, description: "The asset — its id, tag or name." },
      notes: { type: "string", required: false, description: "Return notes / condition." },
    },
    async run(args) {
      const asset = await resolveAsset(str(args.asset));
      if (!asset) return { ok: false, message: `Couldn't find an asset matching "${str(args.asset)}".` };
      const res = await returnAssetAction(asset.id, str(args.notes) || null);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Returned "${asset.name}" to the store.`, redirect: `/hrms/assets` };
    },
  },
  {
    name: "set_asset_status",
    tier: 2,
    description: "Set an asset's condition/status (In store, In maintenance, Retired).",
    params: {
      asset: { type: "string", required: true, description: "The asset — its id, tag or name." },
      status: {
        type: "string",
        required: true,
        description: "New status: in_store | maintenance | retired. (Use assign_asset to hand it to someone.)",
      },
    },
    async run(args) {
      const asset = await resolveAsset(str(args.asset));
      if (!asset) return { ok: false, message: `Couldn't find an asset matching "${str(args.asset)}".` };
      const raw = str(args.status).toLowerCase().replace(/[\s-]+/g, "_");
      // "assigned" is set by assign_asset (needs a person), not a bare status flip.
      const allowed = ["in_store", "maintenance", "retired"] as const;
      const status = allowed.find((s) => s === raw);
      if (!status) return { ok: false, message: `Status must be one of: ${allowed.join(", ")}.` };
      const before = asset.status;
      const res = await setAssetStatusAction(asset.id, status);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Set "${asset.name}" to ${status.replace(/_/g, " ")}.`,
        redirect: `/hrms/assets`,
        undo: { kind: "ori.asset.status", payload: { assetId: asset.id, before } },
      };
    },
  },
  {
    name: "archive_asset",
    tier: 3,
    description: "Archive (retire from the active register) an asset. Reversible.",
    params: {
      asset: { type: "string", required: true, description: "The asset — its id, tag or name." },
    },
    async run(args) {
      const asset = await resolveAsset(str(args.asset));
      if (!asset) return { ok: false, message: `Couldn't find an asset matching "${str(args.asset)}".` };
      if (asset.archived) return { ok: false, message: `"${asset.name}" is already archived.` };
      const res = await archiveAssetAction(asset.id, true);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Archived "${asset.name}".`,
        redirect: `/hrms/assets`,
        undo: { kind: "ori.asset.archive", payload: { assetId: asset.id } },
      };
    },
  },

  /* ---------------------------- Vendors --------------------------- */
  {
    name: "create_vendor",
    tier: 2,
    description: "Add a supplier/contractor/landlord to the Vendor Register.",
    params: {
      name: { type: "string", required: true, description: "Vendor name." },
      category: { type: "string", required: false, description: "Category (Supplier, Landlord, Contractor…)." },
      company: { type: "string", required: false, description: "Which company they serve (name or code)." },
      contactName: { type: "string", required: false, description: "Contact person." },
      email: { type: "string", required: false, description: "Email." },
      phone: { type: "string", required: false, description: "Phone." },
      location: { type: "string", required: false, description: "Location / address." },
      notes: { type: "string", required: false, description: "Notes." },
    },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the vendor a name." };
      let companyId: number | null = null;
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        companyId = c.id;
      }
      const res = await createVendorAction(
        form({
          name,
          category: str(args.category),
          companyId,
          contactName: str(args.contactName),
          email: str(args.email),
          phone: str(args.phone),
          location: str(args.location),
          notes: str(args.notes),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Added vendor "${name}".`, redirect: `/hrms/assets` };
    },
  },
  {
    name: "update_vendor",
    tier: 2,
    description: "Edit a vendor's details.",
    params: {
      vendor: { type: "string", required: true, description: "The vendor — its id or current name." },
      name: { type: "string", required: false, description: "New name." },
      category: { type: "string", required: false, description: "New category." },
      contactName: { type: "string", required: false, description: "New contact person." },
      email: { type: "string", required: false, description: "New email." },
      phone: { type: "string", required: false, description: "New phone." },
      location: { type: "string", required: false, description: "New location." },
      notes: { type: "string", required: false, description: "New notes." },
    },
    async run(args) {
      const vendor = await resolveVendor(str(args.vendor));
      if (!vendor) return { ok: false, message: `Couldn't find a vendor matching "${str(args.vendor)}".` };
      const { data: before } = await sb
        .from("vendors")
        .select("name, category, company_id, contact_name, email, phone, location, notes")
        .eq("id", vendor.id)
        .maybeSingle();
      const b = (before ?? {}) as Record<string, unknown>;
      const keep = (k: string, v: string): string | null => (str(args[k]) || (b[v] == null ? null : String(b[v])));
      const res = await updateVendorAction(
        vendor.id,
        form({
          name: str(args.name) || vendor.name,
          category: keep("category", "category"),
          companyId: b.company_id == null ? null : String(b.company_id),
          contactName: keep("contactName", "contact_name"),
          email: keep("email", "email"),
          phone: keep("phone", "phone"),
          location: keep("location", "location"),
          notes: keep("notes", "notes"),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Updated "${str(args.name) || vendor.name}".`,
        redirect: `/hrms/assets`,
        undo: { kind: "ori.vendor.update", payload: { vendorId: vendor.id, before: b } },
      };
    },
  },
  {
    name: "archive_vendor",
    tier: 3,
    description: "Archive (remove from the active register) a vendor. Reversible.",
    params: {
      vendor: { type: "string", required: true, description: "The vendor — its id or name." },
    },
    async run(args) {
      const vendor = await resolveVendor(str(args.vendor));
      if (!vendor) return { ok: false, message: `Couldn't find a vendor matching "${str(args.vendor)}".` };
      const res = await archiveVendorAction(vendor.id);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Archived "${vendor.name}".`,
        redirect: `/hrms/assets`,
        undo: { kind: "ori.vendor.archive", payload: { vendorId: vendor.id } },
      };
    },
  },

  /* ---------------------- Stock (OECR) ---------------------------- */
  {
    name: "create_stock_item",
    tier: 2,
    description: "Add a consumable stock item to the Office Equipment Control Registry (OECR).",
    params: {
      code: { type: "string", required: true, description: "Item code (e.g. ST-001)." },
      name: { type: "string", required: true, description: "Item name." },
      category: { type: "string", required: false, description: "Category." },
      unit: { type: "string", required: false, description: "Unit of issue (box, ream, each…)." },
      openingStock: { type: "number", required: false, description: "Opening quantity on hand." },
      reorderLevel: { type: "number", required: false, description: "Reorder threshold." },
      unitCost: { type: "number", required: false, description: "Unit cost." },
    },
    async run(args) {
      const code = str(args.code);
      const name = str(args.name);
      if (!code) return { ok: false, message: "Give the item a code (e.g. ST-001)." };
      if (!name) return { ok: false, message: "Give the item a name." };
      const res = await createStockItemAction(
        form({
          code,
          name,
          category: str(args.category),
          unit: str(args.unit),
          openingStock: num(args.openingStock),
          reorderLevel: num(args.reorderLevel),
          unitCost: num(args.unitCost),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Added stock item "${name}".`, redirect: `/hrms/supplies` };
    },
  },
  {
    name: "record_purchase",
    tier: 2,
    description: "Record a stock-IN purchase against an OECR item.",
    params: {
      itemCode: { type: "string", required: true, description: "The item's code." },
      qty: { type: "number", required: true, description: "Quantity purchased (> 0)." },
      date: { type: "date", required: false, description: "Purchase date (YYYY-MM-DD)." },
      unitCost: { type: "number", required: false, description: "Unit cost." },
      supplier: { type: "string", required: false, description: "Supplier name." },
      ref: { type: "string", required: false, description: "Invoice / reference." },
    },
    async run(args) {
      const itemCode = str(args.itemCode);
      const qty = num(args.qty);
      if (!itemCode) return { ok: false, message: "Which item? Give its code." };
      if (!qty || qty <= 0) return { ok: false, message: "Enter a quantity greater than zero." };
      const res = await recordPurchaseAction(
        form({
          itemCode,
          qty,
          date: str(args.date),
          unitCost: num(args.unitCost),
          supplier: str(args.supplier),
          ref: str(args.ref),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Recorded ${qty} in for ${itemCode}.`, redirect: `/hrms/supplies` };
    },
  },
  {
    name: "record_issue",
    tier: 2,
    description: "Record a stock-OUT issue of an OECR item to a person or company.",
    params: {
      itemCode: { type: "string", required: true, description: "The item's code." },
      qty: { type: "number", required: true, description: "Quantity issued (> 0)." },
      date: { type: "date", required: false, description: "Issue date (YYYY-MM-DD)." },
      issuedTo: { type: "string", required: false, description: "Who it was issued to (free text)." },
      company: { type: "string", required: false, description: "Company it was issued for (name or code)." },
      notes: { type: "string", required: false, description: "Notes." },
    },
    async run(args) {
      const itemCode = str(args.itemCode);
      const qty = num(args.qty);
      if (!itemCode) return { ok: false, message: "Which item? Give its code." };
      if (!qty || qty <= 0) return { ok: false, message: "Enter a quantity greater than zero." };
      let companyId: number | null = null;
      if (str(args.company)) {
        const c = await resolveCompany(str(args.company));
        if (!c) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        companyId = c.id;
      }
      const res = await recordIssueAction(
        form({
          itemCode,
          qty,
          date: str(args.date),
          issuedTo: str(args.issuedTo),
          companyId,
          notes: str(args.notes),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Issued ${qty} of ${itemCode}.`, redirect: `/hrms/supplies` };
    },
  },

  /* ----------------------- Cleaning (OCR) ------------------------- */
  {
    name: "toggle_cleaning_check",
    tier: 2,
    description: "Tick or untick a cleaning check for an area on a given cleaning day.",
    params: {
      dayId: { type: "number", required: true, description: "The cleaning day's id." },
      areaId: { type: "number", required: true, description: "The cleaning area's id." },
      done: { type: "string", required: true, description: "true to tick, false to untick." },
    },
    async run(args) {
      const dayId = num(args.dayId);
      const areaId = num(args.areaId);
      if (!dayId || !areaId) return { ok: false, message: "Need both a day id and an area id." };
      const done = /^(true|1|yes|done|on)$/i.test(str(args.done));
      const res = await toggleCheckAction(dayId, areaId, done);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: done ? "Marked the area cleaned." : "Cleared the tick.",
        redirect: `/hrms/cleaning`,
        undo: { kind: "ori.cleaning.check", payload: { dayId, areaId, before: !done } },
      };
    },
  },
  {
    name: "sign_cleaning_day",
    tier: 2,
    description: "Sign off (or un-sign) a cleaning day — records who confirmed the day's checks.",
    params: {
      dayId: { type: "number", required: true, description: "The cleaning day's id." },
      signed: { type: "string", required: false, description: "true to sign off, false to un-sign (default true)." },
      person: { type: "string", required: false, description: "Who is signing (a staff member's name)." },
      name: { type: "string", required: false, description: "Signer name if not a linked person." },
    },
    async run(args) {
      const dayId = num(args.dayId);
      if (!dayId) return { ok: false, message: "Which cleaning day? Give its id." };
      const signed = str(args.signed) ? /^(true|1|yes|on)$/i.test(str(args.signed)) : true;
      let personId: number | null = null;
      let name = str(args.name) || null;
      if (str(args.person)) {
        const p = await resolvePerson(str(args.person));
        if (!p) return { ok: false, message: `Couldn't find a person matching "${str(args.person)}".` };
        personId = p.id;
        name = name || p.name;
      }
      if (signed && !name) return { ok: false, message: "Say who is signing off the day." };
      const res = await signDayAction(dayId, signed, name, personId);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: signed ? `Signed off day ${dayId}.` : `Un-signed day ${dayId}.`, redirect: `/hrms/cleaning` };
    },
  },

  /* ----------------------- Reference: departments ----------------- */
  {
    name: "create_department",
    tier: 2,
    description: "Add a department to the shared department list.",
    params: { name: { type: "string", required: true, description: "Department name." } },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the department a name." };
      const res = await createDepartment(name);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Added department "${name}".`, redirect: `/companies` };
    },
  },
  {
    name: "rename_department",
    tier: 2,
    description: "Rename a department (re-points everyone tagged to it).",
    params: {
      department: { type: "string", required: true, description: "The department — its id or current name." },
      name: { type: "string", required: true, description: "The new name." },
    },
    async run(args) {
      const dep = await resolveRef("departments", str(args.department));
      if (!dep) return { ok: false, message: `Couldn't find a department matching "${str(args.department)}".` };
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the department a new name." };
      const res = await renameDepartment(dep.id, name);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Renamed to "${name}".`,
        redirect: `/companies`,
        undo: { kind: "ori.ref.rename", payload: { table: "departments", id: dep.id, before: dep.name } },
      };
    },
  },
  {
    name: "merge_department",
    tier: 3,
    description: "Merge one department into another: re-point all people/tasks/heads, then remove the source.",
    params: {
      from: { type: "string", required: true, description: "The department to merge FROM (removed) — id or name." },
      into: { type: "string", required: true, description: "The department to merge INTO (kept) — id or name." },
    },
    async run(args) {
      const from = await resolveRef("departments", str(args.from));
      const into = await resolveRef("departments", str(args.into));
      if (!from) return { ok: false, message: `Couldn't find a department matching "${str(args.from)}".` };
      if (!into) return { ok: false, message: `Couldn't find a department matching "${str(args.into)}".` };
      const res = await mergeDepartments(from.id, into.id);
      if (!res.ok) return { ok: false, message: res.error };
      // No clean inverse: the source row is deleted and re-points can't be reliably
      // reversed (prior tags aren't snapshotted). Left undo-free by design.
      return { ok: true, message: `Merged "${from.name}" into "${into.name}".`, redirect: `/companies` };
    },
  },
  {
    name: "delete_department",
    tier: 3,
    description: "Delete a department (anyone tagged to it becomes 'no department').",
    params: { department: { type: "string", required: true, description: "The department — its id or name." } },
    async run(args) {
      const dep = await resolveRef("departments", str(args.department));
      if (!dep) return { ok: false, message: `Couldn't find a department matching "${str(args.department)}".` };
      const res = await deleteDepartment(dep.id);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Deleted "${dep.name}".`, redirect: `/companies` };
    },
  },

  /* ----------------------- Reference: sites ----------------------- */
  {
    name: "create_site",
    tier: 2,
    description: "Add a site/location to the shared sites list (where staff live or work).",
    params: { name: { type: "string", required: true, description: "Site name." } },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the site a name." };
      const res = await createSite(name);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Added site "${name}".`, redirect: `/companies` };
    },
  },
  {
    name: "rename_site",
    tier: 2,
    description: "Rename a site.",
    params: {
      site: { type: "string", required: true, description: "The site — its id or current name." },
      name: { type: "string", required: true, description: "The new name." },
    },
    async run(args) {
      const site = await resolveRef("sites", str(args.site));
      if (!site) return { ok: false, message: `Couldn't find a site matching "${str(args.site)}".` };
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the site a new name." };
      const res = await renameSite(site.id, name);
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Renamed to "${name}".`,
        redirect: `/companies`,
        undo: { kind: "ori.ref.rename", payload: { table: "sites", id: site.id, before: site.name } },
      };
    },
  },
  {
    name: "merge_site",
    tier: 3,
    description: "Merge one site into another: re-point work/residence, then remove the source.",
    params: {
      from: { type: "string", required: true, description: "The site to merge FROM (removed) — id or name." },
      into: { type: "string", required: true, description: "The site to merge INTO (kept) — id or name." },
    },
    async run(args) {
      const from = await resolveRef("sites", str(args.from));
      const into = await resolveRef("sites", str(args.into));
      if (!from) return { ok: false, message: `Couldn't find a site matching "${str(args.from)}".` };
      if (!into) return { ok: false, message: `Couldn't find a site matching "${str(args.into)}".` };
      const res = await mergeSites(from.id, into.id);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Merged "${from.name}" into "${into.name}".`, redirect: `/companies` };
    },
  },
  {
    name: "delete_site",
    tier: 3,
    description: "Delete a site (anyone based/living there becomes 'no site').",
    params: { site: { type: "string", required: true, description: "The site — its id or name." } },
    async run(args) {
      const site = await resolveRef("sites", str(args.site));
      if (!site) return { ok: false, message: `Couldn't find a site matching "${str(args.site)}".` };
      const res = await deleteSite(site.id);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Deleted "${site.name}".`, redirect: `/companies` };
    },
  },

  /* ----------------------- Reference: roles ----------------------- */
  {
    name: "create_role",
    tier: 2,
    description: "Add a job title to the managed role list.",
    params: { name: { type: "string", required: true, description: "Job title." } },
    async run(args) {
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the job title a name." };
      const res = await createRole(name);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Added job title "${name}".`, redirect: `/companies` };
    },
  },
  {
    name: "rename_role",
    tier: 2,
    description: "Rename a job title (re-points every person whose role text matches).",
    params: {
      role: { type: "string", required: true, description: "The job title — its id or current name." },
      name: { type: "string", required: true, description: "The new name." },
    },
    async run(args) {
      const role = await resolveRef("job_titles", str(args.role));
      if (!role) return { ok: false, message: `Couldn't find a job title matching "${str(args.role)}".` };
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the job title a new name." };
      const res = await renameRole(role.id, name);
      if (!res.ok) return { ok: false, message: res.error };
      // No undo: the rename cascades to people.role free-text (mass re-point);
      // reversing the title alone wouldn't restore those, so left undo-free.
      return { ok: true, message: `Renamed to "${name}".`, redirect: `/companies` };
    },
  },
  {
    name: "merge_role",
    tier: 3,
    description: "Merge one job title into another: re-point people's role text, then remove the source.",
    params: {
      from: { type: "string", required: true, description: "The job title to merge FROM (removed) — id or name." },
      into: { type: "string", required: true, description: "The job title to merge INTO (kept) — id or name." },
    },
    async run(args) {
      const from = await resolveRef("job_titles", str(args.from));
      const into = await resolveRef("job_titles", str(args.into));
      if (!from) return { ok: false, message: `Couldn't find a job title matching "${str(args.from)}".` };
      if (!into) return { ok: false, message: `Couldn't find a job title matching "${str(args.into)}".` };
      const res = await mergeRoles(from.id, into.id);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Merged "${from.name}" into "${into.name}".`, redirect: `/companies` };
    },
  },
  {
    name: "delete_role",
    tier: 3,
    description: "Remove a job title from the managed list (people keep their current role text).",
    params: { role: { type: "string", required: true, description: "The job title — its id or name." } },
    async run(args) {
      const role = await resolveRef("job_titles", str(args.role));
      if (!role) return { ok: false, message: `Couldn't find a job title matching "${str(args.role)}".` };
      const res = await deleteRole(role.id);
      if (!res.ok) return { ok: false, message: res.error };
      return { ok: true, message: `Removed "${role.name}" from the list.`, redirect: `/companies` };
    },
  },

  /* ----------------------- Company profile ------------------------ */
  {
    name: "save_company_profile",
    tier: 2,
    description:
      "Update a company's core profile fields (legal name, registration no., TIN, VRN, address, phone, email, signatory).",
    params: {
      company: { type: "string", required: true, description: "The company — its name or code." },
      legalName: { type: "string", required: false, description: "Registered legal name." },
      registrationNo: { type: "string", required: false, description: "Registration / BRELA number." },
      tin: { type: "string", required: false, description: "TIN." },
      vrn: { type: "string", required: false, description: "VRN / VAT number." },
      address: { type: "string", required: false, description: "Registered address." },
      phone: { type: "string", required: false, description: "Phone." },
      email: { type: "string", required: false, description: "Email." },
      signatoryName: { type: "string", required: false, description: "Authorised signatory name." },
      signatoryTitle: { type: "string", required: false, description: "Signatory title." },
    },
    async run(args) {
      const company = await resolveCompany(str(args.company));
      if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
      // Snapshot the columns this tool can touch BEFORE the write, for undo. The
      // action reparses the whole form, so we resend current values for any field
      // the planner didn't supply (else it would null them).
      const { data: cur } = await sb
        .from("companies")
        .select("legal_name, registration_no, tin, vrn, address, phone, email, signatory_name, signatory_title")
        .eq("id", company.id)
        .maybeSingle();
      const b = (cur ?? {}) as Record<string, unknown>;
      const keep = (arg: string, col: string): string | null =>
        str(args[arg]) || (b[col] == null ? null : String(b[col]));
      const res = await saveCompanyProfileAction(
        company.id,
        form({
          name: company.name, // never blank the display name
          legalName: keep("legalName", "legal_name"),
          registrationNo: keep("registrationNo", "registration_no"),
          tin: keep("tin", "tin"),
          vrn: keep("vrn", "vrn"),
          address: keep("address", "address"),
          phone: keep("phone", "phone"),
          email: keep("email", "email"),
          signatoryName: keep("signatoryName", "signatory_name"),
          signatoryTitle: keep("signatoryTitle", "signatory_title"),
        })
      );
      if (!res.ok) return { ok: false, message: res.error };
      return {
        ok: true,
        message: `Updated ${company.name}'s profile.`,
        redirect: `/companies/${company.id}`,
        undo: { kind: "ori.company.profile", payload: { companyId: company.id, before: b } },
      };
    },
  },

  /* -------------------- Settings (owner-only) --------------------- */
  {
    name: "set_automation_mode",
    tier: 3,
    description:
      "Set how a class of automation behaves: 'auto' (act automatically), 'suggest' (propose only) or 'off'. Owner-only.",
    params: {
      kind: { type: "string", required: true, description: "The automation class key (e.g. the reaction/rule kind)." },
      mode: { type: "string", required: true, description: "auto | suggest | off." },
    },
    async run(args) {
      const kind = str(args.kind);
      if (!kind) return { ok: false, message: "Which automation? Give its kind." };
      const raw = str(args.mode).toLowerCase();
      const mode = (["auto", "suggest", "off"] as const).find((m) => m === raw);
      if (!mode) return { ok: false, message: "Mode must be auto, suggest or off." };
      const res = await setAutomationModeAction(kind, mode);
      if (!res.ok) return { ok: false, message: "Could not change the automation mode." };
      return { ok: true, message: `Set "${kind}" automation to ${mode}.`, redirect: `/settings` };
    },
  },
];
