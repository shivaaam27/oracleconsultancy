import { PrintButton } from "@/components/print-button";
import { sb } from "@/db/supabase";
import { BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

// A printable A4 "Staff Data Collection Form" — bilingual (English / Swahili) so
// it can be handed to local/labour staff who have no system access. Filled by
// hand (or by a supervisor on their behalf), returned physically or via WhatsApp
// photo, then re-uploaded here: the intake AI reads the fields and builds/enriches
// the profile. Pre-fills known values when ?person=<id> is given.

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export default async function StaffDataFormPage({ searchParams }: { searchParams: Promise<{ person?: string; deadline?: string; company?: string }> }) {
  const sp = await searchParams;
  const personId = sp.person && /^\d+$/.test(sp.person) ? Number(sp.person) : null;

  let person: Record<string, unknown> | null = null;
  let companyName: string | null = null;
  if (personId) {
    const { data } = await sb.from("people").select("*").eq("id", personId).maybeSingle();
    person = data ?? null;
    if (person?.company_id) {
      const { data: c } = await sb.from("companies").select("name").eq("id", person.company_id as number).maybeSingle();
      companyName = (c?.name as string | null) ?? null;
    }
  }
  const v = (k: string) => (person ? (person[k] as string | null) ?? "" : "");

  return (
    <div className="mx-auto max-w-3xl p-4 print:p-0">
      <div className="print-hidden mb-3 flex items-center justify-between">
        <p className="text-sm text-fg-muted">Hand this to the staff member, or fill it on their behalf. Once returned, upload a photo/scan via <strong>Documents → Add</strong> and the profile fills in.</p>
        <PrintButton label="Print form" />
      </div>

      <div className="rounded-xl border border-border bg-bg p-6 text-[12px] leading-relaxed text-fg print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-2">
          <div>
            <div className="text-base font-bold">{companyName ?? BRAND_NAME}</div>
            <div className="text-[13px] font-semibold">Staff Data Form · <span className="font-normal">Fomu ya Taarifa za Mfanyakazi</span></div>
          </div>
          <div className="text-right text-[11px] text-fg-muted">
            Ref: {personId ? `P-${String(personId).padStart(4, "0")}` : "______"}<br />
            Date / Tarehe: {sp.deadline ? "" : ""}__________
          </div>
        </div>

        {/* Instructions */}
        <p className="mt-2 rounded bg-bg-subtle px-2 py-1.5 text-[11px]">
          Please complete every box in <strong>BLOCK CAPITALS</strong> and attach the documents listed at the end.
          If an item does not apply to you, write the reason. {sp.deadline ? <>Deadline / Mwisho: <strong>{sp.deadline}</strong>. </> : null}
          Return physically or via WhatsApp. <br />
          <span className="italic">Tafadhali jaza kila sehemu kwa HERUFI KUBWA na uambatanishe nyaraka zilizoorodheshwa. Kama kipengele hakikuhusu, andika sababu.</span>
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

        <Section title="3. Employment" sw="Ajira">
          <Field label="Company" sw="Kampuni" value={companyName ?? ""} />
          <Field label="Job title / Role" sw="Cheo / Kazi" value={v("role")} />
          <Field label="Department" sw="Idara" />
          <Field label="Start date" sw="Tarehe ya kuanza" value={fmtDate(v("start_date"))} />
          <Field label="Work site" sw="Eneo la kazi" />
          <Field label="Where you live" sw="Unapoishi" />
        </Section>

        <Section title="4. Payroll & statutory" sw="Mishahara na kisheria">
          <Field label="Bank name" sw="Jina la benki" />
          <Field label="Bank account no." sw="Namba ya akaunti" wide />
          <Field label="TIN" sw="Namba ya mlipa kodi" />
          <Field label="NSSF no." sw="Namba ya NSSF" />
          <Field label="NHIF no. (if any)" sw="Namba ya NHIF" wide />
        </Section>

        <Section title="5. Documents attached" sw="Nyaraka zilizoambatanishwa">
          <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {["Copy of NIDA / passport (Nakala ya NIDA / pasipoti)",
              "Passport-size photo (Picha ya pasipoti)",
              "Signed contract (Mkataba uliosainiwa)",
              "Academic / professional certificates (Vyeti)",
              "Bank details / cheque leaf (Taarifa za benki)",
              "NSSF card (Kadi ya NSSF)",
              "Police / medical clearance if applicable (Uthibitisho)",
              "Work / residence permit (expats) (Kibali cha kazi)",
            ].map((d) => (
              <label key={d} className="flex items-start gap-1.5"><span className="mt-0.5 inline-block h-3 w-3 shrink-0 border border-fg-muted" /> {d}</label>
            ))}
          </div>
        </Section>

        {/* Declaration */}
        <div className="mt-3 border-t border-border pt-2">
          <p className="text-[11px]">I confirm the information above is true and correct. <span className="italic">Ninathibitisha taarifa zilizo hapo juu ni za kweli na sahihi.</span></p>
          <div className="mt-4 grid grid-cols-2 gap-6">
            <div className="border-t border-fg-muted pt-1 text-[11px]">Signature / Thumbprint<br /><span className="italic text-fg-muted">Sahihi / Alama ya kidole</span></div>
            <div className="border-t border-fg-muted pt-1 text-[11px]">Date / Tarehe</div>
          </div>
          <p className="mt-3 text-[10px] text-fg-muted">For office use: filled on behalf by ____________________  ·  uploaded ☐</p>
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

function Field({ label, sw, value, wide }: { label: string; sw: string; value?: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <div className="text-[10px] text-fg-muted">{label} <span className="italic">/ {sw}</span></div>
      <div className="min-h-[20px] border-b border-fg-muted/60 text-[12px]">{value || " "}</div>
    </div>
  );
}
