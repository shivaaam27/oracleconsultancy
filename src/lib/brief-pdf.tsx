import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import type { BriefData } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";
import { fetchLogoDataUri } from "@/lib/pdf-logos";
import { GEIST_REGULAR_B64 } from "@/assets/fonts/geist-regular.b64";
import { GEIST_MEDIUM_B64 } from "@/assets/fonts/geist-medium.b64";
import { GEIST_SEMIBOLD_B64 } from "@/assets/fonts/geist-semibold.b64";

// Server-side PDF of the Director Brief — rendered with @react-pdf/renderer (no
// headless browser, so it runs in a serverless route and downloads as a real
// file on mobile / the installed app). Editorial, branded layout that mirrors
// the on-screen brief: the app's Inter font, a clean white letterhead, app-style
// stat cards, light section headings, zebra tables and tasteful coloured chips.
// Built from an already-loaded BriefData (same numbers the page shows). Carries
// NO salary/wage figures, so the same PDF is safe for directors as for the owner.

// Register the app's font (Inter, base64-embedded). If anything goes wrong we
// fall back to built-in Helvetica so the PDF can never fail to render.
let FONT = "Helvetica";
try {
  Font.register({
    family: "Geist",
    fonts: [
      { src: `data:font/ttf;base64,${GEIST_REGULAR_B64}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${GEIST_MEDIUM_B64}`, fontWeight: 500 },
      { src: `data:font/ttf;base64,${GEIST_SEMIBOLD_B64}`, fontWeight: 600 },
    ],
  });
  FONT = "Geist";
} catch {
  FONT = "Helvetica";
}
// Keep tokens (codes/dates) whole across line wraps.
Font.registerHyphenationCallback((word) => [word]);

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";

const PAGE_MARGIN = 42;

const C = {
  accent: "#1e6bcf",
  ink: "#1c1c1c",
  inkStrong: "#111111",
  muted: "#555555",
  faint: "#8a8a8a",
  ghost: "#aaaaaa",

  page: "#ffffff",
  rule: "#ededed",       // cell separators
  ruleHead: "#bdbdbd",   // under table headers (old report-table look)
  ruleSection: "#e6e6e6",// under section headings
  cardBorder: "#e6e7ea", // stat / compliance card border
  zebra: "#fafafa",

  successText: "#1f7a4d", successBg: "#e7f5ee",
  warnText: "#9a6700", warnBg: "#fbf0d9",
  dangerText: "#b3261e", dangerBg: "#fbe7e5",
  infoText: "#1456b0", infoBg: "#e7f0fd",
  neutralText: "#555555", neutralBg: "#eef0f2",
} as const;

type Tone = "success" | "warn" | "danger" | "info" | "neutral";
const TONE_BG: Record<Tone, string> = { success: C.successBg, warn: C.warnBg, danger: C.dangerBg, info: C.infoBg, neutral: C.neutralBg };
const TONE_TEXT: Record<Tone, string> = { success: C.successText, warn: C.warnText, danger: C.dangerText, info: C.infoText, neutral: C.neutralText };

