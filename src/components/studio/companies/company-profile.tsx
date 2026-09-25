"use client";
/**
 * Studio — a company's Profile tab, as cards.
 *
 * It held everything in one long column: the people named in its filings, the
 * official-details form, tracked facts, governance and the whole document
 * library — 2,800px of scrolling. Now:
 *   row 1 · official details + contact & signatory (ONE form, one Save) ·
 *           people in filings + governance · tracked facts
 *   row 2 · the document library, full width
 * The form posts to the same `saveCompanyProfileAction` with the same field
 * names; facts, governance and documents are the same components, restyled
 * by `.st-desk`.
 */
import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Save, Trash2, Network } from "lucide-react";
import { saveCompanyProfileAction } from "@/app/companies/[id]/actions";
import { CompanyAvatar } from "@/components/company-avatar";
import { useToast } from "@/components/toast";
import type { CompanyProfile } from "@/app/companies/[id]/_tabs/company-profile";
import type { CompanyRelationship } from "@/lib/relationships";
import { cn } from "@/lib/cn";

const FIELD = "h-9 w-full rounded-[10px] border border-[var(--st-line)] bg-[var(--st-surface)] px-3 text-[13px] text-[var(--st-ink)] outline-none transition-colors focus:border-[var(--st-ink)]";
const LABEL = "mb-1 block text-xs text-[var(--st-label)]";
const ROLE_TONE: Record<string, string> = {
  Director: "bg-[var(--st-ink)] text-[var(--st-surface)]",
  Shareholder: "bg-[var(--st-warn-wash)] text-[var(--st-soon-text)]",
  "Company secretary": "bg-[var(--st-ok-wash)] text-[var(--st-ok-text)]",
};

export function Card({ title, right, children, className, texture }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; texture?: string }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-[20px] bg-[var(--st-surface)] px-5 py-4", texture, className)}>
      <div className="flex min-h-[28px] shrink-0 items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        {right && <div className="flex items-center gap-2 text-xs text-[var(--st-muted)]">{right}</div>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, name, value, type = "text", placeholder, hint, span }: { label: string; name: string; value: string | null; type?: string; placeholder?: string; hint?: string; span?: boolean }) {
  return (
    <label className={cn("min-w-0", span && "sm:col-span-2")} title={hint}>
      <span className={LABEL}>{label}</span>
      <input name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} className={FIELD} />
    </label>
  );
}

