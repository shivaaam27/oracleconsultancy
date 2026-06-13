import { sb } from "@/db/supabase";
import { signDocumentFile } from "@/lib/documents";
import { BRAND_NAME } from "@/lib/brand";
import type { Letterhead, LetterRow, LetterStatus } from "@/lib/letters-shared";

/* ------------------------------------------------------------------ */
/* Letterhead — build live from a company, or read a frozen snapshot.  */
/* ------------------------------------------------------------------ */
export async function companyLetterhead(companyId: number): Promise<Letterhead | null> {
  const { data } = await sb
    .from("companies")
    .select("name,legal_name,address,phone,email,registration_no,tin,signatory_name,signatory_title,logo_path,letterhead_mode,header_image_path,footer_image_path,background_image_path,content_top_mm,content_bottom_mm")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  return {
    mode: ((data.letterhead_mode as string | null) ?? "typed") as Letterhead["mode"],
    name: data.name as string,
    legalName: (data.legal_name as string | null) ?? null,
    address: (data.address as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    registrationNo: (data.registration_no as string | null) ?? null,
    tin: (data.tin as string | null) ?? null,
    signatoryName: (data.signatory_name as string | null) ?? null,
    signatoryTitle: (data.signatory_title as string | null) ?? null,
    logoPath: (data.logo_path as string | null) ?? null,
    headerImagePath: (data.header_image_path as string | null) ?? null,
    footerImagePath: (data.footer_image_path as string | null) ?? null,
    backgroundImagePath: (data.background_image_path as string | null) ?? null,
    contentTopMm: (data.content_top_mm as number | null) ?? null,
    contentBottomMm: (data.content_bottom_mm as number | null) ?? null,
  };
}

/** Sign the image paths in a letterhead for rendering. */
export async function signLetterhead(lh: Letterhead): Promise<Letterhead & { logoUrl: string | null; headerUrl: string | null; footerUrl: string | null; backgroundUrl: string | null }> {
  const sign = (p: string | null) => (p ? signDocumentFile(p, 3600) : Promise.resolve(null));
  const [logoUrl, headerUrl, footerUrl, backgroundUrl] = await Promise.all([
    sign(lh.logoPath), sign(lh.headerImagePath), sign(lh.footerImagePath), sign(lh.backgroundImagePath),
  ]);
  return { ...lh, logoUrl, headerUrl, footerUrl, backgroundUrl };
}

/* ------------------------------------------------------------------ */
/* Template bodies                                                     */
/* ------------------------------------------------------------------ */
type Ctx = {
  person: { name: string; nationality: string | null; passportNo: string | null; dateOfBirth: string | null; role: string | null } | null;
  company: { name: string; legalName: string | null; address: string | null; registrationNo: string | null; tin: string | null };
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "[date]";
}

function invitationBody(c: Ctx): { subject: string; addressee: string; body: string } {
  const p = c.person;
  const name = p?.name ?? "[full name]";
  const nat = p?.nationality ?? "[nationality]";
  const passport = p?.passportNo ?? "[passport number]";
  const dob = p?.dateOfBirth ? fmtDate(p.dateOfBirth) : "[date of birth]";
  const role = p?.role ?? "[position/role]";
  const companyLegal = c.company.legalName || c.company.name;
  const reg = c.company.registrationNo ?? "[registration no.]";
  const tin = c.company.tin ?? "[TIN]";
  const addr = c.company.address ?? "[registered address]";

  const body = `Dear Sir/Madam,

RE: INVITATION — ${name.toUpperCase()}, ${nat.toUpperCase()}, PASSPORT NO. ${passport}

We, ${companyLegal}, a company duly registered in the United Republic of Tanzania (Registration No. ${reg}, TIN ${tin}) of ${addr}, write to formally invite the above-named individual to the United Republic of Tanzania for the purpose of [taking up employment as ${role} / business discussions / a work assignment].

Particulars of the invitee:
  • Full name: ${name}
  • Nationality: ${nat}
  • Passport number: ${passport}
  • Date of birth: ${dob}
  • Position / role: ${role}

The intended period of stay is from [start date] to [end date].

[Undertaking — edit as needed: Our company undertakes to meet the costs of travel, accommodation and repatriation for the invitee for the duration of the visit, and to be responsible for the invitee while in the United Republic of Tanzania.]

We kindly request that the necessary visa / entry permit be granted to facilitate this visit. We confirm that the invitee will abide by the laws of the United Republic of Tanzania.

Yours faithfully,
For and on behalf of ${companyLegal}



_____________________________
[Signatory name]
[Signatory title]`;

  return {
    subject: `Invitation — ${name}`,
    addressee: "To the Visa Officer,\n[Embassy / High Commission]",
    body,
  };
}

function blankBody(c: Ctx): { subject: string; addressee: string; body: string } {
  return {
    subject: "",
    addressee: "[Recipient name]\n[Recipient address]",
    body: `Dear Sir/Madam,

[Write your letter here.]

Yours faithfully,
For and on behalf of ${c.company.legalName || c.company.name}



_____________________________
[Signatory name]
[Signatory title]`,
  };
}

function buildTemplate(type: string, c: Ctx) {
  return type === "invitation" ? invitationBody(c) : blankBody(c);
}

/* ------------------------------------------------------------------ */
/* Ref numbers                                                         */
/* ------------------------------------------------------------------ */
const TYPE_CODE: Record<string, string> = { invitation: "INV", blank: "LTR" };

async function nextRef(companyId: number | null, type: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  let prefix = "ORC";
  if (companyId) {
    const { data } = await sb.from("companies").select("code_prefix,code").eq("id", companyId).maybeSingle();
    prefix = (data?.code_prefix as string | null) || (data?.code as string | null) || "ORC";
  }
  const code = TYPE_CODE[type] ?? "LTR";
  // Number each company's letters of a given type independently (so Cocozuri's
  // first invitation is …/001, not …/002 just because Dar Spices issued one).
  let q = sb
    .from("letters")
    .select("id", { count: "exact", head: true })
    .eq("type", type)
    .gte("created_at", new Date(Date.UTC(year, 0, 1)).toISOString());
  q = companyId ? q.eq("company_id", companyId) : q.is("company_id", null);
  const { count } = await q;
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `${prefix}/${code}/${year}/${seq}`;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */
export async function createLetter(type: string, companyId: number | null, personId: number | null): Promise<number> {
  let person: Ctx["person"] = null;
  if (personId) {
    const { data } = await sb.from("people").select("name,nationality,passport_no,date_of_birth,role").eq("id", personId).maybeSingle();
    if (data) person = {
      name: data.name as string,
      nationality: (data.nationality as string | null) ?? null,
      passportNo: (data.passport_no as string | null) ?? null,
      dateOfBirth: (data.date_of_birth as string | null) ?? null,
      role: (data.role as string | null) ?? null,
    };
  }
  let company = { name: BRAND_NAME, legalName: null as string | null, address: null as string | null, registrationNo: null as string | null, tin: null as string | null };
  if (companyId) {
    const { data } = await sb.from("companies").select("name,legal_name,address,registration_no,tin").eq("id", companyId).maybeSingle();
    if (data) company = { name: data.name as string, legalName: (data.legal_name as string | null) ?? null, address: (data.address as string | null) ?? null, registrationNo: (data.registration_no as string | null) ?? null, tin: (data.tin as string | null) ?? null };
  }
  const t = buildTemplate(type, { person, company });
  const ref = await nextRef(companyId, type);
  const now = new Date().toISOString();
  const title = type === "invitation" && person ? `Invitation — ${person.name}` : t.subject || "Letter";
  const { data, error } = await sb
    .from("letters")
    .insert({
      type, title, company_id: companyId, person_id: personId, ref,
      letter_date: now, addressee: t.addressee, subject: t.subject, body: t.body,
      status: "Draft", created_at: now, updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

type Row = {
  id: number; type: string; title: string; company_id: number | null; person_id: number | null;
  ref: string | null; status: string; letter_date: string | null; issued_at: string | null; updated_at: string;
  body?: string; addressee?: string | null; subject?: string | null; letterhead_snapshot?: string | null;
  companies?: { name: string } | { name: string }[] | null;
  people?: { name: string } | { name: string }[] | null;
};
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? v[0] ?? null : v ?? null; }

function mapRow(r: Row): LetterRow {
  return {
    id: r.id, type: r.type, title: r.title,
    companyId: r.company_id, companyName: one(r.companies)?.name ?? null,
    personId: r.person_id, personName: one(r.people)?.name ?? null,
    ref: r.ref, status: (r.status as LetterStatus) ?? "Draft",
    letterDate: r.letter_date, issuedAt: r.issued_at, updatedAt: r.updated_at,
  };
}

export async function listLetters(): Promise<LetterRow[]> {
  const { data } = await sb
    .from("letters")
    .select("id,type,title,company_id,person_id,ref,status,letter_date,issued_at,updated_at, companies(name), people(name)")
    .order("updated_at", { ascending: false });
  return ((data ?? []) as Row[]).map(mapRow);
}

export type LetterDetail = LetterRow & {
  body: string;
  addressee: string | null;
  subject: string | null;
  letterhead: (Letterhead & { logoUrl: string | null; headerUrl: string | null; footerUrl: string | null; backgroundUrl: string | null }) | null;
};

export async function getLetter(id: number): Promise<LetterDetail | null> {
  const { data } = await sb
    .from("letters")
    .select("id,type,title,company_id,person_id,ref,status,letter_date,issued_at,updated_at,body,addressee,subject,letterhead_snapshot, companies(name), people(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as Row;
  // Issued → frozen snapshot; Draft → live company letterhead.
  let lh: Letterhead | null = null;
  if (r.status === "Issued" && r.letterhead_snapshot) {
    try { lh = JSON.parse(r.letterhead_snapshot) as Letterhead; } catch { lh = null; }
  } else if (r.company_id) {
    lh = await companyLetterhead(r.company_id);
  }
  const signed = lh ? await signLetterhead(lh) : null;
  return {
    ...mapRow(r),
    body: r.body ?? "",
    addressee: r.addressee ?? null,
    subject: r.subject ?? null,
    letterhead: signed,
  };
}

export async function updateLetterDraft(id: number, fields: { companyId?: number | null; addressee?: string; subject?: string; body?: string; ref?: string; letterDate?: string | null; title?: string }): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.companyId !== undefined) patch.company_id = fields.companyId;
  if (fields.addressee !== undefined) patch.addressee = fields.addressee;
  if (fields.subject !== undefined) patch.subject = fields.subject;
  if (fields.body !== undefined) patch.body = fields.body;
  if (fields.ref !== undefined) patch.ref = fields.ref;
  if (fields.letterDate !== undefined) patch.letter_date = fields.letterDate;
  if (fields.title !== undefined) patch.title = fields.title;
  const { error } = await sb.from("letters").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function issueLetter(id: number): Promise<void> {
  const { data } = await sb.from("letters").select("company_id,status").eq("id", id).maybeSingle();
  if (!data) throw new Error("Letter not found");
  let snapshot: string | null = null;
  if (data.company_id) {
    const lh = await companyLetterhead(data.company_id as number);
    if (lh) snapshot = JSON.stringify(lh);
  }
  const now = new Date().toISOString();
  const { error } = await sb.from("letters").update({ status: "Issued", issued_at: now, letterhead_snapshot: snapshot, updated_at: now }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicateLetter(id: number): Promise<number> {
  const { data } = await sb.from("letters").select("type,title,company_id,person_id,addressee,subject,body").eq("id", id).maybeSingle();
  if (!data) throw new Error("Letter not found");
  const ref = await nextRef((data.company_id as number | null) ?? null, data.type as string);
  const now = new Date().toISOString();
  const { data: ins, error } = await sb.from("letters").insert({
    type: data.type, title: `${data.title} (copy)`, company_id: data.company_id, person_id: data.person_id,
    ref, letter_date: now, addressee: data.addressee, subject: data.subject, body: data.body,
    status: "Draft", created_at: now, updated_at: now,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return ins.id as number;
}

export async function deleteLetter(id: number): Promise<void> {
  const { error } = await sb.from("letters").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