const s = StyleSheet.create({
  page: {
    paddingTop: 38, paddingBottom: 46, paddingHorizontal: PAGE_MARGIN,
    fontSize: 9, color: C.ink, fontFamily: FONT, lineHeight: 1.45, backgroundColor: C.page,
  },

  // ── letterhead (white, editorial — no heavy band) ──
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexDirection: "row", alignItems: "flex-start", flexShrink: 1, paddingRight: 14 },
  headerLogo: { width: 30, height: 30, borderRadius: 6, marginRight: 12, marginTop: 2, objectFit: "contain" },
  eyebrow: { fontSize: 7.5, color: C.accent, fontFamily: FONT, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 3 },
  title: { fontSize: 18, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.4, lineHeight: 1.1 },
  sub: { fontSize: 8.5, color: C.muted, marginTop: 4 },
  headerRight: { alignItems: "flex-end", flexShrink: 0 },
  metaLabel: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 9, color: C.inkStrong, fontFamily: FONT, fontWeight: 500, marginBottom: 4, textAlign: "right" },
  metaConf: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: C.accent, marginTop: 11 },

  // ── executive summary (accent rail on white) ──
  summary: { borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 12, marginTop: 18 },
  summaryLabel: { fontSize: 7, color: C.accent, fontFamily: FONT, fontWeight: 500, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  summaryText: { fontSize: 9.5, color: "#3a3a3a", lineHeight: 1.6 },

  // ── KPI rail (app-style cards) ──
  statGrid: { flexDirection: "row", marginTop: 18, marginHorizontal: -4 },
  stat: { width: "25%", paddingHorizontal: 4 },
  statBox: { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, paddingVertical: 11, paddingHorizontal: 11 },
  statN: { fontSize: 22, fontFamily: FONT, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1 },
  statL: { fontSize: 6.8, color: C.muted, textTransform: "uppercase", letterSpacing: 0.7, marginTop: 7, fontFamily: FONT, fontWeight: 500 },
  statCaption: { fontSize: 6.8, color: C.faint, marginTop: 3 },

  // ── section heading (light, editorial) ──
  section: { marginTop: 20 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: C.ruleSection, paddingBottom: 5 },
  h2: { fontSize: 12, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.2, flexGrow: 1 },
  h2count: { fontSize: 9, fontFamily: FONT, fontWeight: 500, color: C.accent },
  h2note: { fontSize: 7.5, color: C.faint, marginTop: 6, marginBottom: 2, lineHeight: 1.45 },

  // ── per-company block (flows continuously, no forced page break) ──
  companyBlock: { marginTop: 20 },
  companyBlockHead: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1.5, borderBottomColor: C.accent, paddingBottom: 9, marginBottom: 2 },
  companyTitle: { fontSize: 13.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.3 },
  companyStats: { fontSize: 7.8, color: C.muted, marginTop: 3 },
  companyLogoLg: { width: 26, height: 26, borderRadius: 6, marginRight: 11, objectFit: "contain" },
  dotLg: { width: 10, height: 10, borderRadius: 5, marginRight: 11 },

  // sub-heading inside a company block
  blockHead: { flexDirection: "row", alignItems: "baseline", marginTop: 13, marginBottom: 3 },
  blockTitle: { fontSize: 9.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: 0.1, textTransform: "uppercase", flexGrow: 1 },
  blockCount: { fontSize: 8.5, fontFamily: FONT, fontWeight: 500, color: C.accent },

  // ── tables ──
  table: { marginTop: 5 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: C.rule, alignItems: "flex-start" },
  thead: { borderBottomWidth: 0.6, borderBottomColor: C.ruleHead },
  trAlt: { backgroundColor: C.zebra },
  th: { fontSize: 7, fontFamily: FONT, fontWeight: 500, color: C.faint, textTransform: "uppercase", letterSpacing: 0.5, paddingVertical: 5, paddingHorizontal: 5 },
  td: { fontSize: 8.5, color: C.ink, paddingVertical: 5, paddingHorizontal: 5, lineHeight: 1.4 },
  tdStrong: { fontFamily: FONT, fontWeight: 500, color: C.inkStrong },
  chipCell: { paddingVertical: 4, paddingHorizontal: 5 },

  // ── chip ──
  chip: { fontSize: 6.8, fontFamily: FONT, fontWeight: 500, letterSpacing: 0.2, textTransform: "uppercase", paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 4, alignSelf: "flex-start" },

  // ── misc ──
  empty: { fontSize: 8.5, color: C.faint, backgroundColor: "#f8f9fb", borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12, marginTop: 5 },
  footer: { position: "absolute", bottom: 22, left: PAGE_MARGIN, right: PAGE_MARGIN, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: C.ghost, borderTopWidth: 0.6, borderTopColor: "#eaeaea", paddingTop: 5 },
  footerStrong: { color: C.muted, fontFamily: FONT, fontWeight: 500 },
});

const priorityTone = (p: string): Tone => (p === "Critical" ? "danger" : p === "High" ? "warn" : p === "Medium" ? "info" : "neutral");
const statusTone = (st: string): Tone =>
  st === "Completed" || st === "Closed" ? "success"
    : st === "Blocked" || st === "Escalated" ? "danger"
      : st === "Under Review" || st === "Waiting External" ? "warn"
        : st === "In Progress" ? "info"
          : "neutral";
const riskTone = (r: string): Tone => (r === "High risk" ? "danger" : r === "Watch" ? "warn" : "success");

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <Text style={[s.chip, { backgroundColor: TONE_BG[tone], color: TONE_TEXT[tone] }]}>{children}</Text>;
}

type Cell = string | number | null | { chip: string; tone: Tone } | { strong: string };

