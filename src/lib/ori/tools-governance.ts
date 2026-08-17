import "server-only";
import { sb } from "@/db/supabase";
import { str, resolveCompany, resolveDocument, type ToolDef } from "@/lib/ori/tools";
import {
  addCapHolderAction,
  addSignatoryAction,
  addResolutionAction,
  addRiskAction,
  setRiskStatusAction,
  addDecisionAction,
  decideDecisionAction,
} from "@/app/governance/actions";
import {
  createPipelineItemAction,
  movePipelineStageAction,
  updatePipelineItemAction,
  archivePipelineItemAction,
  linkPipelineDocumentAction,
} from "@/app/hrms/pipeline/actions";
import {
  createCommitmentAction,
  updateCommitmentAction,
  archiveCommitmentAction,
  linkCommitmentDocumentAction,
} from "@/app/hrms/commitments/actions";
import { PIPELINE_STAGES, normalizeStage, type PipelineStage } from "@/lib/pipeline-shared";
import type { CommitmentKind } from "@/lib/commitments-shared";

/* ---------------------------------------------------------------------------
 * Governance / Pipeline / Commitments domain tools for ORI.
 *
 * Each tool REUSES an existing server action — no raw DB writes. Tiers are honest:
 *   1 read · 2 internal write · 3 send/spend/delete/publish/access/settings.
 * Undo specs are emitted only where a clean inverse exists AND a handle to reverse
 * the step is available; the matching undo-handler kinds (ori.risk.status,
 * ori.pipeline.stage/update/archive/link, ori.commitment.update/archive/link) live
 * in src/lib/undo-handlers/ori.ts (a sibling registers them — this file only emits
 * the spec).
 * ------------------------------------------------------------------------- */

