import "server-only";
import { sb } from "@/db/supabase";
import { splitIntoPassages, searchPassages, type Passage, type PassageHit } from "@/lib/doc-passages-core";

/* Server wrappers for the document passage layer. The pure split/search logic
 * lives in doc-passages-core.ts (client-safe, tested); these just read a filed
 * document's already-stored body (documents.extracted_text) — no new table. */

export type { Passage, PassageHit } from "@/lib/doc-passages-core";
export { splitIntoPassages, searchPassages } from "@/lib/doc-passages-core";

/** Read a filed document's stored body and return its located passages. */
export async function getDocumentPassages(documentId: number): Promise<Passage[]> {
  const { data } = await sb.from("documents").select("extracted_text").eq("id", documentId).maybeSingle();
  return splitIntoPassages((data?.extracted_text as string | null) ?? "");
}

/** Convenience: fetch a document's passages and keyword-search within them (AI-free). */
export async function searchDocumentPassages(documentId: number, query: string, limit = 4): Promise<PassageHit[]> {
  return searchPassages(await getDocumentPassages(documentId), query, limit);
}
