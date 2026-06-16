import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { BriefData } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";

// Server-side PDF of the Director Brief — rendered with @react-pdf/renderer (no
// headless browser, so it runs in a serverless route and can be attached to an
// email). Mirrors the on-screen brief + the old print-only detailed report, but
// as a real, paginated, downloadable file. Built from an already-loaded
// BriefData so it reuses exactly the same numbers the page shows.
//
// Note: the detailed report carries NO salary/wage figures, so the same PDF is
// safe for directors on the portal as for the owner on /brief.

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 48, paddingHorizontal: 40, fontSize: 9, color: "#1c1c1c", fontFamily: "Helvetica", lineHeight: 1.45 },
  eyebrow: { fontSize: 8, color: "#2563eb", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 2 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: "#666", marginTop: 2 },
  summary: { fontSize: 9.5, color: "#333", marginTop: 12, lineHeight: 1.5 },

  statGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, marginHorizontal: -3 },
  stat: { width: "25%", paddingHorizontal: 3, marginBottom: 6 },
  statBox: { borderWidth: 1, borderColor: "#e7e7e9", borderRadius: 5, padding: 7 },
  statN: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  statL: { fontSize: 7, color: "#777", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 },

  section: { marginTop: 16 },
  h2: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "#111", marginBottom: 1 },
  h2note: { fontSize: 7.5, color: "#888", marginBottom: 5 },

  companyHead: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  companyName: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  companyStats: { fontSize: 8, color: "#888", marginLeft: 5 },

  table: { marginTop: 3 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ededed" },
  thead: { borderBottomWidth: 1.2, borderBottomColor: "#cfcfcf" },
  trAlt: { backgroundColor: "#fafafa" },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#555", textTransform: "uppercase", letterSpacing: 0.3, paddingVertical: 3, paddingHorizontal: 4 },
  td: { fontSize: 8.5, color: "#222", paddingVertical: 3, paddingHorizontal: 4 },

  muted: { color: "#888" },
  empty: { fontSize: 8.5, color: "#999", marginTop: 3, fontStyle: "italic" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#aaa" },
});

function Stat({ n, l }: { n: string | number; l: string }) {
  return (
    <View style={s.stat}>
      <View style={s.statBox}>
        <Text style={s.statN}>{n}</Text>
        <Text style={s.statL}>{l}</Text>
      </View>
    </View>
  );
}

/** A simple flowing table. Header repeats on each page (`fixed`); rows never
 *  split across a page break (`wrap={false}`). Column widths are percentages. */
