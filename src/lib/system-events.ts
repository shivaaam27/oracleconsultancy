import { db, schema } from "@/db";
import { desc, eq, and } from "drizzle-orm";

export type EventStatus = "ok" | "error" | "skip";

export async function recordEvent(
  kind: string,
  status: EventStatus,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(schema.systemEvents).values({
      kind,
      status,
      details: details ? JSON.stringify(details) : null,
      createdAt: new Date(),
    });
  } catch {
    // Telemetry must never crash the caller.
  }
}

export async function lastEvent(kind: string): Promise<{ at: Date; status: string } | null> {
  const rows = await db
    .select({ createdAt: schema.systemEvents.createdAt, status: schema.systemEvents.status })
    .from(schema.systemEvents)
    .where(eq(schema.systemEvents.kind, kind))
    .orderBy(desc(schema.systemEvents.createdAt))
    .limit(1);
  if (!rows.length) return null;
  return { at: rows[0].createdAt, status: rows[0].status };
}

export async function lastSuccessfulEvent(kind: string): Promise<Date | null> {
  const rows = await db
    .select({ createdAt: schema.systemEvents.createdAt })
    .from(schema.systemEvents)
    .where(and(eq(schema.systemEvents.kind, kind), eq(schema.systemEvents.status, "ok")))
    .orderBy(desc(schema.systemEvents.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}
