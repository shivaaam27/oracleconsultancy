import "dotenv/config";
import * as XLSX from "xlsx";
import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";

const XLSX_PATH = process.env.XLSX_PATH || "C:/Users/User/Downloads/Chief Of Staff Workflow - Live.xlsx";

const COMPANIES: { name: string; code: string }[] = [
  { name: "Dar Spices", code: "CO01" },
  { name: "Cocozuri Chocolat", code: "CO02" },
  { name: "Terra Green", code: "CO03" },
  { name: "Oracle Consultancy", code: "CO04" },
  { name: "PES Ltd", code: "CO05" },
  { name: "MES Ltd", code: "CO06" },
  { name: "Pamoja Plus", code: "CO07" },
];

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function splitNames(v: unknown): string[] {
  const raw = s(v);
  if (!raw) return [];
  return raw
    .split(/,| & | and /i)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function getOrCreatePerson(name: string, companyId?: number): Promise<number> {
  const existing = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  const [row] = await db.insert(schema.people).values({ name, companyId, active: true }).returning();
  return row.id;
}

async function getOrCreateDept(name: string | null): Promise<number | null> {
  if (!name) return null;
  const existing = await db.select().from(schema.departments).where(eq(schema.departments.name, name)).limit(1);
  if (existing.length) return existing[0].id;
  const [row] = await db.insert(schema.departments).values({ name }).returning();
  return row.id;
}

async function main() {
  console.log(`Reading ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });

  // 1. Companies
  console.log("\n== Companies ==");
  const companyIds: Record<string, number> = {};
  for (const c of COMPANIES) {
    const existing = await db.select().from(schema.companies).where(eq(schema.companies.name, c.name)).limit(1);
    if (existing.length) {
      companyIds[c.name] = existing[0].id;
    } else {
      const [row] = await db.insert(schema.companies).values({ ...c, active: true }).returning();
      companyIds[c.name] = row.id;
    }
    console.log(`  ${c.code} ${c.name}`);
  }

  // 2. People Directory
  console.log("\n== People Directory ==");
  const pdSheet = wb.Sheets["_People Directory"];
  if (pdSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(pdSheet, { defval: null });
    let count = 0;
    for (const r of rows) {
      const name = s(r["Name"]);
      if (!name) continue;
      const companyName = s(r["Company"]);
      const companyId = companyName && companyIds[companyName] ? companyIds[companyName] : undefined;
      const existing = await db.select().from(schema.people).where(eq(schema.people.name, name)).limit(1);
      const data = {
        name,
        email: s(r["Email"]),
        phone: s(r["Phone Number"]),
        whatsapp: s(r["WhatsApp Number"]),
        preferredChannel: s(r["Preferred Channel"]),
        role: s(r["Role"]),
        companyId,
        contactStatus: s(r["Contact Status"]),
        active: r["Active"] === false ? false : true,
        notes: s(r["Notes"]),
      };
      if (existing.length) {
        await db.update(schema.people).set(data).where(eq(schema.people.id, existing[0].id));
      } else {
        await db.insert(schema.people).values(data);
      }
      count++;
    }
    console.log(`  ${count} people imported`);
  }

  // 3. Tasks per company
  console.log("\n== Tasks ==");
  for (const c of COMPANIES) {
    const sheet = wb.Sheets[c.name];
    if (!sheet) {
      console.log(`  ${c.name}: SHEET MISSING, skipping`);
      continue;
    }
    // Headers are in row 2 → tell sheet_to_json to use range
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 1, defval: null });
    let count = 0;
    for (const r of rows) {
      const code = s(r["ID"]);
      const action = s(r["Action Item"]);
      if (!action) continue;
      const finalCode = code && code.match(/^CO\d+-\d+$/) ? code : `${c.code}-${String(count + 1).padStart(3, "0")}`;
      const deptId = await getOrCreateDept(s(r["Department"]));
      const ownerName = s(r["Owner"]);
      const ownerId = ownerName ? await getOrCreatePerson(ownerName, companyIds[c.name]) : null;

      const taskData = {
        code: finalCode,
        companyId: companyIds[c.name],
        departmentId: deptId,
        meetingDate: toDate(r["Meeting Date"]),
        actionItem: action,
        ownerId,
        createdDate: toDate(r["Created Date"]),
        deadline: toDate(r["Deadline"]),
        status: s(r["Status"]) || "Not Started",
        priority: s(r["Priority"]) || "Low",
        category: s(r["Category"]),
        risk: s(r["Risk"]),
        escalation: s(r["Escalation"]) || "No",
        comments: s(r["Comments"]),
        latestUpdate: s(r["Latest Update"]),
        lastUpdatedAt: toDate(r["Last Updated"]),
        closedDate: toDate(r["Closed Date"]),
        archived: false,
      };

      const existing = await db.select().from(schema.tasks).where(eq(schema.tasks.code, finalCode)).limit(1);
      let taskId: number;
      if (existing.length) {
        await db.update(schema.tasks).set(taskData).where(eq(schema.tasks.id, existing[0].id));
        taskId = existing[0].id;
        await db.delete(schema.taskAssignees).where(eq(schema.taskAssignees.taskId, taskId));
      } else {
        const [row] = await db.insert(schema.tasks).values(taskData).returning();
        taskId = row.id;
      }

      // Assignees from Accountable column
      const accountables = splitNames(r["Accountable"]);
      for (const name of accountables) {
        const personId = await getOrCreatePerson(name, companyIds[c.name]);
        try {
          await db.insert(schema.taskAssignees).values({ taskId, personId });
        } catch {}
      }
      count++;
    }
    console.log(`  ${c.name}: ${count} tasks`);
  }

  // 4. Settings
  console.log("\n== Settings ==");
  const sSheet = wb.Sheets["_Settings"];
  if (sSheet) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sSheet, { defval: null });
    let count = 0;
    for (const r of rows) {
      const key = s(r["Setting"]);
      if (!key) continue;
      const value = r["Value"] === null ? null : String(r["Value"]);
      const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
      if (existing.length) {
        await db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key));
      } else {
        await db.insert(schema.settings).values({ key, value });
      }
      count++;
    }
    console.log(`  ${count} settings imported`);
  }

  console.log("\n✓ Import complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
