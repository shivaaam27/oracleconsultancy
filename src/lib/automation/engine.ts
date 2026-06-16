// The automation engine. Loops the category registry, applying the shared gates
// (master pause → send window → per-category schedule → once-per-day dedupe) and
// running each enabled, due category. The per-category work lives in
// categories/*; this file owns only the orchestration.

import { recordEvent } from "@/lib/system-events";
import type { AutomationRunSummary } from "./types";
import { getAutomationConfig } from "./config";
import { REGISTRY } from "./registry";
import { withinSendWindow, alreadyRanToday, markRanToday, makeContext } from "./runtime";

/**
 * Run every category that is enabled + due now. Each daily category runs at most
 * once per EAT day. `force` (manual "run now") ignores the send window + the
 * once-per-day dedupe so the owner can fire a test immediately.
 */
export async function runDueAutomations(now = new Date(), opts: { force?: boolean } = {}): Promise<AutomationRunSummary> {
  const force = opts.force === true;
  const cfg = await getAutomationConfig();
  if (cfg.paused) return { ran: false, reason: "paused", categories: [] };
  if (!force && !withinSendWindow(cfg, now)) return { ran: false, reason: "outside-send-window", categories: [] };

  const ctx = makeContext(cfg, now, force);
  const results: AutomationRunSummary["categories"] = [];

  for (const def of REGISTRY) {
    const rule = cfg.categories[def.key];
    if (rule.mode === "off") continue;
    if (!force) {
      if (!def.scheduledToday(cfg, now)) continue;
      if (await alreadyRanToday(def.key)) continue;
    }

    try {
      const res = await def.run(ctx, rule.mode);
      // Mark ran AFTER a clean run, so a thrown category retries next tick.
      if (!force) await markRanToday(def.key);
      results.push({ category: def.key, mode: rule.mode, ...res });
      await recordEvent(`email.automation.${def.key}`, "ok", { ...res, mode: rule.mode });
    } catch (e) {
      await recordEvent(`email.automation.${def.key}`, "error", { message: e instanceof Error ? e.message : String(e), mode: rule.mode });
    }
  }

  return { ran: results.length > 0, categories: results };
}
