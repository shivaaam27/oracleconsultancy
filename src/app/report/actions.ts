"use server";

/**
 * The Report (owner, 26 Sept 2026) — what the Director Brief page becomes. Not
 * a page that repeats Home: a panel you open from Home, a company or a person,
 * choose company · person · period, and take away as a PDF, an email with the
 * PDF attached, a WhatsApp message, copied text or an Outbox draft. The PDF and
 * its sections are the Brief's own, unchanged (lib/reports/brief-pdf.tsx).
 *
 * Owner: every company and person. Director: only their companies and the
 * people in them — `resolvePortalBriefFilters` drops anything wider, so a
 * hand-built request cannot widen the report. Every action is guarded.
 */
import { sb } from "@/db/supabase";
import { guardViewer, type Viewer } from "@/lib/auth/viewer";
import { getBrief, parseBriefPeriod, briefShareText, briefEmail, briefEmailDoc, type BriefData } from "@/lib/reports/director-brief";
import { briefMonthOptions, parseBriefPersonRole, type BriefPersonRole } from "@/lib/reports/brief-links";
import { briefPdfFilename } from "@/lib/reports/brief-pdf-shared";

export type ReportInput = {
  period?: string;
  companyIds?: number[];
  personIds?: number[];
  role?: BriefPersonRole | null;
};

export type ReportOptions = {
  companies: { id: number; name: string }[];
  people: { id: number; name: string }[];
  months: { value: string; label: string }[];
  canNote: boolean;
  /** The PDF route this viewer may use (owner vs director). */
  pdfBase: string;
};

export type ReportSummary = {
  title: string;
  subtitle: string;
  filename: string;
  delivered: number;
  open: number;
  overdue: number;
  atRisk: number;
  companies: number;
  shareText: string;
  emailSubject: string;
  notes: { id: number; body: string; companyName: string | null }[];
};

async function guard(): Promise<Viewer> {
  const v = await guardViewer();
  if (v.kind === "director" && !v.person.caps.directorBrief) throw new Error("Reports aren't switched on for you.");
  return v;
}

/** The filters as the viewer is allowed them (a director: inside their scope). */
async function scoped(v: Viewer, input: ReportInput): Promise<{ period: ReturnType<typeof parseBriefPeriod>; companyId: number | number[] | null; personId: number[]; personRole: BriefPersonRole | null }> {
  const period = parseBriefPeriod(input.period);
  const companyIds = (input.companyIds ?? []).filter((n) => Number.isInteger(n));
  const personIds = (input.personIds ?? []).filter((n) => Number.isInteger(n));
  if (v.kind === "owner") {
    return { period, companyId: companyIds.length ? companyIds : null, personId: personIds, personRole: personIds.length ? parseBriefPersonRole(input.role) : null };
  }
  const { resolvePortalBriefFilters } = await import("@/lib/portal/portal-brief-scope");
  const params = new URLSearchParams();
  if (companyIds.length) params.set("co", companyIds.join(","));
  if (personIds.length) params.set("who", personIds.join(","));
  if (input.role) params.set("role", input.role);
  const f = await resolvePortalBriefFilters(v.person, params);
  return { period, companyId: f.companyId, personId: f.personId, personRole: f.personRole };
}

async function build(v: Viewer, input: ReportInput): Promise<BriefData> {
  const f = await scoped(v, input);
  return getBrief(new Date(), f.period, f.companyId, { personId: f.personId, personRole: f.personRole });
}

