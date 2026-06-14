import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { sb } from "@/db/supabase";
import { getRiskRegister, getDecisions, getKeyPersons, getBeneficialOwners, getCompanyGovernance } from "@/lib/governance";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { gatherSafetyFindings } from "@/lib/safety-net";
import { portfolioLeaveLiability } from "@/lib/leave";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { BRAND_NAME } from "@/lib/brand";

// Server-side PDF of the board pack (transfer-pack 04). Rendered with
// @react-pdf/renderer — no headless browser, so it runs in a serverless cron and
// can be attached to the monthly email. Mirrors /brief/board's content.

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString("en-GB")}`;

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#111", fontFamily: "Helvetica", lineHeight: 1.4 },
  confidential: { fontSize: 7, color: "#b91c1c", fontFamily: "Helvetica-Bold", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: "#555", marginBottom: 10 },
  section: { marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#e5e5e5" },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1d4ed8", marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  statGrid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "25%", marginBottom: 6 },
  statN: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  statL: { fontSize: 7, color: "#666", textTransform: "uppercase" },
  card: { marginBottom: 4, padding: 4, backgroundColor: "#f5f6f8", borderRadius: 3 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  chip: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2 },
  small: { fontSize: 8, color: "#444" },
});

const bandColor = (band: string) => (band === "Critical" || band === "High" ? "#b91c1c" : band === "Medium" ? "#b45309" : "#6b7280");

async function gatherBoardData() {
  const { data: companyRows } = await sb.from("companies").select("id,name").eq("active", true).order("name");
  const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const [risks, decisions, keyPersons, ubo, documents, liability] = await Promise.all([
    getRiskRegister(), getDecisions(), getKeyPersons(), getBeneficialOwners(), listDocuments(), portfolioLeaveLiability(),
  ]);
  const [companyScores, personScores, findings, ...governance] = await Promise.all([
    buildCompanyRequirementScores(companies), buildPersonRequirementScores(), gatherSafetyFindings(),
    ...companies.map((c) => getCompanyGovernance(c.id)),
  ]);
  const govByCompany = new Map(companies.map((c, i) => [c.id, governance[i]]));
  const gaps = [...companyScores, ...personScores].reduce((a, x) => a + x.missing + x.expired, 0);
  const immDocs = documents.filter((d) => !d.archived && (d.category === "Immigration" || d.category === "Passport")).filter((d) => ["Expired", "Expiring"].includes(deriveDocStatus(d)));
  return { companies, risks, decisions, keyPersons, ubo, liability, companyScores, personScores, findings, govByCompany, gaps, immDocs };
}

export async function renderBoardPackPdf(asOf = new Date()): Promise<Buffer> {
  const d = await gatherBoardData();
  const critical = d.risks.filter((r) => r.band === "Critical" || r.band === "High").length;
  const pending = d.decisions.filter((x) => x.status === "Pending").length;

  const doc = (
    <Document title={`${BRAND_NAME} Board Pack`}>
      <Page size="A4" style={s.page} wrap>
        <Text style={s.confidential}>Confidential · Director &amp; CFO only</Text>
        <Text style={s.h1}>{BRAND_NAME} — Board Pack</Text>
        <Text style={s.sub}>As at {asOf.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</Text>

        <View style={s.section}>
          <Text style={s.h2}>Executive summary</Text>
          <View style={s.statGrid}>
            <Stat n={String(d.companies.length)} l="Companies" />
            <Stat n={String(d.personScores.length)} l="People" />
            <Stat n={String(d.gaps)} l="Compliance gaps" />
            <Stat n={String(critical)} l="Critical/High risks" />
            <Stat n={String(pending)} l="Pending decisions" />
            <Stat n={tzs(d.liability.totalCost)} l={d.liability.peopleNoWage ? `Leave liability (excl. ${d.liability.peopleNoWage})` : "Leave liability"} />
            <Stat n={String(d.immDocs.length)} l="Expiring immigration" />
            <Stat n={String(d.findings.filter((f) => f.severity !== "low").length)} l="Data issues" />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Risk register</Text>
          {d.risks.length === 0 ? <Text style={s.muted}>No risks recorded.</Text> : d.risks.map((r) => (
            <View key={r.id} style={s.card}>
              <View style={s.row}>
                <Text><Text style={[s.chip, { backgroundColor: bandColor(r.band) }]}>{r.band} {r.score}</Text>  <Text style={s.bold}>{r.title}</Text></Text>
                <Text style={s.small}>{r.code}</Text>
              </View>
              {r.description ? <Text style={s.small}>{r.description}</Text> : null}
              {r.mitigation ? <Text style={[s.small, s.muted]}>Mitigation: {r.mitigation}</Text> : null}
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Decisions &amp; approvals</Text>
          {d.decisions.length === 0 ? <Text style={s.muted}>None logged.</Text> : d.decisions.map((x) => (
            <View key={x.id} style={{ marginBottom: 3 }}>
              <Text><Text style={[s.chip, { backgroundColor: x.status === "Pending" ? "#b45309" : "#15803d" }]}>{x.status}</Text>  <Text style={s.bold}>{x.title}</Text> <Text style={s.muted}>· {[x.companyName, x.type, x.due ? `due ${fmtDate(x.due)}` : null].filter(Boolean).join(" · ")}</Text></Text>
              {x.context ? <Text style={s.small}>{x.context}</Text> : null}
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Key-person concentration</Text>
          {d.keyPersons.length === 0 && <Text style={s.muted}>No key-person data.</Text>}
          {d.keyPersons.map((k) => (
            <View key={k.id} style={{ marginBottom: 2 }}>
              <Text><Text style={s.bold}>{k.name}</Text>{k.risk ? <Text style={[s.chip, { backgroundColor: k.risk === "Critical" ? "#b91c1c" : "#b45309", marginLeft: 4 }]}> {k.risk}</Text> : null}  <Text style={s.muted}>director x{k.directorOf ?? 0} · secretary x{k.secretaryOf ?? 0} · signatory x{k.signatoryOf ?? 0} · shareholder x{k.shareholderOf ?? 0}</Text></Text>
              {k.note ? <Text style={s.small}>{k.note}</Text> : null}
            </View>
          ))}
        </View>

        {d.ubo.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Beneficial owners</Text>
            {d.ubo.map((u) => (
              <Text key={u.id} style={{ marginBottom: 1 }}><Text style={s.bold}>{u.personName}</Text>{!u.complete ? <Text style={[s.chip, { backgroundColor: "#b45309", marginLeft: 4 }]}> incomplete</Text> : null} <Text style={s.muted}>{u.interests ?? ""}</Text></Text>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.h2}>Ownership &amp; signatories by company</Text>
          {d.companies.map((c) => {
            const g = d.govByCompany.get(c.id);
            if (!g || (g.capTable.holders.length === 0 && g.signatories.length === 0)) return null;
            return (
              <View key={c.id} style={s.card}>
                <Text style={s.bold}>{c.name}</Text>
                {g.capTable.holders.length > 0 ? <Text style={s.small}>{g.capTable.holders.map((h) => `${h.holder} ${h.pct != null ? `${h.pct}%` : ""}`.trim()).join(" · ")}</Text> : null}
                {g.signatories.length > 0 ? <Text style={[s.small, s.muted]}>Signatories: {g.signatories.map((x) => x.name).join(", ")}</Text> : null}
              </View>
            );
          })}
          {d.companies.every((c) => { const g = d.govByCompany.get(c.id); return !g || (g.capTable.holders.length === 0 && g.signatories.length === 0); }) && (
            <Text style={s.muted}>No ownership data recorded yet.</Text>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Immigration &amp; passports expiring</Text>
          {d.immDocs.length === 0 ? <Text style={s.muted}>Nothing expiring.</Text> : d.immDocs.map((x) => (
            <View key={x.id} style={s.row}><Text style={s.small}>{x.title}</Text><Text style={s.small}>{deriveDocStatus(x)} · {fmtDate(x.expiryDate ? x.expiryDate.toISOString() : null)}</Text></View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Safety-net appendix</Text>
          {d.findings.length === 0 ? <Text style={s.muted}>No data-quality issues.</Text> : d.findings.map((f) => (
            <Text key={f.id} style={s.small}><Text style={s.bold}>[{f.severity}]</Text> {f.title} — {f.detail}</Text>
          ))}
        </View>

        <Text style={[s.small, s.muted, { marginTop: 12 }]}>Generated by {BRAND_NAME}. Confirm material figures with the accountant.</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{l}</Text>
    </View>
  );
}
