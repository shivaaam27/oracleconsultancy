import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function insertTaskWithUniqueCode(
  companyId: number,
  codePrefix: string,
  values: Omit<typeof schema.tasks.$inferInsert, "code" | "companyId">,
): Promise<typeof schema.tasks.$inferSelect> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.select({ code: schema.tasks.code }).from(schema.tasks).where(eq(schema.tasks.companyId, companyId));
    let maxNum = 0;
    for (const e of existing) {
      const m = e.code.match(/^[A-Z]+\d+-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    const newCode = `${codePrefix}-${String(maxNum + 1 + attempt).padStart(3, "0")}`;
    try {
      const [row] = await db.insert(schema.tasks).values({ ...values, companyId, code: newCode }).returning();
      return row;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/duplicate key|unique/i.test(msg)) throw err;
    }
  }
  throw new Error("Could not allocate unique task code after retries");
}