export async function reportOptions(): Promise<ReportOptions> {
  const v = await guard();
  const months = briefMonthOptions(new Date(), 12);
  if (v.kind === "director") {
    const { portalBriefOptions } = await import("@/lib/portal/portal-brief-scope");
    const o = await portalBriefOptions(v.person);
    return { companies: o.companies.map((c) => ({ id: c.id, name: c.name })), people: o.people, months, canNote: false, pdfBase: "/api/portal/brief-pdf" };
  }
  const [{ data: cos }, { data: ppl }] = await Promise.all([
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  return {
    companies: (cos ?? []).map((c) => ({ id: c.id as number, name: c.name as string })),
    people: (ppl ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
    months,
    canNote: true,
    pdfBase: "/brief/pdf",
  };
}

export async function reportSummary(input: ReportInput): Promise<ReportSummary> {
  const v = await guard();
  const b = await build(v, input);
  const email = briefEmail(b);
  return {
    title: b.selectedPersonName ?? b.selectedCompanyName ?? "Oracle Consultancy",
    subtitle: [b.selectedPersonName && b.selectedCompanyName ? b.selectedCompanyName : null, b.monthLabel, `as at ${b.asAt}`].filter(Boolean).join(" · "),
    filename: briefPdfFilename(b),
    delivered: b.deliveredCount,
    open: b.openCount,
    overdue: b.overdueCount,
    atRisk: b.atRiskCount,
    companies: b.companyCount,
    shareText: briefShareText(b),
    emailSubject: email.subject,
    notes: v.kind === "owner" ? b.notes.map((n) => ({ id: n.id, body: n.body, companyName: n.companyName ?? null })) : [],
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email the report with its PDF attached. `to` = addresses (typed or chosen). */
export async function emailReport(input: ReportInput, to: string[]): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const v = await guard();
  const list = [...new Set(to.map((t) => t.trim().toLowerCase()).filter((t) => EMAIL.test(t)))];
  if (!list.length) return { ok: false, error: "Add at least one email address." };
  if (list.length > 20) return { ok: false, error: "Twenty addresses at most, please." };
  const b = await build(v, input);
  const { renderBriefPdf } = await import("@/lib/reports/brief-pdf");
  const pdf = await renderBriefPdf(b);
  const { renderEmail, senderName } = await import("@/lib/email/layout");
  const { sendEmail } = await import("@/lib/email/send");
  const email = briefEmail(b);
  const office = v.kind === "director" ? v.role : "command";
  const res = await sendEmail({
    to: list,
    subject: email.subject,
    text: email.body,
    html: renderEmail({ ...briefEmailDoc(b), office, ...(v.kind === "director" ? { signoffName: v.name } : {}) }),
    fromName: senderName(office),
    attachments: [{ filename: briefPdfFilename(b), content: Buffer.from(pdf).toString("base64"), contentType: "application/pdf", encoding: "base64" }],
  });
  if (!res.ok) return { ok: false, error: res.reason === "not-configured" ? "Email isn't set up yet — Settings → Email." : "The email didn't go — try again." };
  const iso = new Date().toISOString();
  await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: list.join(", "), recipient_contact: list.join(", "),
    company: b.selectedCompanyName ?? "Portfolio", subject: email.subject, body: email.body,
    message_type: "DIRECTOR BRIEF", status: "Sent", source: `report:${v.actor}`, created_at: iso, sent_at: iso,
  });
  return { ok: true, sent: list.length };
}

/** Leave the report as an Outbox draft (text; the PDF is a click away). */
export async function draftReport(input: ReportInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = await guard();
  const b = await build(v, input);
  const email = briefEmail(b);
  const { error } = await sb.from("outbox").insert({
    channel: "EMAIL", recipient_name: v.kind === "director" ? v.name : "Director", recipient_contact: null,
    company: b.selectedCompanyName ?? "Portfolio", subject: email.subject, body: email.body,
    message_type: "DIRECTOR BRIEF", status: "Draft", source: `report-draft:${v.actor}`, created_at: new Date().toISOString(),
  });
  return error ? { ok: false, error: "The draft didn't save." } : { ok: true };
}

/** Email addresses of the people in the viewer's reach, for the Email picker. */
export async function reportRecipients(): Promise<{ name: string; email: string }[]> {
  const v = await guard();
  let q = sb.from("people").select("id,name,email").eq("active", true).not("email", "is", null).order("name");
  if (v.kind === "director") {
    const { portalBriefOptions } = await import("@/lib/portal/portal-brief-scope");
    const ids = (await portalBriefOptions(v.person)).people.map((p) => p.id);
    q = q.in("id", ids.length ? ids : [-1]);
  }
  const { data } = await q;
  return (data ?? []).filter((p) => EMAIL.test(String(p.email))).map((p) => ({ name: p.name as string, email: p.email as string }));
}

/* Notes for the report (owner only) — the brief's own notes table. */
export async function addReportNote(body: string, companyId: number | null): Promise<{ ok: boolean }> {
  const v = await guard();
  if (v.kind !== "owner") return { ok: false };
  const text = body.trim().slice(0, 2000);
  if (!text) return { ok: false };
  const iso = new Date().toISOString();
  const { error } = await sb.from("brief_notes").insert({ body: text, company_id: companyId, note_date: iso, created_at: iso });
  return { ok: !error };
}

export async function deleteReportNote(id: number): Promise<{ ok: boolean }> {
  const v = await guard();
  if (v.kind !== "owner") return { ok: false };
  const { error } = await sb.from("brief_notes").delete().eq("id", id);
  return { ok: !error };
}
