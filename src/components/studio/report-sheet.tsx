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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, CalendarDays, Check, ChevronDown, Copy, Download, FileText, Loader2, Mail, MessageCircle, Plus, Search, Send, Trash2, UserRound, X } from "lucide-react";
import { StudioSheet } from "@/components/studio/sheet";
import { StudioPeoplePick } from "@/components/studio/people-pick";
import { fetchPdf, savePdf } from "@/components/documents/brief-pdf-button";
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
const CHIP_OFF = "border-[var(--sh-field-line)] bg-[var(--sh-field)] text-[var(--sh-fg)] hover:bg-[var(--sh-hover)]";
const CHIP_ON = "border-transparent bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]";
const BTN = "inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--sh-field-line)] bg-[var(--sh-field)] px-3.5 text-[13px] font-medium text-[var(--sh-fg)] transition-colors hover:bg-[var(--sh-hover)] disabled:opacity-50";
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
  // One filter open at a time, under the row of three.
  const [panel, setPanel] = useState<"period" | "company" | "person" | null>(null);
  const [coQ, setCoQ] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const start = useCallback((d: { companyIds?: number[]; personIds?: number[]; period?: string }) => {
    setCompanyIds(d.companyIds ?? []);
    setPersonIds(d.personIds ?? []);
    const p = d.period ?? "month";
    if (p.startsWith("on:")) { setMonths(p.slice(3).split(",").filter(Boolean)); setPreset("month"); }
    else { setMonths([]); setPreset((PRESETS.some((x) => x.id === p) ? p : "month") as Preset); }
    setPanel(null); setCoQ(""); setEmailing(false); setFlash(null);
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
  // The filters' lists are small: fetch them a few seconds after any page
  // loads, so the sheet opens with them ready.
  useEffect(() => {
    const t = setTimeout(() => { reportOptions().then((o) => setOpts((cur) => cur ?? o)).catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, []);

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
    // At once when the sheet opens; a beat after a filter changes.
    const t = setTimeout(() => {
      reportSummary(input).then((s) => { if (n === seq.current) setSum(s); })
        .catch(() => { if (n === seq.current) setFlash("Couldn't build the report — try again."); })
        .finally(() => { if (n === seq.current) setLoading(false); });
    }, sum ? 220 : 0);
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
  // The PDF is drawn on the server in the background once the filters have
  // settled, so Download is usually instant (26 Sept 2026: it took seconds and
  // showed a blank page). `ready` = a PDF a phone wants a fresh tap to share.
  const prefetch = useRef<{ href: string; file: Promise<File> } | null>(null);
  const [ready, setReady] = useState<{ href: string; file: File } | null>(null);
  useEffect(() => {
    if (!open || !opts || loading) return;
    const t = setTimeout(() => {
      const href = pdfHref();
      if (!href || prefetch.current?.href === href) return;
      const file = fetchPdf(href);
      file.catch(() => { if (prefetch.current?.href === href) prefetch.current = null; });
      prefetch.current = { href, file };
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opts, loading, input]);
  async function download() {
    const href = pdfHref();
    if (!href) return;
    if (ready?.href === href) { const r = await savePdf(ready.file); if (r === "done") setReady(null); return; }
    setBusy("pdf");
    try {
      const pre = prefetch.current?.href === href ? prefetch.current.file : null;
      const file = await (pre ?? fetchPdf(href));
      if (!pre) prefetch.current = { href, file: Promise.resolve(file) };
      const r = await savePdf(file);
      if (r === "blocked") { setReady({ href, file }); say("The PDF is ready — tap Save PDF."); }
    } catch {
      window.location.href = href + (href.includes("?") ? "&" : "?") + "download=1";
    } finally {
      setBusy(null);
    }
  }
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const peopleNames = (opts?.people ?? []).filter((p) => personIds.includes(p.id)).map((p) => p.name);
  const coNames = (opts?.companies ?? []).filter((c) => companyIds.includes(c.id)).map((c) => c.name);
  const monthLabels = (opts?.months ?? []).filter((m) => months.includes(m.value)).map((m) => m.label);
  const periodValue = months.length ? (months.length === 1 ? monthLabels[0] ?? "1 month" : `${months.length} months`) : PRESETS.find((p) => p.id === preset)?.label ?? "This month";
  const coValue = coNames.length === 0 ? "All companies" : coNames.length === 1 ? coNames[0] : `${coNames.length} companies`;
  const personValue = peopleNames.length === 0 ? "Everyone" : peopleNames.length === 1 ? peopleNames[0] : `${peopleNames.length} people`;
  const filtered = months.length > 0 || preset !== "month" || companyIds.length > 0 || personIds.length > 0;
  const flip = (k: "period" | "company" | "person") => setPanel((p) => (p === k ? null : k));
  const coList = (opts?.companies ?? []).filter((c) => !coQ.trim() || c.name.toLowerCase().includes(coQ.trim().toLowerCase()));

  return (
    <StudioSheet open={open} onClose={() => setOpen(false)} title="Report" icon={<FileText size={15} />} width={600} centred
      footer={
        <div className="flex flex-col gap-2.5">
          {flash && <div role="status" className="text-[12.5px] text-[var(--sh-fg)]">{flash}</div>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button type="button" disabled={!opts || busy === "pdf"} onClick={() => void download()}
              className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--sh-on-bg)] px-3.5 text-[13px] font-semibold text-[var(--sh-on-fg)] transition-opacity hover:opacity-90 disabled:opacity-50 sm:col-span-2">
              {busy === "pdf" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}{busy === "pdf" ? "Preparing the PDF…" : ready?.href === pdfHref() ? "Save PDF" : "Download PDF"}
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
            }} className={cn(BTN, "sm:col-span-5")}>{busy === "draft" ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}<span className="sm:hidden">Outbox draft</span><span className="hidden sm:inline">Save as a draft in the Outbox</span></button>
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
          <div className="flex items-center justify-between">
            <div className={LABEL}>Filters</div>
            {filtered && (
              <button type="button" onClick={() => { setPreset("month"); setMonths([]); setCompanyIds([]); setPersonIds([]); setPanel(null); }}
                className="mb-1.5 text-[12px] text-[var(--sh-sub)] underline-offset-2 hover:text-[var(--sh-fg)] hover:underline">Clear all</button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <FilterBtn icon={<CalendarDays size={12} />} label="Period" value={periodValue} open={panel === "period"} set={months.length > 0 || preset !== "month"} onClick={() => flip("period")} />
            <FilterBtn icon={<Building2 size={12} />} label="Company" value={coValue} short={companyIds.length ? undefined : "All"} open={panel === "company"} set={companyIds.length > 0} onClick={() => flip("company")} />
            <FilterBtn icon={<UserRound size={12} />} label="Person" value={personValue} open={panel === "person"} set={personIds.length > 0} onClick={() => flip("person")} />
          </div>

          {panel && (
            <div className="st-pop mt-2 rounded-[14px] border border-[var(--sh-chip-line)] bg-[var(--sh-card)] p-3">
              {panel === "period" && (
                <>
                  <div className="grid grid-cols-4 gap-1 rounded-[12px] bg-[var(--sh-field)] p-1">
                    {PRESETS.map((p) => {
                      const on = !months.length && preset === p.id;
                      return (
                        <button key={p.id} type="button" onClick={() => { setPreset(p.id); setMonths([]); }} aria-pressed={on}
                          className={cn("h-8 truncate rounded-[9px] px-1 text-[12px] transition-colors", on ? "bg-[var(--sh-on-bg)] font-medium text-[var(--sh-on-fg)]" : "text-[var(--sh-fg)] hover:bg-[var(--sh-hover)]")}>{p.label}</button>
                      );
                    })}
                  </div>
                  <div className="mb-1.5 mt-3 text-[11.5px] text-[var(--sh-sub)]">Or choose months — pick several to combine them</div>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {(opts?.months ?? []).map((m) => {
                      const on = months.includes(m.value);
                      return (
                        <button key={m.value} type="button" aria-pressed={on} onClick={() => setMonths((l) => (on ? l.filter((x) => x !== m.value) : [...l, m.value]))}
                          className={cn("inline-flex h-8 items-center justify-center gap-1 truncate rounded-[9px] border px-2 text-[12px] transition-colors", on ? CHIP_ON : CHIP_OFF)}>
                          {on && <Check size={11} />}{m.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {panel === "company" && (
                <>
                  {(opts?.companies.length ?? 0) > 8 && (
                    <label className="mb-2 flex h-9 items-center gap-2 rounded-[10px] border border-[var(--sh-field-line)] bg-[var(--sh-field)] px-3 text-[var(--sh-muted)]">
                      <Search size={14} />
                      <input value={coQ} onChange={(e) => setCoQ(e.target.value)} placeholder="Find a company"
                        className="bare-field w-full border-0 bg-transparent text-[13px] text-[var(--sh-fg)] outline-none placeholder:text-[var(--sh-muted)]" />
                    </label>
                  )}
                  <div className="grid max-h-[232px] grid-cols-1 gap-0.5 overflow-y-auto sm:grid-cols-2">
                    {!coQ.trim() && <CheckRow on={!companyIds.length} label="All companies" onClick={() => setCompanyIds([])} />}
                    {coList.map((c) => <CheckRow key={c.id} on={companyIds.includes(c.id)} label={c.name} onClick={() => setCompanyIds((l) => toggle(l, c.id))} />)}
                    {coList.length === 0 && <div className="px-2 py-3 text-[12.5px] text-[var(--sh-sub)]">No company matches.</div>}
                  </div>
                </>
              )}

              {panel === "person" && (
                <StudioPeoplePick tone="sheet" autoFocus people={opts?.people ?? []} value={peopleNames}
                  onChange={(names) => setPersonIds((opts?.people ?? []).filter((p) => names.includes(p.name)).map((p) => p.id))} maxHeight={200} />
              )}

              <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-[var(--sh-line)] pt-2.5">
                {((panel === "period" && (months.length > 0 || preset !== "month")) || (panel === "company" && companyIds.length > 0) || (panel === "person" && personIds.length > 0)) && (
                  <button type="button" onClick={() => { if (panel === "period") { setPreset("month"); setMonths([]); } else if (panel === "company") setCompanyIds([]); else setPersonIds([]); }}
                    className="mr-auto text-[12px] text-[var(--sh-sub)] hover:text-[var(--sh-fg)] hover:underline">Reset</button>
                )}
                <button type="button" onClick={() => setPanel(null)} className={cn(CHIP, CHIP_ON)}>Done</button>
              </div>
            </div>
          )}
        </section>

        {opts?.canNote && sum && <Notes notes={sum.notes} companyId={companyIds.length === 1 ? companyIds[0] : null} onChange={() => setCompanyIds((l) => [...l])} />}
      </div>
    </StudioSheet>
  );
}

/** One of the three filters: what it is, and what it is set to. */
function FilterBtn({ icon, label, value, short, open, set, onClick }: { icon: ReactNode; label: string; value: string; short?: string; open: boolean; set: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open}
      className={cn("flex h-[54px] min-w-0 items-center gap-2 rounded-[12px] border px-2.5 text-left sm:px-3 transition-colors",
        open ? "border-[var(--sh-fg)] bg-[var(--sh-card)]" : "border-[var(--sh-field-line)] bg-[var(--sh-field)] hover:bg-[var(--sh-hover)]")}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--sh-sub)]">{icon}{label}{set && <span aria-label="set" className="h-1.5 w-1.5 rounded-full bg-[#19C37D]" />}</span>
        <span className={cn("mt-0.5 block truncate text-[13px] text-[var(--sh-fg)]", set && "font-medium")}>
          {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{value}</span></> : value}
        </span>
      </span>
      <ChevronDown size={14} className={cn("hidden shrink-0 text-[var(--sh-sub)] transition-transform sm:block", open && "rotate-180")} />
    </button>
  );
}

function CheckRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className="flex h-9 min-w-0 items-center gap-2.5 rounded-[10px] px-2 text-left text-[13px] text-[var(--sh-fg)] transition-colors hover:bg-[var(--sh-hover)]">
      <span className={cn("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border", on ? "border-transparent bg-[var(--sh-on-bg)] text-[var(--sh-on-fg)]" : "border-[var(--sh-field-line)] bg-[var(--sh-field)]")}>
        {on && <Check size={12} strokeWidth={2.6} />}
      </span>
      <span className={cn("min-w-0 truncate", on && "font-medium")}>{label}</span>
    </button>
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
        style={{ background: "var(--sh-field)", border: "1px solid var(--sh-field-line)", boxShadow: "none", color: "var(--sh-fg)" }}
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
            style={{ background: "var(--sh-field)", border: "1px solid var(--sh-field-line)", boxShadow: "none", color: "var(--sh-fg)" }}
            className="bare-field h-10 min-w-0 flex-1 rounded-[11px] px-3 text-[13px] outline-none placeholder:text-[var(--sh-muted)]" />
          {busy && <Loader2 size={14} className="mt-3 animate-spin text-[var(--sh-fg)]" />}
        </div>
      </div>
    </section>
  );
}
