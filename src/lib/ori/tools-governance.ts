import "server-only";
import { sb } from "@/db/supabase";
import { str, resolveCompany, type ToolDef } from "@/lib/ori/tools";
import {
  addCapHolderAction,
  addSignatoryAction,
  addResolutionAction,
  addRiskAction,
  setRiskStatusAction,
  addDecisionAction,
  decideDecisionAction,
} from "@/app/governance/actions";
/* ---------------------------------------------------------------------------
 * Governance domain tools for ORI. (The pipeline and commitment tools went with
 * Applications and Commitments, removed 26 Sept 2026.)
 *
 * Each tool REUSES an existing server action — no raw DB writes. Tiers are honest:
 *   1 read · 2 internal write · 3 send/spend/delete/publish/access/settings.
 * Undo specs are emitted only where a clean inverse exists AND a handle to reverse
 * the step is available; the matching undo-handler kind (ori.risk.status) lives
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
];

/* ------------------------------- local resolvers ------------------------- */

/** Strip PostgREST `.or()` filter metacharacters (comma/parens/dots) so free-text
 *  planner input can't break the filter grammar; keeps it as a plain ilike token. */
function orSafe(s: string): string {
  return s.replace(/[(),.*]/g, " ").replace(/\s+/g, " ").trim();
}
