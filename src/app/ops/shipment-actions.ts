"use server";

// Server actions for shipments — the import and clearance half (Stage 3).

import { revalidatePath } from "next/cache";
import {
  createShipment, updateShipment, archiveShipment, setLineShipment,
  type ShipmentFields,
} from "@/lib/ops-shipments";

type Result = { ok: boolean; id?: number; error?: string };

function refresh() {
  revalidatePath("/ops/imports");
  // The order lines read their ETA and agent from the shipment, so they change too.
  revalidatePath("/ops");
}

export async function createShipmentAction(f: ShipmentFields): Promise<Result> {
  if (!f.blNo?.trim()) return { ok: false, error: "Give the shipment its BL or airway bill number." };
  const res = await createShipment(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateShipmentAction(id: number, patch: Partial<ShipmentFields>): Promise<Result> {
  const res = await updateShipment(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archiveShipmentAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveShipment(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function setLineShipmentAction(lineId: number, shipmentId: number | null): Promise<Result> {
  const res = await setLineShipment(lineId, shipmentId);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: lineId };
}
