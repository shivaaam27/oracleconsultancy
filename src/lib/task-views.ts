import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export type SavedView = { id: string; name: string; query: string };

const KEY = "task.savedViews";

export async function getSavedViews(): Promise<SavedView[]> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const raw = rows[0]?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter(
        (v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.query === "string"
      );
  } catch {}
  return [];
}
