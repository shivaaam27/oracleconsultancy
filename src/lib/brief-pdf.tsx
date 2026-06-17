import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import type { BriefData } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";
import { fetchLogoDataUri } from "@/lib/pdf-logos";
import { INTER_REGULAR_B64 } from "@/assets/fonts/inter-regular.b64";
import { INTER_BOLD_B64 } from "@/assets/fonts/inter-bold.b64";

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
    family: "Inter",
    fonts: [
      { src: `data:font/ttf;base64,${INTER_REGULAR_B64}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${INTER_BOLD_B64}`, fontWeight: 700 },
    ],
  });
  FONT = "Inter";
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
  headerLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1, paddingRight: 12 },
  headerLogo: { width: 30, height: 30, borderRadius: 6, marginRight: 10, objectFit: "contain" },
  eyebrow: { fontSize: 8, color: C.accent, fontFamily: FONT, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.6, marginBottom: 2 },
  title: { fontSize: 19, fontFamily: FONT, fontWeight: 700, color: C.inkStrong, letterSpacing: -0.3 },
  sub: { fontSize: 8.5, color: C.muted, marginTop: 3 },
  headerRight: { alignItems: "flex-end", flexShrink: 0 },
  metaLabel: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 9, color: C.inkStrong, fontFamily: FONT, fontWeight: 700, marginBottom: 4, textAlign: "right" },
  metaConf: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 },
  rule: { borderBottomWidth: 2, borderBottomColor: C.accent, marginTop: 10 },

  // ── executive summary (accent rail on white) ──
  summary: { borderLeftWidth: 2.5, borderLeftColor: C.accent, paddingLeft: 11, marginTop: 16 },
  summaryLabel: { fontSize: 7, color: C.accent, fontFamily: FONT, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 },
  summaryText: { fontSize: 9.5, color: "#333333", lineHeight: 1.55 },

  // ── KPI rail (app-style cards) ──
  statGrid: { flexDirection: "row", marginTop: 16, marginHorizontal: -4 },
  stat: { width: "25%", paddingHorizontal: 4 },
  statBox: { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, minHeight: 56, justifyContent: "center" },
  statN: { fontSize: 21, fontFamily: FONT, fontWeight: 700, letterSpacing: -0.5 },
  statL: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4, fontFamily: FONT, fontWeight: 700 },
  statCaption: { fontSize: 6.8, color: C.faint, marginTop: 2 },

  // ── section heading (light, editorial) ──
  section: { marginTop: 19 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: C.ruleSection, paddingBottom: 4 },
  h2: { fontSize: 12, fontFamily: FONT, fontWeight: 700, color: C.inkStrong, letterSpacing: -0.2, flexGrow: 1 },
  h2count: { fontSize: 9, fontFamily: FONT, fontWeight: 700, color: C.accent },
  h2note: { fontSize: 7.5, color: C.faint, marginTop: 5, marginBottom: 2, lineHeight: 1.4 },

  // ── per-company block (flows continuously, no forced page break) ──
  companyBlock: { marginTop: 18 },
  companyBlockHead: { flexDirection: "row", alignItems: "center", borderBottomWidth: 2, borderBottomColor: C.accent, paddingBottom: 8, marginBottom: 2 },
  companyTitle: { fontSize: 14, fontFamily: FONT, fontWeight: 700, color: C.inkStrong, letterSpacing: -0.3 },
  companyStats: { fontSize: 7.8, color: C.muted, marginTop: 2 },
  companyLogoLg: { width: 28, height: 28, borderRadius: 6, marginRight: 10, objectFit: "contain" },
  dotLg: { width: 11, height: 11, borderRadius: 5.5, marginRight: 10 },

  // sub-heading inside a company block
  blockHead: { flexDirection: "row", alignItems: "baseline", marginTop: 12, marginBottom: 2 },
  blockTitle: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: C.inkStrong, letterSpacing: -0.1, flexGrow: 1 },
  blockCount: { fontSize: 8.5, fontFamily: FONT, fontWeight: 700, color: C.accent },

  // ── tables (old report-table look) ──
  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.rule, alignItems: "flex-start" },
  thead: { borderBottomWidth: 1, borderBottomColor: C.ruleHead },
  trAlt: { backgroundColor: C.zebra },
  th: { fontSize: 7.5, fontFamily: FONT, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.3, paddingVertical: 4, paddingHorizontal: 5 },
  td: { fontSize: 8.5, color: C.ink, paddingVertical: 4, paddingHorizontal: 5, lineHeight: 1.35 },
  tdStrong: { fontFamily: FONT, fontWeight: 700, color: C.inkStrong },
  chipCell: { paddingVertical: 3.5, paddingHorizontal: 5 },

  // ── chip ──
  chip: { fontSize: 7, fontFamily: FONT, fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase", paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 7, alignSelf: "flex-start" },

  // ── compliance card ──
  complCard: { borderWidth: 1, borderColor: C.cardBorder, borderRadius: 8, borderLeftWidth: 4, flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 11, marginBottom: 6 },
  complScoreBox: { width: 48, alignItems: "center" },
  complScore: { fontSize: 17, fontFamily: FONT, fontWeight: 700 },
  complMid: { flexGrow: 1, paddingHorizontal: 9 },
  complName: { fontSize: 9.5, fontFamily: FONT, fontWeight: 700, color: C.inkStrong },
  complIssues: { fontSize: 7.8, color: C.muted, marginTop: 1, lineHeight: 1.35 },
  complChips: { flexDirection: "row" },

  // ── misc ──
  empty: { fontSize: 8.5, color: C.faint, backgroundColor: "#f6f7f9", borderRadius: 6, paddingVertical: 9, paddingHorizontal: 12, marginTop: 4 },
  footer: { position: "absolute", bottom: 22, left: PAGE_MARGIN, right: PAGE_MARGIN, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 7, color: C.ghost, borderTopWidth: 0.6, borderTopColor: "#eaeaea", paddingTop: 5 },
  footerStrong: { color: C.muted, fontFamily: FONT, fontWeight: 700 },
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
  const headerLogo =
    (b.selectedCompanyId != null ? logoById.get(b.selectedCompanyId) : null) ??
    b.companies.map((c) => logoById.get(c.id)).find((x) => x) ??
    null;

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
