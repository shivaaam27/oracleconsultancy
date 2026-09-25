"use client";
/* The "+ New" card's Person tab (mockup board CreateEdit: "Person — name ·
 * company · role · reports to · phone; the full record adds profile · HR ·
 * portal access · journeys"). It asks only what a person cannot exist without,
 * creates them through the SAME `createPerson` the full form uses (so onboarding
 * still starts itself for a hire), and opens their page, whose Edit tab holds
 * every other field. */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPerson } from "@/app/people/actions";
import { PERSON_TYPES, PERSON_TYPE_LABELS, type PersonType } from "@/lib/person-types";
import { StudioChoiceMenu } from "@/components/studio/tasks/cells";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";

type Options = { companies: { id: number; name: string }[]; people: { id: number; name: string }[] };
type Draft = { name: string; type: PersonType; companyId: number | null; managerId: number | null; role: string; phone: string; whatsappSame: boolean; whatsapp: string; email: string };
const EMPTY: Draft = { name: "", type: "local_staff", companyId: null, managerId: null, role: "", phone: "", whatsappSame: true, whatsapp: "", email: "" };

const CHIP = "mx-0 py-0 h-8 rounded-[10px] border border-[var(--sh-field-line)] bg-[var(--sh-field)] px-2.5 text-xs text-[var(--sh-fg)] hover:bg-[var(--sh-hover)] hover:border-[var(--sh-field-line)]";
const FIELD = { color: "var(--sh-fg)", background: "var(--sh-field)", border: "1px solid var(--sh-field-line)", boxShadow: "none" } as const;

export function QuickPersonPane({ options, defaultCompanyId, onDone, registerSubmit }: {
  options: Options | null;
  defaultCompanyId: number | null;
  onDone: (again: boolean) => void;
  registerSubmit: (fn: (again: boolean) => void, busy: boolean, fullHref: () => string) => void;
}) {
  const [d, setD] = useState<Draft>({ ...EMPTY, companyId: defaultCompanyId });
  const [busy, start] = useTransition();
  const name = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => { name.current?.focus(); }, []);
  useEffect(() => { if (defaultCompanyId && !d.companyId) set({ companyId: defaultCompanyId }); }, [defaultCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function submit(again: boolean) {
    if (!d.name.trim()) { toast("Give them a name first.", { tone: "warn" }); name.current?.focus(); return; }
    const fd = new FormData();
    fd.set("name", d.name.trim());
    fd.set("personType", d.type);
    if (d.companyId) fd.set("companyId", String(d.companyId));
    if (d.managerId) fd.set("managerId", String(d.managerId));
    if (d.role.trim()) fd.set("role", d.role.trim());
    if (d.phone.trim()) fd.set("phone", d.phone.trim());
    const wa = d.whatsappSame ? d.phone.trim() : d.whatsapp.trim();
    if (wa) fd.set("whatsapp", wa);
    if (d.email.trim()) fd.set("email", d.email.trim());
    start(async () => {
      const res = await createPerson(fd);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${d.name.trim()} added.${d.type === "local_staff" || d.type === "expat" ? " Their onboarding checklist has started." : ""}`, { tone: "success" });
      router.refresh();
      if (again) {
        setD((x) => ({ ...EMPTY, companyId: x.companyId, managerId: x.managerId, type: x.type }));
        name.current?.focus();
      } else if (res.id) {
        router.push(`/people/${res.id}`);
      }
      onDone(again);
    });
  }
  useEffect(() => { registerSubmit(submit, busy, () => "/people?new=1"); }); // eslint-disable-line react-hooks/exhaustive-deps

  const companies = options?.companies ?? [];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); }
    else if (e.key === "Enter") { e.preventDefault(); submit(false); }
  };
  return (
    <div className="flex flex-col gap-3.5">
      <input ref={name} value={d.name} onChange={(e) => set({ name: e.target.value })} onKeyDown={onKey}
        placeholder="Their full name" aria-label="Full name"
        style={{ color: "var(--sh-fg)", background: "transparent", border: 0, boxShadow: "none" }}
        className="bare-field w-full px-0 py-1 text-[26px] tracking-[-0.02em] outline-none placeholder:text-[var(--sh-muted)]" />
      <div className="flex flex-wrap gap-1.5">
        <StudioChoiceMenu value={d.type} options={PERSON_TYPES.map((t) => ({ value: t, label: PERSON_TYPE_LABELS[t] }))}
          onPick={(v) => set({ type: v as PersonType })} prefix="Type" showDot={false} className={cn(CHIP, "st-dark-chip")} width={200} />
        <StudioChoiceMenu value={d.companyId ? String(d.companyId) : null} options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
          onPick={(v) => set({ companyId: Number(v) })} prefix="Company" empty="pick one" showDot={false} width={260}
          className={cn(CHIP, "st-dark-chip", !d.companyId && "border-[var(--sh-muted)]")} />
        <StudioChoiceMenu value={d.managerId ? String(d.managerId) : ""} options={[{ value: "", label: "Nobody" }, ...(options?.people ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
          onPick={(v) => set({ managerId: v ? Number(v) : null })} prefix="Reports to" empty="nobody" showDot={false} width={260} className={cn(CHIP, "st-dark-chip")} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {([["role", "Job title", "e.g. Accountant"], ["phone", "Phone", "+255…"], ["email", "Email", "name@company.com"]] as const).map(([k, label, ph]) => (
          <label key={k} className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] text-[var(--sh-muted)]">{label}</span>
            <input value={d[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Draft>)} onKeyDown={onKey} placeholder={ph}
              type={k === "email" ? "email" : k === "phone" ? "tel" : "text"} style={FIELD}
              className="bare-field h-9 w-full rounded-[10px] px-3 text-[13px] outline-none placeholder:text-[var(--sh-muted)]" />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--sh-sub)]">
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input type="checkbox" checked={d.whatsappSame} onChange={(e) => set({ whatsappSame: e.target.checked })} className="h-3.5 w-3.5 accent-[var(--sh-on-bg)]" />
          Same number on WhatsApp
        </label>
        {!d.whatsappSame && (
          <input value={d.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} onKeyDown={onKey} placeholder="WhatsApp number" type="tel" style={FIELD}
            className="bare-field h-8 min-w-[180px] flex-1 rounded-[10px] px-3 text-[13px] outline-none placeholder:text-[var(--sh-muted)]" />
        )}
      </div>
      <p className="-mt-1.5 text-right text-[11px] text-[var(--sh-muted)]">Enter creates and opens their page — ID, HR, portal access and the rest are there · Ctrl+Enter adds another</p>
    </div>
  );
}
