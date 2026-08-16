import { NextResponse } from "next/server";
import { getSavedViewsFor, setSavedViewsFor, type SavedView } from "@/lib/saved-views";

/**
 * Saved views for ANY list — `?list=task` | `document` | `asset` | `vendor` |
 * `commitment`. Replaces the task-only `/api/prefs/task-views`; the settings key
 * is unchanged (`<list>.savedViews`), so views the owner already saved on Tasks
 * are read back by this route without a migration.
 */

export const dynamic = "force-dynamic";

/** Keep the key a plain slug — it becomes a settings row name. */
const LIST_KEY = /^[a-z][a-z0-9_-]{0,31}$/;

function listKeyOf(req: Request): string | null {
  const key = new URL(req.url).searchParams.get("list") ?? "task";
  return LIST_KEY.test(key) ? key : null;
}

export async function GET(req: Request) {
  const listKey = listKeyOf(req);
  if (!listKey) return NextResponse.json({ error: "bad list key" }, { status: 400 });
  return NextResponse.json({ views: await getSavedViewsFor(listKey) });
}

export async function PUT(req: Request) {
  const listKey = listKeyOf(req);
  if (!listKey) return NextResponse.json({ error: "bad list key" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const raw = body?.views;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "views must be array" }, { status: 400 });

  const views: SavedView[] = raw.filter(
    (v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string"
  );
  await setSavedViewsFor(listKey, views);
  return NextResponse.json({ views });
}
