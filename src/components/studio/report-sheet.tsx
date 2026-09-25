"use client";

/**
 * The Report panel — what the Director Brief page became (owner, 26 Sept 2026:
 * "I don't use that page much … the only important thing is the PDF, the
 * filters per company, per person, month, this month, last month, quarter and
 * year … draft, WhatsApp, email and copy").
 *
 * Mounted once in the Studio shell; opened from anywhere with
 *   window.dispatchEvent(new CustomEvent("cos:report", { detail: { companyIds, personIds } }))
 * — Home's header, a company page and a person page do this, the last two
 * already set to themselves. An old /brief link lands on Home with ?report=1
 * and the same filters, and this opens itself.
 *
 * Choose company · person · period, see the four numbers the PDF leads with,
 * then: Download PDF · Email (PDF attached) · WhatsApp · Copy · Save as a
 * draft. The PDF is the Brief's own, every section kept. Owner-only extra:
 * the notes that go into the report's text and email.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, FileText, Loader2, Mail, MessageCircle, Plus, Send, Trash2, X } from "lucide-react";
import { StudioSheet } from "@/components/studio/sheet";
import { StudioPeoplePick } from "@/components/studio/people-pick";
import { downloadPdf } from "@/components/brief-pdf-button";
import {
  addReportNote, deleteReportNote, draftReport, emailReport, reportOptions, reportRecipients, reportSummary,
  type ReportInput, type ReportOptions, type ReportSummary,
} from "@/app/report/actions";
import { cn } from "@/lib/cn";

type Preset = "month" | "last-month" | "quarter" | "year";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

const CHIP = "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[12.5px] transition-colors";
const CHIP_OFF = "border-[var(--sh-chip-line)] bg-[var(--sh-field)] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)]";
const CHIP_ON = "border-transparent bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]";
const BTN = "inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--sh-chip-line)] bg-[var(--sh-field)] px-3.5 text-[13px] font-medium text-[var(--sh-fg)] transition-colors hover:bg-[var(--sh-hover)] disabled:opacity-50";
const LABEL = "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sh-fg)]";

export function openReport(detail: { companyIds?: number[]; personIds?: number[] } = {}) {
  window.dispatchEvent(new CustomEvent("cos:report", { detail }));
}

export function ReportSheet() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ReportOptions | null>(null);
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [personIds, setPersonIds] = useState<number[]>([]);
  const [preset, setPreset] = useState<Preset>("month");
  const [months, setMonths] = useState<string[]>([]);
  const [sum, setSum] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [who, setWho] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const start = useCallback((d: { companyIds?: number[]; personIds?: number[]; period?: string }) => {
    setCompanyIds(d.companyIds ?? []);
    setPersonIds(d.personIds ?? []);
    const p = d.period ?? "month";
    if (p.startsWith("on:")) { setMonths(p.slice(3).split(",").filter(Boolean)); setPreset("month"); }
    else { setMonths([]); setPreset((PRESETS.some((x) => x.id === p) ? p : "month") as Preset); }
    setWho(false); setEmailing(false); setFlash(null);
    setOpen(true);
  }, []);

  // Opened from anywhere…
  useEffect(() => {
    const on = (e: Event) => start((e as CustomEvent).detail ?? {});
    window.addEventListener("cos:report", on);
    return () => window.removeEventListener("cos:report", on);
  }, [start]);
  // …or by an old /brief link, which arrives as ?report=1 with its filters.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get("report") !== "1") return;
    const ids = (k: string) => (u.searchParams.get(k) ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    start({ companyIds: ids("co"), personIds: ids("who"), period: u.searchParams.get("period") ?? "month" });
    for (const k of ["report", "co", "who", "period", "role"]) u.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", u.pathname + (u.search || "") + u.hash);
  }, [start]);

  useEffect(() => {
    if (open && !opts) reportOptions().then(setOpts).catch(() => setFlash("Couldn't load the filters — try again."));
  }, [open, opts]);

  const input: ReportInput = useMemo(() => ({
    period: months.length ? `on:${[...months].sort().join(",")}` : preset,
    companyIds, personIds,
  }), [months, preset, companyIds, personIds]);

  // The four numbers follow the filters (a beat after the last change).
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      reportSummary(input).then((s) => { if (n === seq.current) setSum(s); })
        .catch(() => { if (n === seq.current) setFlash("Couldn't build the report — try again."); })
        .finally(() => { if (n === seq.current) setLoading(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [open, input]);

  const say = (m: string) => { setFlash(m); setTimeout(() => setFlash((x) => (x === m ? null : x)), 3500); };
  const pdfHref = () => {
    if (!opts) return "";
    const q = new URLSearchParams({ period: input.period ?? "month" });
    if (companyIds.length) q.set("co", companyIds.join(","));
    if (personIds.length) q.set("who", personIds.join(","));
    return `${opts.pdfBase}?${q.toString()}`;
  };
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const peopleNames = (opts?.people ?? []).filter((p) => personIds.includes(p.id)).map((p) => p.name);

  return (
    <StudioSheet open={open} onClose={() => setOpen(false)} title="Report" icon={<FileText size={15} />} width={620}
      footer={
        <div className="flex flex-col gap-2.5">
          {flash && <div role="status" className="text-[12.5px] text-[var(--sh-fg)]">{flash}</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button type="button" disabled={!opts || busy === "pdf"} onClick={() => void downloadPdf(pdfHref(), (b) => setBusy(b ? "pdf" : null))}
              className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--sh-on-bg)] px-3.5 text-[13px] font-semibold text-[var(--sh-on-fg)] transition-opacity hover:opacity-90 disabled:opacity-50 sm:col-span-2">
              {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}Download PDF
            </button>
            <button type="button" onClick={() => setEmailing((v) => !v)} className={cn(BTN, emailing && "border-[var(--sh-fg)]")}><Mail size={14} />Email</button>
            <button type="button" disabled={!sum} onClick={() => sum && window.open(`https://wa.me/?text=${encodeURIComponent(sum.shareText)}`, "_blank")} className={BTN}><MessageCircle size={14} />WhatsApp</button>
            <button type="button" disabled={!sum} onClick={async () => {
              if (!sum) return;
              try { await navigator.clipboard.writeText(sum.shareText); say("Copied — paste it anywhere."); } catch { say("Couldn't copy on this device."); }
            }} className={BTN}><Copy size={14} />Copy</button>
            <button type="button" disabled={busy === "draft"} onClick={async () => {
              setBusy("draft");
              const r = await draftReport(input).catch(() => ({ ok: false as const, error: "The draft didn't save." }));
              setBusy(null);
              say(r.ok ? "Saved as a draft in the Outbox." : r.error);
            }} className={cn(BTN, "col-span-2 sm:col-span-5")}>{busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}Save as a draft in the Outbox</button>
          </div>
        </div>
      }>
      <div className="flex flex-col gap-4">
        {/* The numbers the PDF leads with. */}
        <div className="rounded-[18px] bg-[#141517] p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] font-medium tracking-[-0.01em]">{sum?.title ?? "Oracle Consultancy"}</div>
              <div className="mt-0.5 truncate text-[12px] text-white">{sum?.subtitle ?? "Working it out…"}</div>
            </div>
            {loading && <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-white" />}
          </div>
          <div className="mt-3.5 grid grid-cols-4 gap-2">
            {([["Delivered", sum?.delivered, "#19C37D"], ["Open", sum?.open, "#FFFFFF"], ["Overdue", sum?.overdue, "#F07BBE"], ["At risk", sum?.atRisk, "#F5A524"]] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-[12px] bg-[#1F2023] px-2.5 py-2">
                <div className="text-[22px] font-medium leading-none tabular-nums" style={{ color: c }}>{v ?? "–"}</div>
                <div className="mt-1 text-[11px] text-white">{l}</div>
              </div>
            ))}
          </div>
        </div>

        {emailing && <EmailBox input={input} onSent={(n) => { setEmailing(false); say(`Sent to ${n} ${n === 1 ? "address" : "addresses"}, with the PDF attached.`); }} />}

        <section>
          <div className={LABEL}>Period</div>
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => { setPreset(p.id); setMonths([]); }}
                className={cn(CHIP, !months.length && preset === p.id ? CHIP_ON : CHIP_OFF)}>{p.label}</button>
            ))}
          </div>
          {opts && (
            <div className="-mx-5 mt-1.5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {opts.months.map((m) => (
                <button key={m.value} type="button" onClick={() => setMonths((l) => (l.includes(m.value) ? l.filter((x) => x !== m.value) : [...l, m.value]))}
                  className={cn(CHIP, "h-7 text-[12px]", months.includes(m.value) ? CHIP_ON : CHIP_OFF)}>
                  {months.includes(m.value) && <Check size={12} />}{m.label}
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className={LABEL}>Company</div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setCompanyIds([])} className={cn(CHIP, !companyIds.length ? CHIP_ON : CHIP_OFF)}>All companies</button>
            {(opts?.companies ?? []).map((c) => (
              <button key={c.id} type="button" onClick={() => setCompanyIds((l) => toggle(l, c.id))} className={cn(CHIP, companyIds.includes(c.id) ? CHIP_ON : CHIP_OFF)}>{c.name}</button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <div className={LABEL}>Person</div>
            {personIds.length > 0 && <button type="button" onClick={() => setPersonIds([])} className="mb-1.5 text-[12px] text-[var(--sh-fg)] underline-offset-2 hover:underline">Everyone</button>}
          </div>
          {who ? (
            <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--sh-chip-line)] bg-[var(--sh-card)] p-2.5">
              <StudioPeoplePick tone="sheet" autoFocus people={opts?.people ?? []} value={peopleNames}
                onChange={(names) => setPersonIds((opts?.people ?? []).filter((p) => names.includes(p.name)).map((p) => p.id))} maxHeight={180} />
              <div className="flex justify-end"><button type="button" onClick={() => setWho(false)} className={cn(CHIP, CHIP_OFF)}>Done</button></div>
            </div>
          ) : (
            <button type="button" onClick={() => setWho(true)} className={cn(CHIP, "h-9 w-full justify-start", CHIP_OFF)}>
              {peopleNames.length ? <span className="truncate font-medium">{peopleNames.join(", ")}</span> : "Everyone"}
            </button>
          )}
        </section>

        {opts?.canNote && sum && <Notes notes={sum.notes} companyId={companyIds.length === 1 ? companyIds[0] : null} onChange={() => setCompanyIds((l) => [...l])} />}
      </div>
    </StudioSheet>
  );
}

