"use server";

// Server actions for the ORI Automation management screen. READ + pause/cancel
// ONLY — this page never grants a new "auto-perform on trigger" capability; it
// simply lets the owner switch an existing standing rule off or retire it.
// Every mutation is a single, tightly-scoped write against `automation_rules`.

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";

type Res = { ok: boolean; error?: string };

/** Pause (active=false) or resume (active=true) one automation rule. Soft — the
 *  rule row is never deleted, so a paused rule can be switched straight back on.
 *  A resumed one-shot rule that had already fired (done=true) is left alone; only
 *  `active` is flipped, mirroring how the cron/watcher paths treat these rows. */
export async function toggleAutomationActive(id: number, active: boolean): Promise<Res> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Invalid rule." };
  try {
    const { error } = await sb
      .from("automation_rules")
      .update({ active })
      .eq("id", id);
    if (error) return { ok: false, error: "Could not update the automation." };
    revalidatePath("/ori-automations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not update the automation." };
  }
}

/** Cancel (retire) one automation rule. SOFT-deletes — mirrors deleteWatcher:
 *  we set active=false rather than hard-deleting, so an accidental cancel is
 *  recoverable and history is preserved. */
export async function cancelAutomation(id: number): Promise<Res> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Invalid rule." };
  try {
    const { error } = await sb
      .from("automation_rules")
      .update({ active: false })
      .eq("id", id);
    if (error) return { ok: false, error: "Could not cancel the automation." };
    revalidatePath("/ori-automations");
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not cancel the automation." };
  }
}
