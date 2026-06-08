"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Loader2, Check, Upload, X } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { saveCompanyLetterheadAction, type CompanyLetterhead } from "@/app/letterheads/actions";

export function LetterheadEditor({ company }: { company: CompanyLetterhead }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [logoName, setLogoName] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const ready = !!(company.address && company.signatoryName);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (removeLogo) fd.set("removeLogo", "1");
    start(async () => {
      const res = await saveCompanyLetterheadAction(company.id, fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${company.name} letterhead saved.`, { tone: "success" });
      setLogoName(null); setRemoveLogo(false);
      router.refresh();
    });
  }

  const input = "w-full rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent";
  const label = "block text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1";

  return (
    <details className="group glass elevated rounded-2xl overflow-hidden">
      <summary className="list-none cursor-pointer flex items-center gap-3 px-4 py-3 select-none">
        <span className="h-8 w-8 rounded-lg bg-bg-muted ring-1 ring-border flex items-center justify-center overflow-hidden shrink-0">
          {company.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={company.logoUrl} alt="" className="h-full w-full object-contain" />
            : <Building2 size={15} className="text-fg-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{company.name}</div>
          <div className="text-[11px] text-fg-muted truncate">{company.address ?? "No letterhead set"}</div>
        </div>
        {ready
          ? <span className="inline-flex items-center gap-1 text-[11px] text-success"><Check size={12} /> Set up</span>
          : <span className="text-[11px] text-warn">Incomplete</span>}
        <ChevronDown size={16} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>

      <form onSubmit={onSubmit} className="border-t border-border/70 p-4 space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Registered (legal) name</label>
            <input name="legalName" defaultValue={company.legalName ?? ""} placeholder={company.name} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Registered address</label>
            <input name="address" defaultValue={company.address ?? ""} placeholder="P.O. Box …, Street, City" className={input} />
          </div>
          <div><label className={label}>Phone</label><input name="phone" defaultValue={company.phone ?? ""} className={input} /></div>
          <div><label className={label}>Email</label><input name="email" type="email" defaultValue={company.email ?? ""} className={input} /></div>
          <div><label className={label}>Registration no.</label><input name="registrationNo" defaultValue={company.registrationNo ?? ""} className={input} /></div>
          <div><label className={label}>TIN</label><input name="tin" defaultValue={company.tin ?? ""} className={input} /></div>
          <div><label className={label}>Signatory name</label><input name="signatoryName" defaultValue={company.signatoryName ?? ""} placeholder="e.g. Jane Doe" className={input} /></div>
          <div><label className={label}>Signatory title</label><input name="signatoryTitle" defaultValue={company.signatoryTitle ?? ""} placeholder="e.g. HR Manager" className={input} /></div>
        </div>

        <div>
          <label className={label}>Logo</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => logoInput.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg hover:border-accent">
              <Upload size={13} /> {logoName ?? (company.logoPath ? "Replace logo" : "Upload logo")}
            </button>
            {company.logoPath && !logoName && (
              <button type="button" onClick={() => setRemoveLogo((v) => !v)}
                className={cn("inline-flex items-center gap-1 text-xs", removeLogo ? "text-danger" : "text-fg-muted hover:text-danger")}>
                <X size={13} /> {removeLogo ? "Will remove on save" : "Remove"}
              </button>
            )}
            <input ref={logoInput} type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; setLogoName(f ? f.name : null); if (f) setRemoveLogo(false); }} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save letterhead</Button>
        </div>
      </form>
    </details>
  );
}
