import "server-only";
import { sb } from "@/db/supabase";
import { createNotification, personRecipient, type NotifKind } from "@/lib/notifications";

/**
 * ORI WATCHERS — event-driven "tell me the moment X happens" alerts.
 *
 * A watcher is a standing rule stored in `automation_rules` with kind="watch".
 * Unlike the time-driven automations (evaluated by the /api/cron/ori-automations
 * tick), watchers are EVENT-DRIVEN: they piggyback on the per-write index hook
 * (src/lib/index-hooks.ts → reindexEntity), which already fires on EVERY
 * create/update across the 12 indexed entity types. After a row is re-indexed we
 * call evaluateWatchers(type, id), which loads the watch rules for that type,
 * reads the just-written row and fires a notification the instant the condition
 * flips to true. No new plumbing, no cron, no AI tokens.
 *
 * WHY task_id is always null: the automations cron loads EVERY active/undone rule
 * and, for task-bound rules, will deactivate them if their task is archived and
 * stamp last_run_at on each tick. To keep watchers 100% insulated from that cron
 * we NEVER bind a watch rule to a task (`task_id` stays null); the cron then hits
 * its `if (!taskId) continue` guard and skips watch rules entirely. All scope
 * (company, which task) lives in `config`.
 *
 * DEDUPE: a watcher must fire ONCE per distinct event, never on every subsequent
 * re-index of the same already-true row. We compute a stable `lastFiredKey` from
 * the current row state (e.g. "task:57:Blocked") and store it on the rule; if the
 * key is unchanged since we last fired, we stay quiet. When the row changes state
 * and later returns to the watched state (a NEW event), the key changes and we
 * fire again.
 *
 * BEST-EFFORT: every path here is wrapped so a watcher error can NEVER block or
 * throw into the write path. evaluateWatchers is safe to fire-and-forget.
 *
 * ── ADDING A NEW CONDITION KIND ──────────────────────────────────────────────
 * 1. Add it to WatchCondition below.
 * 2. Add a `case` in evaluateWatchers' switch that: reads the light row, decides
 *    whether the condition is TRUE now, and (if so) returns a { key, title, body }
 *    describing the event. Keep the read a single light select.
 * 3. If it applies to a new entity type, add that type to WATCHED_TYPES so the
 *    index hook routes its writes here.
 * Everything else (dedupe, notify, create/list/delete) is generic.
 */

/** Entity types a watcher can currently observe. The index hook only routes these
 *  to evaluateWatchers (every other type is skipped cheaply). */
export const WATCHED_TYPES = new Set(["task", "document"]);

export type WatchCondition =
  | "task_status_becomes" // config.value = the target status (e.g. "Blocked", "Escalated")
  | "task_overdue" // a task passes its deadline while still open
  | "document_expiring"; // a tracked document is within config.daysBefore of expiry

export type WatchConfig = {
  entityType: "task" | "document";
  condition: WatchCondition;
  value?: string; // task_status_becomes: the target status
  companyId?: number; // optional scope — only fire for this company
  daysBefore?: number; // document_expiring: lead time in days (default 14)
  notifyPersonId?: number | null; // who to alert; null/absent → the owner ("admin")
  label?: string; // human summary, shown in list_watchers
  lastFiredKey?: string; // dedupe fingerprint of the last event we fired for
};

export type WatchRuleRow = { id: number; config: WatchConfig };

const OPEN_STATUSES = new Set([
  "Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated",
]);
const isOpen = (status: string) => status !== "Completed" && status !== "Closed";

/** The recipient for a watcher's alert ("admin" or "person:<id>"). */
function watchRecipient(cfg: WatchConfig): string {
  return typeof cfg.notifyPersonId === "number" ? personRecipient(cfg.notifyPersonId) : "admin";
}

/* ------------------------------- CRUD ----------------------------------- */

/** Create a watcher. Returns the new rule id, or null on failure. Best-effort. */
export async function createWatcher(config: WatchConfig): Promise<number | null> {
  try {
    const { data, error } = await sb.from("automation_rules").insert({
      task_id: null, company_id: config.companyId ?? null, kind: "watch",
      config, active: true, done: false, created_by: "ai-command",
      created_at: new Date().toISOString(),
    }).select("id").single();
    return error ? null : (data.id as number);
  } catch {
    return null;
  }
}

/** List active watchers (most recent first). Best-effort → [] on error. */
export async function listWatchers(): Promise<WatchRuleRow[]> {
  try {
    const { data } = await sb.from("automation_rules")
      .select("id,config")
      .eq("kind", "watch").eq("active", true)
      .order("created_at", { ascending: false })
      .limit(200);
    return ((data ?? []) as { id: number; config: WatchConfig }[]).map((r) => ({ id: r.id, config: r.config }));
  } catch {
    return [];
  }
}