/** Coerce a planner-filled value to a number, or null when blank/unparseable. */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (!s) return null;
  const n = Number(s.replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Match a free-text stage to a known pipeline stage. */
function toStage(v: unknown): PipelineStage {
  return normalizeStage(str(v));
}

/** Match a free-text kind to a known commitment kind (default: contract). */
function toKind(v: unknown): CommitmentKind {
  const s = str(v).toLowerCase();
  if (s.includes("lease") || s.includes("rent") || s.includes("tenan")) return "lease";
  if (s.includes("insur") || s.includes("cover") || s.includes("policy")) return "insurance";
  return "contract";
}

export const GOVERNANCE_TOOLS: ToolDef[] = [
  /* ------------------------------- governance: cap table ---------------- */
  {
    name: "add_cap_holder",
    tier: 3, // touches board-level ownership records — access-sensitive
    description: "Add a shareholder / cap-table holding to a company (governance).",
    params: {
      company: { type: "string", required: true, description: "The company — its name." },
      holder: { type: "string", required: true, description: "The shareholder's name." },
      shares: { type: "number", required: false, description: "Number of shares held." },
      pct: { type: "number", required: false, description: "Percentage of the company held." },
      holderType: { type: "string", required: false, description: "Kind of holder, e.g. Individual, Company, Trust." },
    },
    async run(args) {
      const company = await resolveCompany(str(args.company));
      if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
      const holder = str(args.holder);
      if (!holder) return { ok: false, message: "Give the shareholder a name." };
      const res = await addCapHolderAction(company.id, holder, num(args.shares), num(args.pct), str(args.holderType) || null);
      if (!res.ok) return { ok: false, message: "Couldn't add the shareholder. Please try again." };
      return { ok: true, message: `Added ${holder} to ${company.name}'s cap table.`, redirect: `/companies/${company.id}` };
    },
  },

  /* ------------------------------- governance: signatories -------------- */
  {
    name: "add_signatory",
    tier: 3, // authorised-signatory record — access-sensitive
    description: "Add an authorised signatory to a company (governance).",
    params: {
      company: { type: "string", required: true, description: "The company — its name." },
      name: { type: "string", required: true, description: "The signatory's name." },
      scope: { type: "string", required: false, description: "Their signing scope, e.g. Bank, Contracts, All." },
    },
    async run(args) {
      const company = await resolveCompany(str(args.company));
      if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
      const name = str(args.name);
      if (!name) return { ok: false, message: "Give the signatory a name." };
      const res = await addSignatoryAction(company.id, name, str(args.scope) || null);
      if (!res.ok) return { ok: false, message: "Couldn't add the signatory. Please try again." };
      return { ok: true, message: `Added ${name} as a signatory for ${company.name}.`, redirect: `/companies/${company.id}` };
    },
  },

  /* ------------------------------- governance: resolutions -------------- */
  {
    name: "add_resolution",
    tier: 3, // board-resolution record — access-sensitive
    description: "Record a board resolution for a company (governance).",
    params: {
      company: { type: "string", required: true, description: "The company — its name." },
      summary: { type: "string", required: true, description: "What the resolution decided." },
      date: { type: "date", required: false, description: "The date it was passed (YYYY-MM-DD)." },
      type: { type: "string", required: false, description: "Kind of resolution, e.g. Board, Shareholder, Special." },
    },
    async run(args) {
      const company = await resolveCompany(str(args.company));
      if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
      const summary = str(args.summary);
      if (!summary) return { ok: false, message: "Say what the resolution decided." };
      const res = await addResolutionAction(company.id, str(args.date) || null, str(args.type) || null, summary);
      if (!res.ok) return { ok: false, message: "Couldn't record the resolution. Please try again." };
      return { ok: true, message: `Recorded a resolution for ${company.name}.`, redirect: `/companies/${company.id}` };
    },
  },

  /* ------------------------------- governance: risks -------------------- */
  {
    name: "add_risk",
    tier: 2,
    description: "Log a portfolio risk (likelihood × impact band).",
    params: {
      code: { type: "string", required: true, description: "A short risk code / reference." },
      title: { type: "string", required: true, description: "The risk in one line." },
      category: { type: "string", required: false, description: "Risk category, e.g. Finance, Legal, Operations." },
      likelihood: { type: "number", required: false, description: "Likelihood score, 1 (low) to 5 (high)." },
      impact: { type: "number", required: false, description: "Impact score, 1 (low) to 5 (high)." },
      owner: { type: "string", required: false, description: "Who owns / manages this risk." },
      mitigation: { type: "string", required: false, description: "The mitigation / control in place." },
    },
    async run(args) {
      const code = str(args.code);
      const title = str(args.title);
      if (!code) return { ok: false, message: "Give the risk a short code." };
      if (!title) return { ok: false, message: "Describe the risk in one line." };
      const res = await addRiskAction({
        code,
        title,
        category: str(args.category) || null,
        likelihood: num(args.likelihood),
        impact: num(args.impact),
        owner: str(args.owner) || null,
        mitigation: str(args.mitigation) || null,
      });
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't log the risk. Please try again." };
      return { ok: true, message: `Logged risk ${code}: ${title}.`, redirect: `/brief` };
    },
  },
  {
    name: "set_risk_status",
    tier: 2,
    description: "Change a risk's status (e.g. Open → Mitigated → Closed).",
    params: {
      risk: { type: "string", required: true, description: "The risk — its code or title." },
      status: { type: "string", required: true, description: "The new status, e.g. Open, Mitigated, Closed." },
    },
    async run(args) {
      const ref = orSafe(str(args.risk));
      const status = str(args.status);
      if (!status) return { ok: false, message: "Give the new status." };
      if (!ref) return { ok: false, message: "Say which risk to update." };
      const { data: r } = await sb
        .from("risks")
        .select("id,code,title,status")
        .or(`code.ilike.${ref},title.ilike.%${ref}%`)
        .limit(1)
        .maybeSingle();
      if (!r) return { ok: false, message: `Couldn't find a risk matching "${ref}".` };
      const res = await setRiskStatusAction(r.id as number, status);
      if (!res.ok) return { ok: false, message: "Couldn't update the risk. Please try again." };
      return {
        ok: true,
        message: `Set ${r.code ?? r.title} to "${status}".`,
        redirect: `/brief`,
        undo: { kind: "ori.risk.status", payload: { riskId: r.id, before: r.status } },
      };
    },
  },

  /* ------------------------------- governance: decisions ---------------- */
  {
    name: "add_decision",
    tier: 2,
    description: "Log a board decision / approval that's pending.",
    params: {
      code: { type: "string", required: true, description: "A short decision code / reference." },
      title: { type: "string", required: true, description: "The decision in one line." },
      company: { type: "string", required: false, description: "The company it concerns (optional — portfolio-wide if blank)." },
      type: { type: "string", required: false, description: "Kind of decision, e.g. Board, Investment, Hiring." },
      context: { type: "string", required: false, description: "Background / why it's needed." },
      due: { type: "date", required: false, description: "When a decision is needed by (YYYY-MM-DD)." },
    },
    async run(args) {
      const code = str(args.code);
      const title = str(args.title);
      if (!code) return { ok: false, message: "Give the decision a short code." };
      if (!title) return { ok: false, message: "Describe the decision in one line." };
      let companyId: number | null = null;
      if (str(args.company)) {
        const company = await resolveCompany(str(args.company));
        if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        companyId = company.id;
      }
      const res = await addDecisionAction({
        code,
        title,
        companyId,
        type: str(args.type) || null,
        context: str(args.context) || null,
        due: str(args.due) || null,
      });
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't log the decision. Please try again." };
      return { ok: true, message: `Logged decision ${code}: ${title}.`, redirect: `/brief` };
    },
  },
  {
    name: "decide_decision",
    tier: 2,
    description: "Record the outcome of a pending board decision.",
    params: {
      decision: { type: "string", required: true, description: "The decision — its code or title." },
      outcome: { type: "string", required: false, description: "The outcome text (defaults to 'Decided')." },
    },
    async run(args) {
      const ref = orSafe(str(args.decision));
      if (!ref) return { ok: false, message: "Say which decision to record." };
      const { data: d } = await sb
        .from("decisions")
        .select("id,code,title,status")
        .or(`code.ilike.${ref},title.ilike.%${ref}%`)
        .limit(1)
        .maybeSingle();
      if (!d) return { ok: false, message: `Couldn't find a decision matching "${ref}".` };
      if (d.status === "Decided") return { ok: false, message: `${d.code ?? d.title} has already been decided.` };
      const res = await decideDecisionAction(d.id as number, str(args.outcome) || "Decided");
      if (!res.ok) return { ok: false, message: "Couldn't record the decision. Please try again." };
      // No undo: decideDecision stamps decided_on with no clean inverse action.
      return { ok: true, message: `Recorded the outcome for ${d.code ?? d.title}.`, redirect: `/brief` };
    },
  },

  /* ------------------------------- pipeline ----------------------------- */
  {
    name: "create_pipeline_item",
    tier: 2,
    description: "Open a new bureaucracy case in the applications pipeline (permit/visa/licence).",
    params: {
      subject: { type: "string", required: true, description: "What / who the application is for." },
      type: { type: "string", required: true, description: "The application type, e.g. Work Permit, Business Licence." },
      company: { type: "string", required: false, description: "The company it belongs to." },
      stage: { type: "string", required: false, description: "Starting stage (default: To Apply)." },
      controlNo: { type: "string", required: false, description: "A control / reference number, if issued." },
      deadline: { type: "date", required: false, description: "The deadline (YYYY-MM-DD)." },
      nextAction: { type: "string", required: false, description: "The next thing to do." },
      owner: { type: "string", required: false, description: "Who's driving the case." },
      notes: { type: "string", required: false, description: "Any notes." },
    },
    async run(args) {
      const subject = str(args.subject);
      const type = str(args.type);
      if (!subject) return { ok: false, message: "Say what the application is for." };
      if (!type) return { ok: false, message: "Give the application a type (e.g. Work Permit)." };
      let companyId: number | null = null;
      if (str(args.company)) {
        const company = await resolveCompany(str(args.company));
        if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        companyId = company.id;
      }
      const res = await createPipelineItemAction({
        subject,
        type,
        companyId,
        stage: str(args.stage) ? toStage(args.stage) : null,
        controlNo: str(args.controlNo) || null,
        deadline: str(args.deadline) || null,
        nextAction: str(args.nextAction) || null,
        owner: str(args.owner) || null,
        notes: str(args.notes) || null,
      });
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't open the case. Please try again." };
      // No undo: the action doesn't return the new id, so there's no clean handle to reverse.
      return { ok: true, message: `Opened a ${type} case: ${subject}.`, redirect: `/hrms/pipeline` };
    },
  },
  {
    name: "move_pipeline_stage",
    tier: 2,
    description: "Move a pipeline case to a different stage (To Apply → … → Issued).",
    params: {
      item: { type: "string", required: true, description: "The case — its id or subject." },
      stage: { type: "string", required: true, description: `The stage to move to (${PIPELINE_STAGES.join(", ")}).` },
    },
    async run(args) {
      const found = await resolvePipelineItem(str(args.item));
      if (!found) return { ok: false, message: `Couldn't find a pipeline case matching "${str(args.item)}".` };
      const stage = toStage(args.stage);
      const res = await movePipelineStageAction(found.id, stage);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't move the case. Please try again." };
      return {
        ok: true,
        message: `Moved "${found.subject}" to ${stage}.`,
        redirect: `/hrms/pipeline`,
        undo: { kind: "ori.pipeline.stage", payload: { itemId: found.id, before: found.stage } },
      };
    },
  },
  {
    name: "update_pipeline_item",
    tier: 2,
    description: "Update fields on a pipeline case (control no., deadline, next action, owner, notes).",
    params: {
      item: { type: "string", required: true, description: "The case — its id or subject." },
      controlNo: { type: "string", required: false, description: "A new control / reference number." },
      deadline: { type: "date", required: false, description: "A new deadline (YYYY-MM-DD)." },
      nextAction: { type: "string", required: false, description: "The next thing to do." },
      owner: { type: "string", required: false, description: "Who's driving the case." },
      notes: { type: "string", required: false, description: "Notes." },
    },
    async run(args) {
      const found = await resolvePipelineItem(str(args.item));
      if (!found) return { ok: false, message: `Couldn't find a pipeline case matching "${str(args.item)}".` };
      const patch: Record<string, unknown> = {};
      if (str(args.controlNo)) patch.controlNo = str(args.controlNo);
      if (str(args.deadline)) patch.deadline = str(args.deadline);
      if (str(args.nextAction)) patch.nextAction = str(args.nextAction);
      if (str(args.owner)) patch.owner = str(args.owner);
      if (str(args.notes)) patch.notes = str(args.notes);
      if (Object.keys(patch).length === 0) return { ok: false, message: "Give me at least one field to change." };
      // Snapshot the fields being changed BEFORE the write, for a clean field-level undo.
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (found.row as Record<string, unknown>)[camelToSnake(k)];
      const res = await updatePipelineItemAction(found.id, patch);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't save your changes. Please try again." };
      return {
        ok: true,
        message: `Updated "${found.subject}".`,
        redirect: `/hrms/pipeline`,
        undo: { kind: "ori.pipeline.update", payload: { itemId: found.id, before } },
      };
    },
  },
  {
    name: "archive_pipeline_item",
    tier: 3, // removes the case from the active board (reversible — un-archive)
    description: "Archive a pipeline case (removes it from the active board; reversible).",
    params: {
      item: { type: "string", required: true, description: "The case — its id or subject." },
    },
    async run(args) {
      const found = await resolvePipelineItem(str(args.item));
      if (!found) return { ok: false, message: `Couldn't find a pipeline case matching "${str(args.item)}".` };
      const res = await archivePipelineItemAction(found.id);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't archive the case. Please try again." };
      return {
        ok: true,
        message: `Archived "${found.subject}".`,
        redirect: `/hrms/pipeline`,
        undo: { kind: "ori.pipeline.archive", payload: { itemId: found.id } },
      };
    },
  },
  {
    name: "link_pipeline_document",
    tier: 2,
    description: "Attach a supporting document to a pipeline case.",
    params: {
      item: { type: "string", required: true, description: "The case — its id or subject." },
      document: { type: "string", required: true, description: "The document — its id or title." },
    },
    async run(args) {
      const found = await resolvePipelineItem(str(args.item));
      if (!found) return { ok: false, message: `Couldn't find a pipeline case matching "${str(args.item)}".` };
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await linkPipelineDocumentAction(found.id, doc.id);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't link the document. Please try again." };
      return {
        ok: true,
        message: `Attached "${doc.title}" to "${found.subject}".`,
        redirect: `/hrms/pipeline`,
        undo: { kind: "ori.pipeline.link", payload: { itemId: found.id, before: found.documentId } },
      };
    },
  },

  /* ------------------------------- commitments -------------------------- */
  {
    name: "create_commitment",
    tier: 2,
    description: "Register a commitment (lease / insurance / contract) with a notice window.",
    params: {
      title: { type: "string", required: true, description: "What the commitment is." },
      kind: { type: "string", required: false, description: "lease, insurance or contract (default: contract)." },
      company: { type: "string", required: false, description: "The company it belongs to." },
      counterparty: { type: "string", required: false, description: "The other party (landlord/insurer/supplier)." },
      reference: { type: "string", required: false, description: "A reference / policy / contract number." },
      startDate: { type: "date", required: false, description: "Start date (YYYY-MM-DD)." },
      endDate: { type: "date", required: false, description: "End date (YYYY-MM-DD)." },
      noticeDays: { type: "number", required: false, description: "Notice period in days (notice-by = end − this)." },
      amount: { type: "string", required: false, description: "The value / rent / premium." },
      note: { type: "string", required: false, description: "Any note." },
    },
    async run(args) {
      const title = str(args.title);
      if (!title) return { ok: false, message: "Give the commitment a title." };
      let companyId: number | null = null;
      if (str(args.company)) {
        const company = await resolveCompany(str(args.company));
        if (!company) return { ok: false, message: `Couldn't find a company matching "${str(args.company)}".` };
        companyId = company.id;
      }
      const res = await createCommitmentAction({
        kind: toKind(args.kind),
        title,
        companyId,
        counterparty: str(args.counterparty) || null,
        reference: str(args.reference) || null,
        startDate: str(args.startDate) || null,
        endDate: str(args.endDate) || null,
        noticeDays: num(args.noticeDays),
        amount: str(args.amount) || null,
        note: str(args.note) || null,
      });
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't register the commitment. Please try again." };
      // No undo: the action doesn't return the new id, so there's no clean handle to reverse.
      return { ok: true, message: `Registered commitment: ${title}.`, redirect: `/hrms/commitments` };
    },
  },
  {
    name: "update_commitment",
    tier: 2,
    description: "Update fields on a commitment (counterparty, reference, dates, notice, amount, note).",
    params: {
      commitment: { type: "string", required: true, description: "The commitment — its id or title." },
      counterparty: { type: "string", required: false, description: "The other party." },
      reference: { type: "string", required: false, description: "Reference / policy / contract number." },
      startDate: { type: "date", required: false, description: "Start date (YYYY-MM-DD)." },
      endDate: { type: "date", required: false, description: "End date (YYYY-MM-DD)." },
      noticeDays: { type: "number", required: false, description: "Notice period in days." },
      amount: { type: "string", required: false, description: "The value / rent / premium." },
      status: { type: "string", required: false, description: "Status, e.g. Active, Expired, Cancelled." },
      note: { type: "string", required: false, description: "A note." },
    },
    async run(args) {
      const found = await resolveCommitment(str(args.commitment));
      if (!found) return { ok: false, message: `Couldn't find a commitment matching "${str(args.commitment)}".` };
      const patch: Record<string, unknown> = {};
      if (str(args.counterparty)) patch.counterparty = str(args.counterparty);
      if (str(args.reference)) patch.reference = str(args.reference);
      if (str(args.startDate)) patch.startDate = str(args.startDate);
      if (str(args.endDate)) patch.endDate = str(args.endDate);
      if (num(args.noticeDays) !== null) patch.noticeDays = num(args.noticeDays);
      if (str(args.amount)) patch.amount = str(args.amount);
      if (str(args.status)) patch.status = str(args.status);
      if (str(args.note)) patch.note = str(args.note);
      if (Object.keys(patch).length === 0) return { ok: false, message: "Give me at least one field to change." };
      const before: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) before[k] = (found.row as Record<string, unknown>)[camelToSnake(k)];
      const res = await updateCommitmentAction(found.id, patch);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't save your changes. Please try again." };
      return {
        ok: true,
        message: `Updated "${found.title}".`,
        redirect: `/hrms/commitments`,
        undo: { kind: "ori.commitment.update", payload: { commitmentId: found.id, before } },
      };
    },
  },
  {
    name: "archive_commitment",
    tier: 3, // removes it from the active register (reversible — un-archive)
    description: "Archive a commitment (removes it from the active register; reversible).",
    params: {
      commitment: { type: "string", required: true, description: "The commitment — its id or title." },
    },
    async run(args) {
      const found = await resolveCommitment(str(args.commitment));
      if (!found) return { ok: false, message: `Couldn't find a commitment matching "${str(args.commitment)}".` };
      const res = await archiveCommitmentAction(found.id);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't archive the commitment. Please try again." };
      return {
        ok: true,
        message: `Archived "${found.title}".`,
        redirect: `/hrms/commitments`,
        undo: { kind: "ori.commitment.archive", payload: { commitmentId: found.id } },
      };
    },
  },
  {
    name: "link_commitment_document",
    tier: 2,
    description: "Attach a supporting document to a commitment.",
    params: {
      commitment: { type: "string", required: true, description: "The commitment — its id or title." },
      document: { type: "string", required: true, description: "The document — its id or title." },
    },
    async run(args) {
      const found = await resolveCommitment(str(args.commitment));
      if (!found) return { ok: false, message: `Couldn't find a commitment matching "${str(args.commitment)}".` };
      const doc = await resolveDocument(str(args.document));
      if (!doc) return { ok: false, message: `Couldn't find a document matching "${str(args.document)}".` };
      const res = await linkCommitmentDocumentAction(found.id, doc.id);
      if (!res.ok) return { ok: false, message: res.error ?? "Couldn't link the document. Please try again." };
      return {
        ok: true,
        message: `Attached "${doc.title}" to "${found.title}".`,
        redirect: `/hrms/commitments`,
        undo: { kind: "ori.commitment.link", payload: { commitmentId: found.id, before: found.documentId } },
      };
    },
  },
];