export function StudioCompanyProfile({ companyId, companyName, accent, logoUrl, profile, relationships, facts, governance, documents, readOnly = false }: {
  companyId: number;
  companyName: string;
  accent: string | null;
  logoUrl: string | null;
  profile: CompanyProfile;
  /** null = leave the column out (a member of staff sees the details only). */
  relationships: CompanyRelationship[] | null;
  facts: ReactNode;
  governance: ReactNode;
  documents: ReactNode | null;
  /** A director: the profile to read — fields locked, no save, no photo. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (removeLogo) fd.set("remove_logo", "1");
    start(async () => {
      const res = await saveCompanyProfileAction(companyId, fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast("Profile saved.", { tone: "success" });
      setDirty(false); setRemoveLogo(false);
      router.refresh();
    });
  }

  const saveBtn = (
    <button type="submit" disabled={saving || !dirty}
      className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--st-ink)] px-3 text-xs font-medium text-[var(--st-surface)] transition-opacity hover:opacity-90 disabled:opacity-35">
      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}{saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={onSubmit} onChange={() => setDirty(true)} className={cn("flex min-w-0 flex-col gap-4", relationships == null && "lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start xl:col-span-3")}>
          <fieldset disabled={readOnly} className="contents">
          <Card title="Official details" right={readOnly ? undefined : saveBtn}>
            <div className="mt-3 flex items-center gap-4">
              <CompanyAvatar name={companyName} accent={accent} logoUrl={preview} size={56} iconSize={22} />
              {!readOnly && <div className="flex flex-col gap-1.5">
                <input ref={fileRef} type="file" name="logo" accept="image/*" className="hidden" id="st-company-logo"
                  onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setPreview(URL.createObjectURL(f)); setRemoveLogo(false); setDirty(true); }} />
                <div className="flex gap-1.5">
                  <label htmlFor="st-company-logo" className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border border-[var(--st-line)] px-2.5 text-xs hover:bg-[var(--st-page)]">
                    <ImagePlus size={13} />{preview ? "Change photo" : "Add photo"}
                  </label>
                  {preview && (
                    <button type="button" onClick={() => { if (fileRef.current) fileRef.current.value = ""; setPreview(null); setRemoveLogo(true); setDirty(true); }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-xs text-[var(--st-muted)] hover:text-[var(--st-late-text)]"><Trash2 size={13} />Remove</button>
                  )}
                </div>
                <span className="text-[11px] text-[var(--st-muted)]">Square PNG or JPG. Shows across COS and on letters.</span>
              </div>}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
              <label className="min-w-0 sm:col-span-2" title="The short name shown everywhere — lists, reports, tasks">
                <span className={LABEL}>Display name</span>
                <input name="name" required defaultValue={companyName} className={FIELD} />
              </label>
              <Field label="Legal name" name="legalName" value={profile.legalName} placeholder={companyName} span />
              <Field label="Registration no." name="registrationNo" value={profile.registrationNo} />
              <Field label="Incorporated" name="incorporationDate" type="date" value={profile.incorporationDate} />
              <Field label="TIN" name="tin" value={profile.tin} />
              <Field label="VRN / VAT" name="vrn" value={profile.vrn} hint="If VAT-registered" />
              <Field label="File name prefix" name="filePrefix" value={profile.filePrefix} placeholder="e.g. DarSpices" hint="A short brand name for this company's files — letters and numbers only" span />
            </div>
          </Card>
          <Card title="Contact & signatory">
            <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
              <label className="min-w-0 sm:col-span-2">
                <span className={LABEL}>Address</span>
                <textarea name="address" rows={2} defaultValue={profile.address ?? ""} className={cn(FIELD, "h-auto py-2 leading-snug")} />
              </label>
              <Field label="Phone" name="phone" value={profile.phone} />
              <Field label="Email" name="email" type="email" value={profile.email} />
              <Field label="Signs as" name="signatoryName" value={profile.signatoryName} placeholder="Name" hint="The authorised signatory on letters" />
              <Field label="Their title" name="signatoryTitle" value={profile.signatoryTitle} placeholder="e.g. Director" />
            </div>
          </Card>
          </fieldset>
        </form>

        {relationships != null && <div className="flex min-w-0 flex-col gap-4">
          <Card title="People in filings" right={readOnly ? undefined : <Link href={`/graph?type=company&id=${companyId}`} className="inline-flex items-center gap-1 hover:text-[var(--st-ink)]"><Network size={12} />All connections</Link>}>
            <p className="mt-0.5 text-xs text-[var(--st-muted)]">Read from its filed documents — directors, shareholders, the secretary.</p>
            <div className="mt-2 flex flex-col">
              {relationships.length === 0 && <div className="py-3 text-[13px] text-[var(--st-muted)]">Nobody is named in its filings yet.</div>}
              {relationships.map((r, i) => (
                <div key={`${r.role}-${r.personId ?? r.name}-${i}`} className="flex items-center gap-2.5 border-b border-[var(--st-line-soft)] py-2 last:border-0">
                  <span className={cn("inline-flex h-6 w-[118px] shrink-0 items-center justify-center rounded-[7px] text-[11px]", ROLE_TONE[r.role] ?? "bg-[var(--st-page)] text-[var(--st-sub)]")}>{r.role}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {r.personId ? <Link href={`/people/${r.personId}`} className="hover:underline">{r.name}</Link> : r.name}
                    {r.detail && <span className="ml-1.5 text-xs text-[var(--st-muted)]">{r.detail}</span>}
                  </span>
                  {!r.personId && <span className="shrink-0 text-[11px] text-[var(--st-muted)]" title="Not in People — add them there to link">not on file</span>}
                </div>
              ))}
            </div>
          </Card>
          {governance && <section className="st-desk st-panel min-w-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4">{governance}</section>}
        </div>}

        {facts && <section className="st-desk st-panel min-w-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4 lg:col-span-2 xl:col-span-1">{facts}</section>}
      </div>

      {documents != null && <section className="st-desk st-panel min-w-0 rounded-[20px] bg-[var(--st-surface)] px-5 py-4">{documents}</section>}
    </div>
  );
}
