import { Lock, ShieldAlert, Landmark, Users, AlertTriangle, Gavel, ClipboardCheck } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { sb } from "@/db/supabase";
import { getRiskRegister, getDecisions, getKeyPersons, getBeneficialOwners, getCompanyGovernance } from "@/lib/governance";
import { RISK_BAND_TONE } from "@/lib/governance-shared";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { portfolioLeaveLiability } from "@/lib/leave";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { BRAND_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString("en-GB")}`;

const BAND_CLASS: Record<"danger" | "warn" | "accent" | "muted", string> = {
  danger: "bg-danger-soft text-danger",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-fg",
  muted: "bg-bg-muted text-fg-muted",
};

export default async function BoardPackPage() {
  const today = new Date();
  const [{ data: companyRows }, risks, decisions, keyPersons, ubo, documents, liability] = await Promise.all([
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    getRiskRegister(),
    getDecisions(),
    getKeyPersons(),
    getBeneficialOwners(),
    listDocuments(),
    portfolioLeaveLiability(),
  ]);
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  const [companyScores, personScores, findings, ...governance] = await Promise.all([
    buildCompanyRequirementScores(companies),
    buildPersonRequirementScores(),
    gatherSafetyFindings(),
    ...companies.map((c) => getCompanyGovernance(c.id)),
  ]);
  const govByCompany = new Map(companies.map((c, i) => [c.id, governance[i]]));

  // Headline numbers.
  const peopleCount = personScores.length;
  const gaps = [...companyScores, ...personScores].reduce((s, x) => s + x.missing + x.expired, 0);
  const criticalRisks = risks.filter((r) => r.band === "Critical" || r.band === "High").length;
  const pendingDecisions = decisions.filter((d) => d.status === "Pending").length;

  // Expiring immigration / passports (board cares about expat continuity).
  const immDocs = documents
    .filter((d) => !d.archived && (d.category === "Immigration" || d.category === "Passport"))
    .filter((d) => { const s = deriveDocStatus(d); return s === "Expired" || s === "Expiring"; })
    .sort((a, b) => (a.expiryDate?.getTime() ?? 0) - (b.expiryDate?.getTime() ?? 0));

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      {/* Header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
            <Lock size={11} /> Confidential · Director &amp; CFO only
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{BRAND_NAME} — Board Pack</h1>
          <p className="text-sm text-fg-muted">As at {today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="print-hidden"><PrintButton label="Save as PDF" /></div>
      </header>

      {/* 1. Executive summary */}
      <Section icon={<ClipboardCheck size={15} />} title="Executive summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Companies" value={String(companies.length)} />
          <Stat label="People" value={String(peopleCount)} />
          <Stat label="Compliance gaps" value={String(gaps)} tone={gaps ? "warn" : "ok"} />
          <Stat label="Critical/High risks" value={String(criticalRisks)} tone={criticalRisks ? "danger" : "ok"} />
          <Stat label="Pending decisions" value={String(pendingDecisions)} tone={pendingDecisions ? "warn" : "ok"} />
          <Stat label="Leave liability" value={tzs(liability.totalCost)} />
          <Stat label="Expiring immigration" value={String(immDocs.length)} tone={immDocs.length ? "warn" : "ok"} />
          <Stat label="Data-quality issues" value={String(findings.filter((f) => f.severity !== "low").length)} />
        </div>
      </Section>

      {/* 2. Risk register */}
      <Section icon={<AlertTriangle size={15} />} title="Risk register">
        {risks.length === 0 ? <Empty>No risks recorded.</Empty> : (
          <div className="space-y-2">
            {risks.map((r) => (
              <div key={r.id} className="rounded-lg bg-bg-subtle/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BAND_CLASS[RISK_BAND_TONE[r.band]]}`}>{r.band} · {r.score}</span>
                  <span className="text-[13px] font-medium">{r.title}</span>
                  <span className="ml-auto text-[10px] text-fg-subtle">{r.code}</span>
                </div>
                {r.description && <p className="mt-1 text-[12px] text-fg-muted">{r.description}</p>}
                {r.mitigation && <p className="mt-0.5 text-[11px] text-fg-subtle"><span className="font-medium">Mitigation:</span> {r.mitigation}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 3. Decisions log */}
      <Section icon={<Gavel size={15} />} title="Decisions & approvals">
        {decisions.length === 0 ? <Empty>No decisions logged.</Empty> : (
          <ul className="space-y-1.5">
            {decisions.map((d) => (
              <li key={d.id} className="flex items-start gap-2 text-[12px]">
                <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${d.status === "Pending" ? "bg-warn-soft text-warn" : "bg-success-soft text-success"}`}>{d.status}</span>
                <span className="min-w-0">
                  <span className="font-medium text-fg">{d.title}</span>
                  <span className="text-fg-subtle"> · {[d.companyName, d.type, d.due ? `due ${fmtDate(d.due)}` : null].filter(Boolean).join(" · ")}</span>
                  {d.context && <span className="block text-[11px] text-fg-muted">{d.context}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 4. Governance — key persons + UBO */}
      <Section icon={<ShieldAlert size={15} />} title="Key-person concentration">
        {keyPersons.length === 0 ? <Empty>No key-person data.</Empty> : (
          <ul className="space-y-1.5">
            {keyPersons.map((k) => (
              <li key={k.id} className="text-[12px]">
                <span className="font-medium">{k.name}</span>
                {k.risk && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${k.risk === "Critical" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{k.risk}</span>}
                <span className="ml-2 text-fg-subtle">director ×{k.directorOf ?? 0} · secretary ×{k.secretaryOf ?? 0} · signatory ×{k.signatoryOf ?? 0} · shareholder ×{k.shareholderOf ?? 0}</span>
                {k.note && <span className="block text-[11px] text-fg-muted">{k.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {ubo.length > 0 && (
        <Section icon={<Users size={15} />} title="Beneficial owners">
          <ul className="space-y-1">
            {ubo.map((u) => (
              <li key={u.id} className="text-[12px]">
                <span className="font-medium">{u.personName}</span>
                {!u.complete && <span className="ml-2 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] text-warn">incomplete</span>}
                {u.interests && <span className="block text-[11px] text-fg-muted">{u.interests}</span>}
                {u.flag && <span className="block text-[11px] text-fg-subtle">{u.flag}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5. Per-company cap tables + signatories */}
      <Section icon={<Landmark size={15} />} title="Ownership &amp; signatories by company">
        <div className="space-y-3">
          {companies.map((c) => {
            const g = govByCompany.get(c.id);
            if (!g || (g.capTable.holders.length === 0 && g.signatories.length === 0)) return null;
            return (
              <div key={c.id} className="rounded-lg bg-bg-subtle/40 px-3 py-2">
                <div className="text-[13px] font-semibold">{c.name}</div>
                {g.capTable.holders.length > 0 && (
                  <div className="mt-1 text-[12px] text-fg-muted">
                    {g.capTable.holders.map((h) => `${h.holder} ${h.pct != null ? `${h.pct}%` : ""}`.trim()).join(" · ")}
                  </div>
                )}
                {g.signatories.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-fg-subtle">Signatories: {g.signatories.map((s) => s.name).join(", ")}</div>
                )}
              </div>
            );
          })}
          {companies.every((c) => { const g = govByCompany.get(c.id); return !g || (g.capTable.holders.length === 0 && g.signatories.length === 0); }) && (
            <Empty>No ownership data recorded yet.</Empty>
          )}
        </div>
      </Section>

      {/* 6. People & immigration */}
      <Section icon={<Users size={15} />} title="Immigration & passports expiring">
        {immDocs.length === 0 ? <Empty>Nothing expiring.</Empty> : (
          <ul className="space-y-1 text-[12px]">
            {immDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${deriveDocStatus(d) === "Expired" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{deriveDocStatus(d)}</span>
                <span className="truncate">{d.title}</span>
                <span className="ml-auto shrink-0 text-fg-subtle">{fmtDate(d.expiryDate ? d.expiryDate.toISOString() : null)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 7. Safety-net appendix */}
      <Section icon={<ShieldAlert size={15} />} title="Safety-net appendix">
        {findings.length === 0 ? <Empty>No data-quality issues.</Empty> : (
          <ul className="space-y-1 text-[12px]">
            {findings.map((f) => (
              <li key={f.id} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-fg-subtle uppercase text-[10px] w-12">{f.severity}</span>
                <span><span className="font-medium">{f.title}</span> — <span className="text-fg-muted">{f.detail}</span></span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-[10px] text-fg-subtle">
        Generated by {BRAND_NAME}. Figures are computed from current records; confirm material numbers with the accountant.
      </p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="glass elevated rounded-2xl p-4 space-y-3 break-inside-avoid">
      <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">{icon} {title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: string; tone?: "ok" | "warn" | "danger" | "muted" }) {
  const cls = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-success" : "text-fg";
  return (
    <div className="rounded-lg bg-bg-subtle/40 px-3 py-2">
      <div className={`text-lg font-semibold tabular ${cls}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-fg-subtle">{children}</p>;
}