function Table({ head, widths, rows }: { head: string[]; widths: string[]; rows: Cell[][] }) {
  return (
    <View style={s.table}>
      <View style={[s.tr, s.thead]} fixed>
        {head.map((h, i) => (
          <Text key={i} style={[s.th, { width: widths[i] }]}>{h}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={ri % 2 ? [s.tr, s.trAlt] : [s.tr]} wrap={false}>
          {r.map((c, ci) => {
            const w = { width: widths[ci] };
            if (c && typeof c === "object" && "chip" in c) {
              return <View key={ci} style={[s.chipCell, w]}><Chip tone={c.tone}>{c.chip}</Chip></View>;
            }
            if (c && typeof c === "object" && "strong" in c) {
              return <Text key={ci} style={[s.td, s.tdStrong, w]}>{c.strong || "—"}</Text>;
            }
            return <Text key={ci} style={[s.td, w]}>{c === "" || c == null ? "—" : c}</Text>;
          })}
        </View>
      ))}
    </View>
  );
}

function Stat({ n, l, caption, tone = "info" }: { n: string | number; l: string; caption?: string; tone?: Tone }) {
  return (
    <View style={s.stat}>
      <View style={s.statBox}>
        <Text style={[s.statN, { color: TONE_TEXT[tone] }]}>{n}</Text>
        <Text style={s.statL}>{l}</Text>
        {caption ? <Text style={s.statCaption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

function Section({ title, note, count, children }: { title: string; note?: string; count?: number; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.h2}>{title}</Text>
        {count != null ? <Text style={s.h2count}>{count}</Text> : null}
      </View>
      {note ? <Text style={s.h2note}>{note}</Text> : null}
      {children}
    </View>
  );
}

export async function renderBriefPdf(b: BriefData, asOf = new Date()): Promise<Buffer> {
  void asOf;
  const title = b.selectedCompanyName ?? BRAND_NAME;
  const inProgressTotal = b.companies.reduce((n, c) => n + c.inProgress, 0);

  const summary =
    `In ${b.monthLabel}, ${BRAND_NAME} delivered ${b.deliveredCount} item${b.deliveredCount === 1 ? "" : "s"} across ${b.companyCount} portfolio companies. ` +
    `${b.openCount} item${b.openCount === 1 ? "" : "s"} remain open (${inProgressTotal} in progress)` +
    `${b.overdueCount ? `, with ${b.overdueCount} overdue requiring attention` : ", with nothing overdue"}.` +
    `${b.watch.length ? ` ${b.watch.length} item${b.watch.length === 1 ? " is" : "s are"} flagged for attention.` : ""}` +
    `${b.directorActions.length ? ` ${b.directorActions.length} recommended director action${b.directorActions.length === 1 ? "" : "s"} listed.` : ""}` +
    `${b.compliance.length ? ` ${b.compliance.length} compan${b.compliance.length === 1 ? "y has" : "ies have"} compliance issues.` : ""}`;

  const logoEntries = await Promise.all(b.companies.map(async (c) => [c.id, await fetchLogoDataUri(c.logoUrl)] as const));
  const logoById = new Map<number, string | null>(logoEntries);
  // Header logo: a single-company brief shows that company's mark. A
  // portfolio-wide brief is titled for the parent ("Oracle Consultancy"), so we
  // use the parent company's own logo if present — NOT a random portfolio
  // company's (which is wrong + confusing). No match → no logo (clean wordmark).
  const parent = b.companies.find((c) => c.name.toLowerCase().includes("oracle consultancy"));
  const headerLogo =
    (b.selectedCompanyId != null ? logoById.get(b.selectedCompanyId) : parent ? logoById.get(parent.id) : null) ?? null;

  // Delivered-this-period items, grouped by company name (the brief groups them
  // by name), so each company page can list what it shipped.
  const deliveredByCompany = new Map<string, BriefData["delivered"][number]["items"]>();
  for (const g of b.delivered) deliveredByCompany.set(g.company, g.items);

  // Companies worth a page: anything with open work OR something delivered.
  const companyPages = b.companies.filter((c) => c.tasks.length > 0 || (deliveredByCompany.get(c.name)?.length ?? 0) > 0);

  const Footer = () => (
    <View style={s.footer} fixed>
      <Text style={s.footerStrong}>{title} · Director Brief · {b.monthLabel} · Confidential</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );

  const doc = (
    <Document title={`${title} — Director Brief`} author={BRAND_NAME}>
      {/* ── Cover ── portfolio summary, no per-task detail */}
      <Page size="A4" style={s.page} wrap>
        <View style={s.header}>
          <View style={s.headerLeft}>
            {headerLogo ? <Image src={headerLogo} style={s.headerLogo} /> : null}
            <View>
              <Text style={s.eyebrow}>Director Brief</Text>
              <Text style={s.title}>{title}</Text>
              <Text style={s.sub}>{b.monthLabel} · Tasks by company</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.metaLabel}>As at</Text>
            <Text style={s.metaValue}>{b.asAt}</Text>
            <Text style={s.metaConf}>Confidential · Board use</Text>
          </View>
        </View>
        <View style={s.rule} />

        <View style={s.summary} wrap={false}>
          <Text style={s.summaryLabel}>Executive summary</Text>
          <Text style={s.summaryText}>{summary}</Text>
        </View>

        <View style={s.statGrid} wrap={false}>
          <Stat n={b.deliveredCount} l="Delivered" tone="success" caption={`in ${b.monthLabel}`} />
          <Stat n={b.openCount} l="Open" tone={b.openCount ? "info" : "neutral"} caption={`${inProgressTotal} in progress`} />
          <Stat n={b.overdueCount} l="Overdue" tone={b.overdueCount ? "danger" : "success"} caption={b.overdueCount ? "need attention" : "all on time"} />
          <Stat n={b.companyCount} l="Companies" tone="info" caption={b.atRiskCount ? `${b.atRiskCount} at risk` : "all healthy"} />
        </View>

        {/* Portfolio-at-a-glance: one row per company, the detail flows below */}
        <Section title="Portfolio at a glance" note={`Open and delivered work by company for ${b.monthLabel}. Detail by company follows.`}>
          <Table
            head={["Company", "Open", "In progress", "Overdue", "Delivered", "Risk"]}
            widths={["37%", "12%", "15%", "12%", "13%", "11%"]}
            rows={companyPages.map((c): Cell[] => [
              { strong: c.name },
              c.open,
              c.inProgress,
              c.overdue ? { chip: String(c.overdue), tone: "danger" } : "0",
              deliveredByCompany.get(c.name)?.length ?? 0,
              { chip: c.risk, tone: riskTone(c.risk) },
            ])}
          />
          {companyPages.length === 0 ? <Text style={s.empty}>No open or delivered work across the portfolio this period.</Text> : null}
        </Section>

        {/* ── Per company, flowing (no forced page breaks) ── */}
        {companyPages.map((c) => {
          const logo = logoById.get(c.id);
          const delivered = deliveredByCompany.get(c.name) ?? [];
          return (
            <View key={c.id} style={s.companyBlock}>
              {/* Header kept with the first rows so it never orphans at a page foot */}
              <View style={s.companyBlockHead} wrap={false} minPresenceAhead={70}>
                {logo ? <Image src={logo} style={s.companyLogoLg} /> : <View style={[s.dotLg, { backgroundColor: c.accent || C.accent }]} />}
                <View style={{ flexGrow: 1 }}>
                  <Text style={s.companyTitle}>{c.name}</Text>
                  <Text style={s.companyStats}>{c.open} open · {c.inProgress} in progress · {c.overdue} overdue · {delivered.length} delivered</Text>
                </View>
                <Chip tone={riskTone(c.risk)}>{c.risk}</Chip>
              </View>

              {/* Open work */}
              <View style={s.blockHead}>
                <Text style={s.blockTitle}>Open work</Text>
                <Text style={s.blockCount}>{c.tasks.length}</Text>
              </View>
              {c.tasks.length === 0 ? (
                <Text style={s.empty}>No open tasks — all clear.</Text>
              ) : (
                <Table
                  head={["Task", "Accountable", "Priority", "Deadline", "Status", "Latest update"]}
                  widths={["27%", "14%", "12%", "12%", "14%", "21%"]}
                  rows={c.tasks.map((t): Cell[] => [
                    { strong: t.actionItem },
                    t.owner,
                    { chip: t.priority, tone: priorityTone(t.priority) },
                    t.overdue ? { chip: "Overdue", tone: "danger" } : t.deadline ? fmtDay(t.deadline) : "—",
                    { chip: t.status, tone: statusTone(t.status) },
                    t.latestUpdate ?? "—",
                  ])}
                />
              )}

              {/* Delivered this period */}
              {delivered.length > 0 && (
                <>
                  <View style={s.blockHead}>
                    <Text style={s.blockTitle}>Delivered in {b.monthLabel}</Text>
                    <Text style={s.blockCount}>{delivered.length}</Text>
                  </View>
                  <Table
                    head={["Task", "Status", "Closed"]}
                    widths={["68%", "17%", "15%"]}
                    rows={delivered.map((t): Cell[] => [{ strong: t.actionItem }, { chip: t.status, tone: statusTone(t.status) }, fmtDay(t.closedDate)])}
                  />
                </>
              )}
            </View>
          );
        })}

        <Footer />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
