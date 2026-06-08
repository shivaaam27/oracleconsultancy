"use server";

import { revalidatePath } from "next/cache";
import { createVendor, updateVendor, archiveVendor, type VendorInput } from "@/lib/vendors";

type Result = { ok: true; id?: number } | { ok: false; error: string };

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}
function numOrNull(fd: FormData, key: string): number | null {
  const v = (fd.get(key) ?? "").toString().trim();
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function invalidate() {
  revalidatePath("/hrms");
  revalidatePath("/hrms/assets");
}

function vendorFromForm(fd: FormData): VendorInput | { error: string } {
  const name = str(fd, "name");
  if (!name) return { error: "A vendor name is required." };
  return {
    name,
    category: str(fd, "category"),
    companyId: numOrNull(fd, "companyId"),
    contactName: str(fd, "contactName"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    location: str(fd, "location"),
    notes: str(fd, "notes"),
  };
}

export async function createVendorAction(fd: FormData): Promise<Result> {
  const parsed = vendorFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createVendor(parsed);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the vendor." };
  }
}

export async function updateVendorAction(id: number, fd: FormData): Promise<Result> {
  const parsed = vendorFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    await updateVendor(id, parsed);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

export async function archiveVendorAction(id: number): Promise<Result> {
  try {
    await archiveVendor(id);
    invalidate();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive the vendor." };
  }
}
