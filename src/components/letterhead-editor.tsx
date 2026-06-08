"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Loader2, Check, Upload, X } from "lucide-react";
import { Button } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { saveCompanyLetterheadAction, type CompanyLetterhead, type LetterheadMode } from "@/app/letterheads/actions";

const MODES: Array<{ value: LetterheadMode; label: string; hint: string }> = [
  { value: "typed", label: "Typed", hint: "Compose the header from the fields below + a logo." },
  { value: "images", label: "Header & footer images", hint: "Your designed top band + bottom band; body flows between, repeats each page." },
  { value: "background", label: "Full-page background", hint: "A single A4 design with a blank middle; body sits in the middle." },
];

function ImageRow({ name, label, url, hint }: { name: string; label: string; url: string | null; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  return (
    <div className="rounded-lg ring-1 ring-border/70 bg-bg-subtle/40 p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle flex-1">{label}</span>
        <button type="button" onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-subtle px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:border-accent">
          <Upload size={12} /> {chosen ?? (url ? "Replace" : "Upload")}
        </button>
        {url && !chosen && (
          <button type="button" onClick={() => setRemove((v) => !v)}
            className={cn("inline-flex items-center gap-1 text-[11px]", remove ? "text-danger" : "text-fg-muted hover:text-danger")}>
            <X size={12} /> {remove ? "Removing" : "Remove"}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-[10px] text-fg-subtle">{hint}</p>}
      {url && !remove && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mt-2 max-h-20 w-full object-contain rounded bg-white ring-1 ring-border/60" />
      )}
      <input ref={ref} type="file" name={name} accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; setChosen(f ? f.name : null); if (f) setRemove(false); }} />
      {remove && <input type="hidden" name={`remove_${name}`} value="1" />}
    </div>
  );
}

export function LetterheadEditor({ company }: { company: CompanyLetterhead }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<LetterheadMode>(company.mode);

  const ready = company.mode === "typed"
    ? !!(company.address && company.signatoryName)
    : company.mode === "images" ? company.hasHeader
    : company.hasBackground;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveCompanyLetterheadAction(company.id, fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${company.name} letterhead saved.`, { tone: "success" });
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
          <div className="text-[11px] text-fg-muted truncate">
            {MODES.find((m) => m.value === company.mode)?.label} letterhead
          </div>
        </div>
        {ready
          ? <span className="inline-flex items-center gap-1 text-[11px] text-success"><Check size={12} /> Set up</span>
          : <span className="text-[11px] text-warn">Incomplete</span>}
        <ChevronDown size={16} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>

      <form onSubmit={onSubmit} className="border-t border-border/70 p-4 space-y-3">
        {/* Letterhead style */}
        <div>
          <label className={label}>Letterhead style</label>
          <div className="inline-flex flex-wrap rounded-xl bg-bg-subtle p-1 ring-1 ring-border/60">
            {MODES.map((m) => (
              <button key={m.value} type="button" onClick={() => setMode(m.value)}
                className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors", mode === m.value ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
                {m.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="letterheadMode" value={mode} />
          <p className="mt-1 text-[11px] text-fg-subtle">{MODES.find((m) => m.value === mode)?.hint}</p>
        </div>

        {/* Designed images */}
        {(mode === "images" || mode === "background") && (
          <div className="space-y-2">
            {mode === "images" && (
              <>
                <ImageRow name="headerImage" label="Header band image" url={company.headerImageUrl} hint="Full-width top band (PNG/JPG). Sized to the page automatically." />
                <ImageRow name="footerImage" label="Footer band image" url={company.footerImageUrl} hint="Full-width bottom band; repeats on every page." />
              </>
            )}
            {mode === "background" && (
              <ImageRow name="backgroundImage" label="Full-page A4 background" url={company.backgroundImageUrl} hint="A4 design with a blank middle for the body." />
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Body top margin (mm)</label>
                <input name="contentTopMm" type="number" min={0} defaultValue={company.contentTopMm ?? 45} className={input} />
              </div>
              <div>
                <label className={label}>Body bottom margin (mm)</label>
                <input name="contentBottomMm" type="number" min={0} defaultValue={company.contentBottomMm ?? 30} className={input} />
              </div>
            </div>
          </div>
        )}

        {/* Typed details — always kept (used in letter wording even with a designed letterhead) */}
        <details className="rounded-lg ring-1 ring-border/60 bg-bg-subtle/30" open={mode === "typed"}>
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-fg-muted">
            Company details {mode !== "typed" ? "(used in the letter text)" : ""}
          </summary>
          <div className="px-3 pb-3 grid gap-2.5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={label}>Registered (legal) name</label><input name="legalName" defaultValue={company.legalName ?? ""} placeholder={company.name} className={input} /></div>
            <div className="sm:col-span-2"><label className={label}>Registered address</label><input name="address" defaultValue={company.address ?? ""} placeholder="P.O. Box …, Street, City" className={input} /></div>
            <div><label className={label}>Phone</label><input name="phone" defaultValue={company.phone ?? ""} className={input} /></div>
            <div><label className={label}>Email</label><input name="email" type="email" defaultValue={company.email ?? ""} className={input} /></div>
            <div><label className={label}>Registration no.</label><input name="registrationNo" defaultValue={company.registrationNo ?? ""} className={input} /></div>
            <div><label className={label}>TIN</label><input name="tin" defaultValue={company.tin ?? ""} className={input} /></div>
            <div><label className={label}>Signatory name</label><input name="signatoryName" defaultValue={company.signatoryName ?? ""} placeholder="e.g. Jane Doe" className={input} /></div>
            <div><label className={label}>Signatory title</label><input name="signatoryTitle" defaultValue={company.signatoryTitle ?? ""} placeholder="e.g. HR Manager" className={input} /></div>
            {mode === "typed" && <div className="sm:col-span-2"><ImageRow name="logo" label="Logo" url={company.logoUrl} hint="Shown in the composed header." /></div>}
          </div>
        </details>

        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending}>{pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save letterhead</Button>
        </div>
      </form>
    </details>
  );
}
