import QRCode from "qrcode";
import { PrintButton } from "@/components/print-button";
import { sb } from "@/db/supabase";
import { BRAND_NAME } from "@/lib/brand";
import { appBaseUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

/**
 * Printable A4 "Staff Data Collection Form" — bilingual (English / Swahili) for
 * local/labour staff with no system access. Filled by hand (or by a supervisor
 * on their behalf), returned physically or via WhatsApp photo, then re-uploaded:
 * intake AI reads it and builds/enriches the profile.
 *
 * Query params:
 *   ?person=<id>   pre-fill known values + show a QR back to the record
 *   ?missing=1     print ONLY the fields still blank (don't re-collect known data)
 *   ?deadline=...  show a submission deadline
 * Outsider person-type hides the employment + payroll sections automatically.
 */
export default async function StaffDataFormPage({ searchParams }: { searchParams: Promise<{ person?: string; deadline?: string; missing?: string }> }) {
  const sp = await searchParams;
  const personId = sp.person && /^\d+$/.test(sp.person) ? Number(sp.person) : null;
  const missingOnly = sp.missing === "1";

  let person: Record<string, unknown> | null = null;
  let companyName: string | null = null;
  let qrDataUrl: string | null = null;
  if (personId) {
    const { data } = await sb.from("people").select("*").eq("id", personId).maybeSingle();
    person = data ?? null;
    if (person?.company_id) {
      const { data: c } = await sb.from("companies").select("name").eq("id", person.company_id as number).maybeSingle();
      companyName = (c?.name as string | null) ?? null;
    }
    // QR encodes a link straight to this person's record, so a returned form can
    // be matched to the right profile by scanning instead of by name.
    try { qrDataUrl = await QRCode.toDataURL(`${appBaseUrl()}/people?person=${personId}`, { margin: 1, width: 120 }); } catch { qrDataUrl = null; }
  }
  const isOutsider = (person?.person_type as string | null) === "outsider";
  const v = (k: string) => (person ? (person[k] as string | null) ?? "" : "");

  // In missing-only mode, a pre-known field is dropped; everything shows otherwise.
  const Field = ({ label, sw, value, wide }: { label: string; sw: string; value?: string; wide?: boolean }) => {
    if (missingOnly && value) return null;
    return (
      <div className={wide ? "col-span-2" : ""}>
        <div className="text-[10px] text-fg-muted">{label} <span className="italic">/ {sw}</span></div>
        <div className="field-line min-h-[20px] border-b border-fg-muted/60 text-[12px]">{value || " "}</div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl p-4 print:p-0">
      <div className="print-hidden mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          Hand this to the staff member, <strong>or a supervisor fills it on their behalf</strong> (see “filled on behalf by” at the foot). Once returned, upload a photo/scan via <strong>Documents → Add</strong> and the profile fills in.
          {personId && <> · <a className="text-accent hover:underline" href={`/people/form?person=${personId}${sp.deadline ? `&deadline=${encodeURIComponent(sp.deadline)}` : ""}${missingOnly ? "" : "&missing=1"}`}>{missingOnly ? "Show full form" : "Only missing fields"}</a></>}
        </p>
        <PrintButton label="Print form" />
      </div>

      <div className="data-form rounded-xl border border-border bg-bg p-6 text-[12px] leading-relaxed text-fg print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-2">
          <div>
            <div className="text-base font-bold">{companyName ?? BRAND_NAME}</div>
            <div className="text-[13px] font-semibold">
              {isOutsider ? <>Contact / Reference Form · <span className="font-normal">Fomu ya Mawasiliano</span></> : <>Staff Data Form · <span className="font-normal">Fomu ya Taarifa za Mfanyakazi</span></>}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-right text-[11px] text-fg-muted">
              Ref: {personId ? `P-${String(personId).padStart(4, "0")}` : "______"}<br />
              Date / Tarehe: __________
            </div>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Scan to open this person's record" width={64} height={64} className="h-16 w-16" />
            )}
          </div>
        </div>

        {/* Instructions */}
        <p className="mt-2 rounded bg-bg-subtle px-2 py-1.5 text-[11px]">
          Please complete every box in <strong>BLOCK CAPITALS</strong> and attach the documents listed at the end.
          If an item does not apply, write the reason. {sp.deadline ? <>Deadline / Mwisho: <strong>{sp.deadline}</strong>. </> : null}
          Return physically or via WhatsApp. <br />
          <span className="italic">Tafadhali jaza kila sehemu kwa HERUFI KUBWA na uambatanishe nyaraka. Kama kipengele hakikuhusu, andika sababu. Rudisha fomu ana kwa ana au kwa WhatsApp.</span>
        </p>

        <Section title="1. Personal details" sw="Taarifa binafsi">
          <Field label="Full name" sw="Jina kamili" value={v("name")} wide />
          <Field label="Date of birth" sw="Tarehe ya kuzaliwa" value={fmtDate(v("date_of_birth"))} />
          <Field label="Gender" sw="Jinsia" />
          <Field label="Nationality" sw="Uraia" value={v("nationality")} />
          <Field label="National ID (NIDA)" sw="Kitambulisho cha Taifa" value={v("national_id")} />
          <Field label="Passport no." sw="Namba ya pasipoti" value={v("passport_no")} />
          <Field label="Marital status" sw="Hali ya ndoa" />
          <Field label="Home address" sw="Anuani ya nyumbani" value={v("address")} wide />
          <Field label="Phone" sw="Simu" value={v("phone")} />
          <Field label="WhatsApp" sw="WhatsApp" value={v("whatsapp")} />
          <Field label="Email (if any)" sw="Barua pepe" value={v("email")} wide />
        </Section>

        <Section title="2. Next of kin / Emergency contact" sw="Ndugu wa karibu / Mtu wa dharura">
          <Field label="Name" sw="Jina" value={v("emergency_contact_name")} />
          <Field label="Relationship" sw="Uhusiano" />
          <Field label="Phone" sw="Simu" value={v("emergency_contact_phone")} wide />
        </Section>

        {!isOutsider && (
          <Section title="3. Employment" sw="Ajira">
            <Field label="Company" sw="Kampuni" value={companyName ?? ""} />
            <Field label="Job title / Role" sw="Cheo / Kazi" value={v("role")} />
            <Field label="Department" sw="Idara" />
            <Field label="Start date" sw="Tarehe ya kuanza" value={fmtDate(v("start_date"))} />
            <Field label="Work site" sw="Eneo la kazi" />
            <Field label="Where you live" sw="Unapoishi" />
          </Section>
        )}

        {!isOutsider && (
          <Section title="4. Payroll & statutory" sw="Mishahara na kisheria">
            <Field label="Bank name" sw="Jina la benki" />
            <Field label="Bank account no." sw="Namba ya akaunti" wide />
            <Field label="TIN" sw="Namba ya mlipa kodi" />
            <Field label="NSSF no." sw="Namba ya NSSF" />
            <Field label="NHIF no. (if any)" sw="Namba ya NHIF" wide />
          </Section>
        )}

        <Section title={`${isOutsider ? "3" : "5"}. Documents attached`} sw="Nyaraka zilizoambatanishwa">
          <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {(isOutsider
              ? ["Copy of ID / passport (Nakala ya kitambulisho)", "Relevant agreement / document (Nyaraka husika)", "Contact card (Kadi ya mawasiliano)", "Other (Nyingine)"]
              : ["Copy of NIDA / passport (Nakala ya NIDA / pasipoti)", "Passport-size photo (Picha ya pasipoti)", "Signed contract (Mkataba uliosainiwa)", "Academic / professional certificates (Vyeti)", "Bank details / cheque leaf (Taarifa za benki)", "NSSF card (Kadi ya NSSF)", "Police / medical clearance if applicable (Uthibitisho)", "Work / residence permit (expats) (Kibali cha kazi)"]
            ).map((d) => (
              <label key={d} className="flex items-start gap-1.5"><span className="doc-box mt-0.5 inline-block h-3 w-3 shrink-0 border border-fg-muted" /> {d}</label>
            ))}
          </div>
        </Section>

        {/* Declaration */}
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-[11px]">I confirm the information above is true and correct. <span className="italic">Ninathibitisha taarifa zilizo hapo juu ni za kweli na sahihi.</span></p>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <div className="field-line border-t border-fg-muted pt-1 text-[11px]">Signature / Thumbprint<br /><span className="italic text-fg-muted">Sahihi / Alama ya kidole</span></div>
            <div className="field-line border-t border-fg-muted pt-1 text-[11px]">Date / Tarehe</div>
          </div>
          <p className="mt-3 text-[10px] text-fg-muted">For office use — filled on behalf by (supervisor): ____________________  ·  Signature: __________  ·  uploaded ☐</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, sw, children }: { title: string; sw: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 break-inside-avoid">
      <div className="mb-1 text-[12px] font-semibold">{title} <span className="font-normal text-fg-muted">/ {sw}</span></div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</div>
    </div>
  );
}