function Table({ head, widths, rows }: { head: string[]; widths: string[]; rows: Array<Array<string | number>> }) {
  return (
    <View style={s.table}>
      <View style={[s.tr, s.thead]} fixed>
        {head.map((h, i) => (
          <Text key={i} style={[s.th, { width: widths[i] }]}>{h}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={ri % 2 ? [s.tr, s.trAlt] : [s.tr]} wrap={false}>
          {r.map((c, ci) => (
            <Text key={ci} style={[s.td, { width: widths[ci] }]}>{c === "" || c == null ? "—" : c}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {note ? <Text style={s.h2note}>{note}</Text> : null}
      {children}
    </View>
  );
}

export async function renderBriefPdf(b: BriefData, asOf = new Date()): Promise<Buffer> {
  const title = b.selectedCompanyName ?? BRAND_NAME;
  const inProgressTotal = b.companies.reduce((n, c) => n + c.inProgress, 0);

  // Rule-based executive summary — deterministic, never invents anything.
  const summary =
    `In ${b.monthLabel}, ${BRAND_NAME} delivered ${b.deliveredCount} item${b.deliveredCount === 1 ? "" : "s"} across ${b.companyCount} portfolio companies. ` +
    `${b.openCount} item${b.openCount === 1 ? "" : "s"} remain open (${inProgressTotal} in progress)` +
    `${b.overdueCount ? `, with ${b.overdueCount} overdue requiring attention` : ", with nothing overdue"}.` +
    `${b.watch.length ? ` ${b.watch.length} item${b.watch.length === 1 ? "" : "s"} are flagged for attention.` : ""}` +
    `${b.directorActions.length ? ` ${b.directorActions.length} recommended director action${b.directorActions.length === 1 ? "" : "s"} listed.` : ""}` +
    `${b.compliance.length ? ` ${b.compliance.length} compan${b.compliance.length === 1 ? "y has" : "ies have"} compliance issues.` : ""}`;

  const companiesWithWork = b.companies.filter((c) => c.tasks.length > 0);

  const doc = (
    <Document title={`${title} — Director Brief`} author={BRAND_NAME}>
      <Page size="A4" style={s.page} wrap>
        {/* Cover header */}
        <Text style={s.eyebrow}>Director Brief</Text>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>{b.monthLabel} · as at {b.asAt}</Text>

        <Text style={s.summary}>{summary}</Text>

        {/* Top-line stats */}
        <View style={s.statGrid}>
          <Stat n={b.deliveredCount} l="Delivered" />
          <Stat n={b.openCount} l="Open" />
          <Stat n={b.overdueCount} l="Overdue" />
          <Stat n={b.companyCount} l="Companies" />
        </View>

        {/* 1 — Recommended director actions */}
        {b.directorActions.length > 0 && (
          <Section title="Recommended director actions" note="Live follow-up points from task risk and document compliance.">
            <Table
              head={["Type", "Company", "Action", "Urgency"]}
              widths={["13%", "22%", "53%", "12%"]}
              rows={b.directorActions.map((a) => [a.type, a.companyName, `${a.headline} · ${a.detail}`, a.urgency])}
            />
          </Section>
        )}

        {/* 2 — Admin & HR updates (operator notes) */}
        {b.notes.length > 0 && (
          <Section title="Admin & HR updates" note={`Notes recorded for ${b.monthLabel} that are not tracked as tasks.`}>
            <Table
              head={["Company", "Update", "Date"]}
              widths={["22%", "64%", "14%"]}
              rows={b.notes.map((n) => [n.companyName ?? "Portfolio", n.body, fmtDay(n.noteDate)])}
            />
          </Section>
        )}

        {/* 3 — Delivered this period */}
        {b.delivered.length > 0 && (
          <Section title={`Delivered in ${b.monthLabel}`} note={`${b.deliveredCount} item${b.deliveredCount === 1 ? "" : "s"} completed or closed in the period.`}>
            <Table
              head={["Company", "Task", "Status", "Closed"]}
              widths={["24%", "48%", "14%", "14%"]}
              rows={b.delivered.flatMap((g) => g.items.map((t) => [g.company, t.actionItem, t.status, fmtDay(t.closedDate)]))}
            />
          </Section>
        )}

        {/* 4 — Open work by company */}
        <Section title="Open work by company" note={`All open items, including those in progress, as at ${b.asAt}.`}>
          {companiesWithWork.length === 0 ? (
            <Text style={s.empty}>No open work.</Text>
          ) : (
            companiesWithWork.map((c) => (
              <View key={c.id} wrap={false}>
                <View style={s.companyHead}>
                  <View style={[s.dot, { backgroundColor: c.accent || "#2563eb" }]} />
                  <Text style={s.companyName}>{c.name}</Text>
                  <Text style={s.companyStats}>— {c.open} open · {c.inProgress} in progress · {c.overdue} overdue</Text>
                </View>
                <Table
                  head={["Task", "Accountable", "Priority", "Deadline", "Status", "Latest update"]}
                  widths={["30%", "14%", "10%", "12%", "12%", "22%"]}
                  rows={c.tasks.map((t) => [
                    t.actionItem,
                    t.owner,
                    t.priority,
                    t.overdue ? "overdue" : t.deadline ? fmtDay(t.deadline) : "—",
                    t.status,
                    t.latestUpdate ?? "—",
                  ])}
                />
              </View>
            ))
          )}
        </Section>

        {/* 5 — Company compliance */}
        {b.compliance.length > 0 && (
          <Section title="Company compliance watch" note={`Document compliance issues by company as at ${b.asAt}.`}>
            <Table
              head={["Company", "Score", "Missing", "Expired", "Expiring", "Detail"]}
              widths={["22%", "9%", "19%", "10%", "10%", "30%"]}
              rows={b.compliance.map((c) => [
                c.companyName,
                `${c.score}%`,
                c.gaps.slice(0, 2).join(", ") || "—",
                c.expired || "—",
                c.expiring || "—",
                c.issues.slice(0, 2).join("; ") || c.status,
              ])}
            />
          </Section>
        )}

        {/* 6 — People & HR (no salary/wage figures) */}
        {b.hr.headcount > 0 && (
          <Section
            title="People & HR"
            note={
              `${b.hr.headcount} active` +
              (b.hr.joiners ? ` · ${b.hr.joiners} joined this period` : "") +
              (b.hr.onLeaveToday ? ` · ${b.hr.onLeaveToday} on leave today` : "") +
              (b.hr.pendingLeave.length ? ` · ${b.hr.pendingLeave.length} leave request${b.hr.pendingLeave.length === 1 ? "" : "s"} to approve` : "") +
              `, as at ${b.asAt}.`
            }
          >
            {b.hr.byCompany.length > 0 && (
              <Table
                head={["Company", "Headcount", "By type"]}
                widths={["30%", "16%", "54%"]}
                rows={b.hr.byCompany.map((c) => [c.name, c.count, b.hr.byType.map((t) => `${t.label}: ${t.count}`).join(" · ")])}
              />
            )}
          </Section>
        )}

        {b.hr.compliancePeople.length > 0 && (
          <Section title={`Staff below full document compliance · ${b.hr.belowFullCount}`}>
            <Table
              head={["Person", "Score", "Missing"]}
              widths={["54%", "16%", "30%"]}
              rows={b.hr.compliancePeople.map((p) => [p.name, `${p.score}%`, p.missing || "—"])}
            />
          </Section>
        )}

        {b.hr.expiringDocs.length > 0 && (
          <Section title="Staff documents expiring / expired">
            <Table
              head={["Person", "Document", "Status", "Expiry"]}
              widths={["26%", "42%", "14%", "18%"]}
              rows={b.hr.expiringDocs.map((d) => [d.person, d.title, d.status, d.expiryLabel ?? "—"])}
            />
          </Section>
        )}

        {b.hr.pendingLeave.length > 0 && (
          <Section title="Leave requests to approve">
            <Table
              head={["Person", "Type", "Days", "From", "To"]}
              widths={["28%", "26%", "10%", "18%", "18%"]}
              rows={b.hr.pendingLeave.map((l) => [l.name, l.type, l.days, l.start, l.end])}
            />
          </Section>
        )}

        {b.hr.probationEnding.length > 0 && (
          <Section title="Probation periods ending soon">
            <Table
              head={["Person", "Company", "Probation ends"]}
              widths={["40%", "40%", "20%"]}
              rows={b.hr.probationEnding.map((p) => [p.name, p.companyName ?? "—", fmtDay(p.endDate)])}
            />
          </Section>
        )}

        {b.hr.birthdays.length > 0 && (
          <Section title="Upcoming birthdays (next 14 days)">
            <Table
              head={["Person", "Company", "Birthday"]}
              widths={["40%", "40%", "20%"]}
              rows={b.hr.birthdays.map((p) => [p.name, p.companyName ?? "—", fmtDay(p.date)])}
            />
          </Section>
        )}

        {/* Footer on every page */}
        <View style={s.footer} fixed>
          <Text>{title} · Director Brief · {b.monthLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
