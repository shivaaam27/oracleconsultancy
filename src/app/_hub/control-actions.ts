"use server";

// Administrator control levers — the one-tap switches the owner pulls from the
// home cockpit. Each mirrors a setting that otherwise lives only in /settings, so
// the operator can hold or release the whole operation without leaving home.

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { saveAppSettings } from "@/lib/settings";

type ToggleResult = { ok: true } | { ok: false; error: string };

/** Master pause for all email automation (task reminders, renewals, the brief…). */
export async function setAutomationPausedAction(paused: boolean): Promise<ToggleResult> {
  try {
    const { saveAutomationConfig } = await import("@/lib/automation");
    await saveAutomationConfig({ paused });
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not change automation" };
  }
}

/** Governance kill switch: pause/resume all director outreach (messages). Mirrors
 *  setDirectorOutreach in settings/actions.ts — keep the key in lockstep. */
export async function setDirectorOutreachPausedAction(paused: boolean): Promise<ToggleResult> {
  try {
    await sb
      .from("settings")
      .upsert({ key: "director.outreachPaused", value: paused ? "1" : "0" }, { onConflict: "key" });
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not change director outreach" };
  }
}

/** The AI (ORI) master switch — when off, every AI path degrades to manual/rule. */
export async function setAiEnabledAction(enabled: boolean): Promise<ToggleResult> {
  try {
    await saveAppSettings({ aiEnabled: enabled });
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not change AI" };
  }
}

/** Email test mode — when on, all automation email is redirected to the owner. */
export async function setEmailTestModeAction(on: boolean): Promise<ToggleResult> {
  try {
    await sb.from("settings").upsert({ key: "email.testMode", value: on ? "1" : "0" }, { onConflict: "key" });
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not change test mode" };
  }
}

type RunResult = { ok: true; message: string } | { ok: false; error: string };

/** Fire all enabled automation categories right now (ignores send-window + the
 *  once-a-day guard; still respects the master pause). */
export async function runAutomationsNowAction(): Promise<RunResult> {
  try {
    const { runDueAutomations } = await import("@/lib/automation");
    const summary = await runDueAutomations(new Date(), { force: true });
    revalidatePath("/");
    revalidatePath("/outbox");
    if (!summary.ran) {
      const message =
        summary.reason === "paused"
          ? "Automation is paused — resume it first."
          : "Nothing to run — no categories are switched on.";
      return { ok: true, message };
    }
    const sent = summary.categories.reduce((a, c) => a + c.sent, 0);
    const prepared = summary.categories.reduce((a, c) => a + c.prepared, 0);
    const parts: string[] = [];
    if (sent) parts.push(`${sent} sent`);
    if (prepared) parts.push(`${prepared} prepared`);
    return { ok: true, message: parts.length ? `Automations ran — ${parts.join(", ")}.` : "Automations ran — nothing was due." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not run automations" };
  }
}

/** Email the monthly Director Brief to the owner now (drafts to Outbox if email
 *  isn't wired). */
export async function sendBriefNowAction(): Promise<RunResult> {
  try {
    const { sendDirectorBriefToOwnerNow } = await import("@/lib/director-brief-send");
    const { sent } = await sendDirectorBriefToOwnerNow();
    revalidatePath("/");
    revalidatePath("/outbox");
    return {
      ok: true,
      message: sent ? "Director Brief emailed to you." : "Brief saved to Outbox — open it to send.",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not send the brief" };
  }
}
