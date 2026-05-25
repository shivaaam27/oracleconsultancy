"use server";

import { db, schema } from "@/db";
import { parseCapture, type ParsedCapture } from "@/lib/smart-parse";

export async function parseRawCapture(raw: string): Promise<ParsedCapture> {
  const companies = await db
    .select({ id: schema.companies.id, name: schema.companies.name, code: schema.companies.code })
    .from(schema.companies);
  const people = await db
    .select({ id: schema.people.id, name: schema.people.name })
    .from(schema.people);
  return parseCapture(raw, companies, people);
}