/* ------------------------------- local resolvers ------------------------- */

/** camelCase → snake_case, for reading the pre-mutation row column by patch key. */
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

/** Strip PostgREST `.or()` filter metacharacters (comma/parens/dots) so free-text
 *  planner input can't break the filter grammar; keeps it as a plain ilike token. */
function orSafe(s: string): string {
  return s.replace(/[(),.*]/g, " ").replace(/\s+/g, " ").trim();
}

/** Resolve a pipeline case by numeric id or a fuzzy subject match. Returns the
 *  fields needed for undo snapshots (stage, document_id) plus the raw row. */
async function resolvePipelineItem(
  ref: string,
): Promise<{ id: number; subject: string; stage: string | null; documentId: number | null; row: Record<string, unknown> } | null> {
  const token = str(ref);
  if (!token) return null;
  const asId = Number(token);
  const q = sb.from("pipeline").select("*").eq("archived", false);
  const { data } = Number.isInteger(asId) && asId > 0
    ? await q.eq("id", asId).limit(1).maybeSingle()
    : await q.ilike("subject", `%${token}%`).limit(1).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as number,
    subject: (data.subject as string) ?? String(data.id),
    stage: (data.stage as string | null) ?? null,
    documentId: (data.document_id as number | null) ?? null,
    row: data as Record<string, unknown>,
  };
}

/** Resolve a commitment by numeric id or a fuzzy title match. */
async function resolveCommitment(
  ref: string,
): Promise<{ id: number; title: string; documentId: number | null; row: Record<string, unknown> } | null> {
  const token = str(ref);
  if (!token) return null;
  const asId = Number(token);
  const q = sb.from("commitments").select("*").eq("archived", false);
  const { data } = Number.isInteger(asId) && asId > 0
    ? await q.eq("id", asId).limit(1).maybeSingle()
    : await q.ilike("title", `%${token}%`).limit(1).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as number,
    title: (data.title as string) ?? String(data.id),
    documentId: (data.document_id as number | null) ?? null,
    row: data as Record<string, unknown>,
  };
}