/** Who gets the email: people with an address (a tap each) or any address typed. */
function EmailBox({ input, onSent }: { input: ReportInput; onSent: (n: number) => void }) {
  const [people, setPeople] = useState<{ name: string; email: string }[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { reportRecipients().then(setPeople).catch(() => {}); }, []);
  const add = (v: string) => { const e = v.trim().toLowerCase(); if (e && !to.includes(e)) setTo((l) => [...l, e]); };
  const shown = people.filter((p) => !typed || p.name.toLowerCase().includes(typed.toLowerCase()) || p.email.toLowerCase().includes(typed.toLowerCase())).slice(0, 6);
  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-[var(--sh-chip-line)] bg-[var(--sh-card)] p-3">
      <div className="text-[13px] font-medium text-[var(--sh-fg)]">Email it — the PDF goes attached</div>
      {to.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {to.map((e) => (
            <span key={e} className={cn(CHIP, "h-7 pr-1.5", CHIP_OFF)}>{e}
              <button type="button" aria-label={`Remove ${e}`} onClick={() => setTo((l) => l.filter((x) => x !== e))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[var(--sh-hover)]"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <input value={typed} onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (typed.includes("@")) { add(typed); setTyped(""); } else if (shown[0]) { add(shown[0].email); setTyped(""); } } }}
        placeholder="A name, or type any email address"
        style={{ background: "var(--sh-field)", border: "1px solid var(--sh-chip-line)", boxShadow: "none", color: "var(--sh-fg)" }}
        className="bare-field h-10 w-full rounded-[11px] px-3 text-[13.5px] outline-none placeholder:text-[var(--sh-muted)]" />
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shown.filter((p) => !to.includes(p.email.toLowerCase())).map((p) => (
            <button key={p.email} type="button" onClick={() => { add(p.email); setTyped(""); }} className={cn(CHIP, "h-7 text-[12px]", CHIP_OFF)}><Plus size={11} />{p.name}</button>
          ))}
        </div>
      )}
      {err && <div role="alert" className="text-[12px] text-[#E0479E]">{err}</div>}
      <button type="button" disabled={sending || (!to.length && !typed.includes("@"))}
        onClick={async () => {
          const list = typed.includes("@") ? [...to, typed.trim()] : to;
          setSending(true); setErr(null);
          const r = await emailReport(input, list).catch(() => ({ ok: false as const, error: "The email didn't go — try again." }));
          setSending(false);
          if (r.ok) onSent(r.sent); else setErr(r.error);
        }}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--sh-on-bg)] text-[13px] font-semibold text-[var(--sh-on-fg)] disabled:opacity-50">
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send with the PDF
      </button>
    </div>
  );
}

