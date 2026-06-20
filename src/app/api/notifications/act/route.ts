import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";
import { getPortalPerson } from "@/lib/portal-auth";
import { personRecipient } from "@/lib/notifications";

/* ------------------------------------------------------------------ *
 * Actionable push-notification endpoint.
 *
 * The service worker (public/sw.js) shows "Open · Mark done · Snooze"
 * buttons on a push. "Open" deep-links as usual; "done" and "snooze"
 * POST here so the action lands even when no app window is open
 * (the SW can fetch from the background).
 *
 * Strictly Tier-1/Tier-2 only: this NEVER sends, spends or deletes
 * anything destructive. "done" just marks the in-app notification read;
 * "snooze" resurfaces it later. Everything is best-effort and scoped to
 * the caller's own recipient, so one user can never touch another's
 * notifications.
 *
 * Excluded from the admin edge gate via the api/notifications matcher in
 * src/proxy.ts — it verifies the session itself below.
 * ------------------------------------------------------------------ */

const SNOOZE_KEY = "notifications.snoozed";
const DEFAULT_SNOOZE_MS = 60 * 60 * 1000; // 1 hour

type SnoozeEntry = { recipient: string; id: number; until: string };

async function resolveRecipient(): Promise<string | null> {
  if (await isAdminSession()) return "admin";
  const me = await getPortalPerson();
  return me ? personRecipient(me.id) : null;
}

/** Mark one notification read, scoped to its recipient. Best-effort. */
async function markRead(recipient: string, id: number): Promise<void> {
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient", recipient)
    .eq("id", id)
    .is("read_at", null);
}

/** Resurface a notification later. With no schema column for a per-row
 *  snooze-until, we keep it dead simple: clear read_at so it shows in the
 *  bell again, and record a lightweight marker in the key-value settings
 *  store so a future cron run could re-ping it. If nothing consumes the
 *  marker, the unread-resurface alone still gives the user a "later"
 *  signal next time they open the app. */
async function snooze(recipient: string, id: number): Promise<void> {
  await sb
    .from("notifications")
    .update({ read_at: null })
    .eq("recipient", recipient)
    .eq("id", id);

  const until = new Date(Date.now() + DEFAULT_SNOOZE_MS).toISOString();
  try {
    const { data } = await sb.from("settings").select("value").eq("key", SNOOZE_KEY).maybeSingle();
    let list: SnoozeEntry[] = [];
    const raw = (data?.value as string | null) ?? null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed as SnoozeEntry[];
      } catch {
        /* corrupt value — start fresh */
      }
    }
    // Drop any existing marker for this notification + any that have lapsed,
    // so the store never grows unbounded.
    const now = Date.now();
    list = list.filter(
      (e) => e && e.id !== id && e.until && new Date(e.until).getTime() > now
    );
    list.push({ recipient, id, until });
    await sb.from("settings").upsert({ key: SNOOZE_KEY, value: JSON.stringify(list) }, { onConflict: "key" });
  } catch {
    /* settings write is best-effort — the unread resurface above is enough */
  }
}

export async function POST(req: NextRequest) {
  const recipient = await resolveRecipient();
  if (!recipient) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { id?: unknown; action?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate empty/garbled body */
  }

  const id = Number(body.id);
  const action = typeof body.action === "string" ? body.action : "";
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, message: "missing id" }, { status: 400 });
  }

  try {
    if (action === "done") {
      await markRead(recipient, id);
    } else if (action === "snooze") {
      await snooze(recipient, id);
    } else {
      return NextResponse.json({ ok: false, message: "unknown action" }, { status: 400 });
    }
  } catch {
    // Best-effort: never surface an error to the background SW fetch.
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
