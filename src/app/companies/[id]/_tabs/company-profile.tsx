"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FactsPanel } from "@/components/facts-panel";
import { GovernancePanel } from "@/components/governance-panel";
import { Save, Loader2, Building2, FileSignature, ImagePlus, Trash2 } from "lucide-react";
import { saveCompanyProfileAction } from "../actions";
import { useToast } from "@/components/toast";
import { CompanyAvatar } from "@/components/company-avatar";

export type CompanyProfile = {
  filePrefix: string | null;
  legalName: string | null;
  registrationNo: string | null;
  tin: string | null;
  vrn: string | null;
  incorporationDate: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  sectorRegulated: boolean;
};

const inputCls =
  "w-full rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 transition";
const labelCls = "block text-xs font-medium uppercase tracking-wider text-fg-subtle mb-1";

export function CompanyProfile({
  companyId,
  companyName,
  accent,
  logoUrl,
  profile,
}: {
  companyId: number;
  companyName: string;
  accent?: string | null;
  logoUrl?: string | null;
  profile: CompanyProfile;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(logoUrl ?? null);
  const [removeLogo, setRemoveLogo] = useState(false);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setRemoveLogo(false);
    setDirty(true);
  }
  function clearPhoto() {
    if (fileRef.current) fileRef.current.value = "";
    setPreview(null);
    setRemoveLogo(true);
    setDirty(true);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (removeLogo) fd.set("remove_logo", "1");
    start(async () => {
      const res = await saveCompanyProfileAction(companyId, fd);
      if (res.ok) {
        toast("Profile saved.", { tone: "success" });
        setDirty(false);
        setRemoveLogo(false);
        router.refresh();
      } else {
        toast(res.error, { tone: "danger" });
      }
    });
  }

  return (
    <div className="space-y-4">
    <form onSubmit={onSubmit} onChange={() => setDirty(true)} className="space-y-4">
      <p className="text-xs text-fg-muted">
        These details are this company&apos;s official record.
      </p>

      {/* Identity */}
      <section className="glass elevated rounded-2xl p-4 space-y-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Building2 size={15} className="text-accent" /> Identity
        </h2>

        {/* Company photo + display name */}
        <div className="flex items-center gap-4">
          <CompanyAvatar name={companyName} accent={accent} logoUrl={preview} size={64} iconSize={26} />
          <div className="flex flex-col gap-1.5">
            <input ref={fileRef} type="file" name="logo" accept="image/*" onChange={onPickPhoto} className="hidden" id="company-logo-input" />
            <div className="flex items-center gap-2">
              <label
                htmlFor="company-logo-input"
                className="inline-flex items-center gap-1.5 cursor-pointer rounded-full bg-bg-elev ring-1 ring-border px-3 py-1.5 text-xs font-medium hover:ring-accent/40 transition"
              >
                <ImagePlus size={13} /> {preview ? "Change photo" : "Add photo"}
              </label>
              {preview && (
                <button type="button" onClick={clearPhoto} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-fg-muted hover:text-danger transition">
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </div>
            <span className="text-xs text-fg-subtle">Square PNG/JPG works best. Shows across the site and on letters.</span>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="name">Display name</label>
          <input id="name" name="name" defaultValue={companyName} required className={inputCls} />
          <p className="text-xs text-fg-subtle mt-1">The short name shown everywhere (lists, reports, tasks).</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="legalName">Legal name</label>
          <input id="legalName" name="legalName" defaultValue={profile.legalName ?? ""} placeholder={companyName} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="filePrefix">Document file prefix</label>
          <input id="filePrefix" name="filePrefix" defaultValue={profile.filePrefix ?? ""} placeholder="DarSpices" className={inputCls} />
          <p className="text-xs text-fg-subtle mt-1">Brand short-name used to name this company&apos;s documents, e.g. <code>DarSpices_TIN-Certificate</code>. Letters/spaces only; no spaces stored.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="registrationNo">Registration no.</label>
            <input id="registrationNo" name="registrationNo" defaultValue={profile.registrationNo ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="incorporationDate">Incorporation date</label>
            <input id="incorporationDate" name="incorporationDate" type="date" defaultValue={profile.incorporationDate ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="tin">TIN</label>
            <input id="tin" name="tin" defaultValue={profile.tin ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="vrn">VRN / VAT</label>
            <input id="vrn" name="vrn" defaultValue={profile.vrn ?? ""} className={inputCls} />
            <p className="text-xs text-fg-subtle mt-1">Enter the VRN if VAT-registered — this adds the VAT Certificate to the checklist.</p>
          </div>
        </div>

        {/* Regulated sector — tailors this company's statutory checklist. */}
        <label className="flex items-start gap-2.5 rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2.5 cursor-pointer">
          <input type="checkbox" name="sectorRegulated" defaultChecked={profile.sectorRegulated} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span className="text-sm">
            Regulated sector (construction / industrial)
            <span className="block text-xs text-fg-subtle">Adds CRB, OSHA, Local Content &amp; Fire safety to this company&apos;s required-documents checklist. Leave off for general trading, food or services.</span>
          </span>
        </label>
      </section>

      {/* Contact */}
      <section className="glass elevated rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold">Contact</h2>
        <div>
          <label className={labelCls} htmlFor="address">Address</label>
          <textarea id="address" name="address" defaultValue={profile.address ?? ""} rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="phone">Phone</label>
            <input id="phone" name="phone" defaultValue={profile.phone ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" defaultValue={profile.email ?? ""} className={inputCls} />
          </div>
        </div>
      </section>

      {/* Signatory */}
      <section className="glass elevated rounded-2xl p-4 space-y-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <FileSignature size={15} className="text-accent" /> Authorised signatory
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="signatoryName">Name</label>
            <input id="signatoryName" name="signatoryName" defaultValue={profile.signatoryName ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="signatoryTitle">Title</label>
            <input id="signatoryTitle" name="signatoryTitle" defaultValue={profile.signatoryTitle ?? ""} placeholder="e.g. Director" className={inputCls} />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-fg text-sm font-medium px-4 py-2 shadow-sm hover:bg-accent/90 transition disabled:opacity-50"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>

      {/* Tracked facts (source-linked fact ledger) */}
      <FactsPanel entityType="company" entityId={companyId} />

      {/* Governance (board reference: cap table / signatories / resolutions) */}
      <GovernancePanel companyId={companyId} />
    </div>
  );
}