/** The owner's notes that travel in the report's text and email. */
function Notes({ notes, companyId, onChange }: { notes: ReportSummary["notes"]; companyId: number | null; onChange: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <div className={LABEL}>Notes in this report</div>
      <div className="flex flex-col gap-1.5">
        {notes.map((n) => (
          <div key={n.id} className="group flex items-start gap-2 rounded-[11px] bg-[var(--sh-field)] px-3 py-2 text-[13px] text-[var(--sh-fg)]">
            <span className="min-w-0 flex-1">{n.companyName && <b className="font-semibold">{n.companyName}: </b>}{n.body}</span>
            <button type="button" aria-label="Delete this note" onClick={async () => { await deleteReportNote(n.id); onChange(); }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] text-[var(--sh-fg)] hover:text-[#E0479E]"><Trash2 size={13} /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={async (e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); setBusy(true); await addReportNote(text, companyId); setBusy(false); setText(""); onChange(); } }}
            placeholder={companyId ? "A note for this company — Enter adds it" : "A note for the report — Enter adds it"}
            style={{ background: "var(--sh-field)", border: "1px solid var(--sh-chip-line)", boxShadow: "none", color: "var(--sh-fg)" }}
            className="bare-field h-10 min-w-0 flex-1 rounded-[11px] px-3 text-[13px] outline-none placeholder:text-[var(--sh-muted)]" />
          {busy && <Loader2 size={14} className="mt-3 animate-spin text-[var(--sh-fg)]" />}
        </div>
      </div>
    </section>
  );
}
