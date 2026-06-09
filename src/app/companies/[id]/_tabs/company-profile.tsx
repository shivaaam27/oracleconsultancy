"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, Loader2, Building2, FileSignature, ExternalLink } from "lucide-react";
import { saveCompanyProfileAction } from "../actions";
import { useToast } from "@/components/toast";

export type CompanyProfile = {
  legalName: string | null;
  registrationNo: string | null;
  tin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
};

const inputCls =
  "w-full rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 transition";
const labelCls = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

export function CompanyProfile({
  companyId,
  companyName,
  profile,
}: {
  companyId: number;
  companyName: string;
  profile: CompanyProfile;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, start] = useTransition();
  const [dirty, setDirty] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveCompanyProfileAction(companyId, fd);
      if (res.ok) {
        toast("Profile saved.", { tone: "success" });
        setDirty(false);
        router.refresh();
      } else {
        toast(res.error, { tone: "danger" });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} onChange={() => setDirty(true)} className="space-y-4">
      <p className="text-xs text-fg-muted">
        These details are this company&apos;s record and the source for{" "}
        <Link href="/letters" className="text-accent hover:underline">Letters</Link>. Editing here updates both.
      </p>

      {/* Identity */}
      <section className="glass elevated rounded-2xl p-4 space-y-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Building2 size={15} className="text-accent" /> Identity
        </h2>
        <div>
          <label className={labelCls} htmlFor="legalName">Legal name</label>
          <input id="legalName" name="legalName" defaultValue={profile.legalName ?? ""} placeholder={companyName} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="registrationNo">Registration no.</label>
            <input id="registrationNo" name="registrationNo" defaultValue={profile.registrationNo ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="tin">TIN</label>
            <input id="tin" name="tin" defaultValue={profile.tin ?? ""} className={inputCls} />
          </div>
        </div>
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

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/letterheads"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-accent transition-colors rounded-full px-2.5 py-1 hover:bg-bg-muted/60"
        >
          <ExternalLink size={12} /> Branding &amp; letterhead
        </Link>
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
  );
}
