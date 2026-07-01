import { sb } from "@/db/supabase";
import type { AiJob } from "./ai-jobs";

/**
 * agent-context.ts — gathers the CONTEXT a Claude Code cloud agent needs to do a
 * job, WITHOUT any API call (memory/cloud_agent_plan.md). The agent's own
 * intelligence does the reasoning; this just hands it the right facts.
 *
 * `agent-next.ts` prints gatherContext(job) as JSON; the agent reads it, thinks,
 * then submits a result via `agent-complete.ts` → agent-apply.ts.
 */

export type AgentContext = {
  job: AiJob;
  /** Plain-English instruction telling the agent exactly what to produce. */
  instruction: string;
  /** The facts the agent should reason over. Kept lean — not the whole DB. */
  context: Record<string, unknown>;
  /** The exact JSON shape the agent must return (so agent-apply can act on it). */
  resultShape: string;
};

/** Small, cheap "known records" every kind can use to resolve names → ids. */
async function knownRecords() {
  const [{ data: companies }, { data: people }] = await Promise.all([
    sb.from("companies").select("id,name,code_prefix,tin,vrn").eq("active", true),
    sb.from("people").select("id,name,role,company_id").eq("active", true),
  ]);
  return {
    companies: (companies ?? []).map((c) => ({ id: c.id, name: c.name, prefix: c.code_prefix, tin: c.tin, vrn: c.vrn })),
    people: (people ?? []).map((p) => ({ id: p.id, name: p.name, role: p.role, companyId: p.company_id })),
  };
}

export async function gatherContext(job: AiJob): Promise<AgentContext> {
  switch (job.kind) {
    case "ask":
      return gatherAsk(job);
    case "extract":
      return gatherExtract(job);
    case "action":
      return gatherAction(job);
    default:
      return { job, instruction: `Unknown job kind "${job.kind}".`, context: {}, resultShape: "{}" };
  }
}

/** ASK — answer a question over the owner's data (read-only). */
async function gatherAsk(job: AiJob): Promise<AgentContext> {
  const question = String(job.payload.question ?? job.payload.text ?? "").trim();
  const { unifiedSearch } = await import("@/lib/search");
  const hits = question ? await unifiedSearch(question, 8, false) : [];
  return {
    job,
    instruction:
      "Answer the QUESTION using ONLY the search results and known records below. " +
      "Cite task codes (e.g. DS-001) and document/meeting titles you rely on. " +
      "If the answer isn't in the data, say so plainly — never invent facts. British English.",
    context: { question, searchResults: hits, ...(await knownRecords()) },
    resultShape: '{ "answer": "<plain-English answer with citations>", "usedIds": [<entity ids you relied on>] }',
  };
}

/** EXTRACT — read a document (incl. scanned images, replacing the Groq vision
 *  path) and return structured fields, owner-resolved. */
async function gatherExtract(job: AiJob): Promise<AgentContext> {
  const documentId = Number(job.payload.documentId ?? 0) || null;
  let doc: Record<string, unknown> | null = null;
  let imageUrl: string | null = (job.payload.imageRef as string | null) ?? null;
  if (documentId) {
    const { data } = await sb
      .from("documents")
      .select("id,title,category,doc_type,notes,storage_path,file_name,company_id,person_id")
      .eq("id", documentId)
      .maybeSingle();
    doc = data ?? null;
    // Fresh signed URL so the agent can READ the scanned image/PDF itself — this is
    // the ORI replacement for the (retiring) Groq vision OCR path.
    if (!imageUrl && data?.storage_path) {
      const { signDocumentFile } = await import("@/lib/documents");
      imageUrl = await signDocumentFile(data.storage_path as string, 900);
    }
  }
  return {
    job,
    instruction:
      "Read the document and return its key fields, resolving the OWNER from the KNOWN " +
      "RECORDS (match on TIN/VRN/alias/legal name — never invent an owner; leave ids null " +
      "if unsure). If `imageRef` is a URL, it's a scan/photo: download it (e.g. `curl -sL " +
      "\"<url>\" -o /tmp/doc`) and Read that file to transcribe and extract. If `text` is " +
      "provided, use it. Put a one-line summary of the contents in `notes`.",
    context: {
      document: doc,
      text: job.payload.text ?? null,
      imageRef: imageUrl,
      ...(await knownRecords()),
    },
    resultShape:
      '{ "title": string, "category": string|null, "docType": string|null, "issuer": string|null, ' +
      '"referenceNo": string|null, "issueDate": "YYYY-MM-DD"|null, "expiryDate": "YYYY-MM-DD"|null, ' +
      '"companyId": number|null, "personId": number|null, "notes": string|null }',
  };
}

/** ACTION — turn a natural-language request into ONE structured action. */
async function gatherAction(job: AiJob): Promise<AgentContext> {
  const request = String(job.payload.request ?? job.payload.text ?? "").trim();
  return {
    job,
    instruction:
      "Turn the REQUEST into exactly ONE structured action. Resolve any names to ids from " +
      "KNOWN RECORDS. Choose `action` from: create_meeting | create_task | create_reminder. " +
      "Return null ids you cannot resolve confidently. Dates as ISO. British English.",
    context: { request, today: new Date().toISOString().slice(0, 10), ...(await knownRecords()) },
    resultShape:
      '{ "action": "create_meeting"|"create_task"|"create_reminder", ' +
      '"meeting": { "title": string, "companyId": number|null, "meetingDate": ISO, "attendees": string|null, "rawNotes": string }|null, ' +
      '"task": { "companyId": number, "actionItem": string, "deadline": ISO|null, "ownerId": number|null, "priority": string|null }|null, ' +
      '"reminder": { "personId": number, "taskId": number|null, "channel": "email"|"whatsapp", "note": string|null }|null }',
  };
}
