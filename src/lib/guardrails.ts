// guardrails.ts — the central Tier-3 gate for the self-running system.
//
// The autonomy spine is: Propose → auto-if-safe → log → undo, with three safety
// tiers. Tier 3 is the dangerous one — SEND (email/WhatsApp/SMS), SPEND (AI/£),
// and DELETE (hard, irreversible). Per the self-running roadmap, Tier 3 must NEVER
// run automatically without an explicit owner opt-in. This module is the one place
// every automated path asks "am I allowed to do this on my own?", so the policy
// lives in a single, auditable spot instead of being re-derived everywhere.
//
// Defaults preserve TODAY's behaviour exactly:
//   - email auto-send stays enabled when email is configured and automations are
//     not paused (settings.autoSendEmail defaults true);
//   - WhatsApp/SMS auto-send default OFF (no wiring exists today — opt-in);
//   - spend cap defaults to unlimited (settings.aiMonthlySpendCap = 0);
//   - automated deletes must be reversible (archive), never hard-delete.
//
// Server-only (reads settings / automation config via the DB). Best-effort: a
// transient error fails CLOSED for sending (don't send if unsure) — the safer
// direction for a Tier-3 action.

import { getAppSettings } from "./settings";
import { getAutomationConfig } from "./automation/config";
import { sb } from "@/db/supabase";

// Re-export so callers have ONE import for the whole Tier-3 surface.
export { isOverSpendCap, monthlySpend, recordUsage } from "./ai-spend";

export type SendChannel = "email" | "whatsapp" | "sms";

/** Is director/manager outreach (messaging) currently paused? Mirrors the
 *  governance kill switch in settings/control-actions (key "director.outreachPaused"). */
async function isOutreachPaused(): Promise<boolean> {
  try {
    const { data } = await sb.from("settings").select("value").eq("key", "director.outreachPaused").maybeSingle();
    return (data?.value as string | null) === "1";
  } catch {
    return true; // unknown → treat as paused (safer for a Tier-3 send)
  }
}

/**
 * May automated code SEND on this channel right now, with no human in the loop?
 * AND-combines every relevant guard:
 *   - the master automation pause (automation config `paused`);
 *   - the director-outreach pause (a governance kill switch for messaging);
 *   - the per-channel auto-send setting (autoSendEmail / autoSendWhatsapp / autoSendSms).
 *
 * Returns false the moment ANY guard says no. Fails CLOSED on error (a Tier-3
 * send should not slip through on a DB hiccup). NOTE: this is a permission gate
 * only — it does NOT check that a provider is configured; callers still need a
 * live email/WhatsApp/SMS transport (e.g. getEmailConfig()) to actually send.
 */
export async function canAutoSend(channel: SendChannel): Promise<boolean> {
  try {
    const settings = await getAppSettings();
    const perChannel =
      channel === "email" ? settings.autoSendEmail
      : channel === "whatsapp" ? settings.autoSendWhatsapp
      : settings.autoSendSms;
    if (!perChannel) return false;

    const config = await getAutomationConfig();
    if (config.paused) return false;

    // All current channels are outreach/messaging, so the outreach pause applies
    // to every one of them.
    if (await isOutreachPaused()) return false;

    return true;
  } catch {
    return false; // fail closed
  }
}

// --- Tier-3 DELETE policy --------------------------------------------------
//
// Policy: automated paths NEVER hard-delete. They archive (a reversible, undoable
// state change) so nothing the system does on its own is unrecoverable. Only an
// explicit human action may hard-delete. Code that is about to delete on behalf of
// an automation should call assertReversibleAutoAction() first — it throws if the
// owner has not deliberately disabled the safeguard (autoHardDeleteForbidden).

export const AUTO_HARD_DELETE_FORBIDDEN = "auto-hard-delete-forbidden" as const;

/**
 * Guard for automated DELETE paths. Throws unless the owner has explicitly turned
 * OFF the safeguard (settings.autoHardDeleteForbidden = false). Use it to fail
 * loudly in development if an automated path ever tries to hard-delete; the
 * correct automated action is to archive instead.
 *
 * @param action short label of what was about to be hard-deleted, for the error.
 */
export async function assertReversibleAutoAction(action = "record"): Promise<void> {
  let forbidden = true;
  try {
    forbidden = (await getAppSettings()).autoHardDeleteForbidden;
  } catch {
    forbidden = true; // unknown → keep the safeguard ON
  }
  if (forbidden) {
    throw new Error(
      `${AUTO_HARD_DELETE_FORBIDDEN}: automated paths must archive, not hard-delete (${action}).`,
    );
  }
}
