"use server";

// Server actions for the order lines (Stage 2).

import { revalidatePath } from "next/cache";
import {
  createOrderLine, updateOrderLine, archiveOrderLine,
  type OrderLineFields,
} from "@/lib/ops-orders";

type Result = { ok: boolean; id?: number; error?: string };

function refresh() {
  revalidatePath("/ops");
}

export async function createOrderLineAction(f: OrderLineFields): Promise<Result> {
  if (!f.poNo?.trim()) return { ok: false, error: "Give the line a PO number." };
  if (!f.description?.trim()) return { ok: false, error: "Say what the line is for." };
  const res = await createOrderLine(f);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id: res.id };
}

export async function updateOrderLineAction(
  id: number, patch: Partial<OrderLineFields>,
): Promise<Result> {
  const res = await updateOrderLine(id, patch);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}

export async function archiveOrderLineAction(id: number, archived: boolean): Promise<Result> {
  const res = await archiveOrderLine(id, archived);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, id };
}
