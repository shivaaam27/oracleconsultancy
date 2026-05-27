"use server";

import { sb } from "@/db/supabase";
import { parseCapture, type ParsedCapture } from "@/lib/smart-parse";

export async function parseRawCapture(raw: string): Promise<ParsedCapture> {
  const [{ data: cRows }, { data: pRows }] = await Promise.all([
    sb.from("companies").select("id,name,code"),
    sb.from("people").select("id,name"),
  ]);
  const companies = (cRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string, code: c.code as string }));
  const people = (pRows ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  return parseCapture(raw, companies, people);
}