/** Delete (deactivate) a watcher — soft, so undo can revive it. Returns ok. */
export async function deleteWatcher(id: number): Promise<boolean> {
  try {
    const { error } = await sb.from("automation_rules").update({ active: false }).eq("id", id).eq("kind", "watch");
    return !error;
  } catch {
    return false;
  }
}

/* --------------------------- the evaluator ------------------------------ */

/** One decision: the condition is TRUE now, described by a stable dedupe `key`
 *  plus the notification copy. `null` = condition not met this event. */
type WatchHit = { key: string; title: string; body: string } | null;

/**
 * Event hook: after `type` row `id` is written+indexed, check every active watcher
 * for that type and fire a notification the instant a condition NEWLY becomes true.
 * Best-effort and fire-and-forget: swallows every error, never throws.
 */
export async function evaluateWatchers(type: string, id: number): Promise<void> {
  try {
    if (!id || !WATCHED_TYPES.has(type)) return;

    const { data: rules } = await sb.from("automation_rules")
      .select("id,config")
      .eq("kind", "watch").eq("active", true)
      .limit(500);
    const rows = ((rules ?? []) as { id: number; config: WatchConfig }[])
      .filter((r) => r.config?.entityType === type);
    if (rows.length === 0) return;

    for (const r of rows) {
      const cfg = r.config;
      let hit: WatchHit = null;

      switch (cfg.condition) {
        case "task_status_becomes":
        case "task_overdue": {
          const { data: t } = await sb.from("tasks")
            .select("id,code,company_id,status,deadline,archived")
            .eq("id", id).maybeSingle();
          if (!t || (t as { archived?: boolean }).archived) break;
          const row = t as { code: string; company_id: number | null; status: string; deadline: string | null };
          if (typeof cfg.companyId === "number" && row.company_id !== cfg.companyId) break;

          if (cfg.condition === "task_status_becomes") {
            const want = (cfg.value ?? "").trim();
            if (want && row.status === want) {
              hit = {
                key: `task:${id}:${row.status}`,
                title: `${row.code} is now ${row.status}`,
                body: `You asked to be told the moment this happened.`,
              };
            }
          } else {
            // task_overdue — past its deadline AND still open.
            const dl = row.deadline ? new Date(row.deadline).getTime() : NaN;
            if (Number.isFinite(dl) && dl < Date.now() && isOpen(row.status)) {
              hit = {
                key: `task:${id}:overdue:${row.deadline}`,
                title: `${row.code} is overdue`,
                body: `The deadline has passed and it's still ${row.status}.`,
              };
            }
          }
          break;
        }

        case "document_expiring": {
          const { data: doc } = await sb.from("documents")
            .select("id,title,company_id,expiry_date,archived")
            .eq("id", id).maybeSingle();
          if (!doc) break;
          const row = doc as {
            title: string | null; company_id: number | null;
            expiry_date: string | null; archived: boolean | null;
          };
          // A document expires iff the owner typed an expiry date on it.
          if (row.archived || !row.expiry_date) break;
          if (typeof cfg.companyId === "number" && row.company_id !== cfg.companyId) break;
          const daysBefore = Math.max(0, Math.round(cfg.daysBefore ?? 14));
          const exp = new Date(row.expiry_date).getTime();
          if (!Number.isFinite(exp)) break;
          const soonFrom = exp - daysBefore * 86_400_000;
          if (Date.now() >= soonFrom) {
            const dayKey = row.expiry_date.slice(0, 10);
            const past = Date.now() >= exp;
            hit = {
              key: `document:${id}:expiring:${dayKey}`,
              title: `${row.title || "A document"} ${past ? "has expired" : "is expiring soon"}`,
              body: past ? `Its expiry date (${dayKey}) has passed.` : `It expires on ${dayKey}.`,
            };
          }
          break;
        }
      }

      if (!hit) continue;
      // DEDUPE: same event already fired → stay quiet.
      if (cfg.lastFiredKey === hit.key) continue;

      // Fire: notification (writes the in-app row + best-effort phone push) then
      // stamp the dedupe key so this exact event never double-fires.
      await createNotification({
        recipient: watchRecipient(cfg),
        kind: watchNotifKind(cfg.condition),
        title: hit.title,
        body: hit.body,
        actor: "ORI",
      });
      await sb.from("automation_rules")
        .update({ config: { ...cfg, lastFiredKey: hit.key }, last_fired_at: new Date().toISOString() })
        .eq("id", r.id);
    }
  } catch {
    /* best-effort: a watcher must NEVER break or block the write path */
  }
}

/** Map a condition to a notification kind (drives criticality + deep-link). */
function watchNotifKind(condition: WatchCondition): NotifKind {
  // Task events are operational alerts the owner shouldn't miss; expiry is a
  // routine heads-up. (isCritical() in push.ts treats "assigned" as routine and
  // has no "overdue" NotifKind, so we use the closest safe existing kinds.)
  return condition === "document_expiring" ? "announcement" : "assigned";
}

/** True if `status` is a valid open task status — used to validate a watcher value. */
export function isOpenTaskStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}
