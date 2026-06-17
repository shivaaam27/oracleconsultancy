import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import type { BriefData } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";
import { fetchLogoDataUri } from "@/lib/pdf-logos";
import { SOURCESANS_REGULAR_B64 } from "@/assets/fonts/sourcesans-regular.b64";
import { SOURCESANS_MEDIUM_B64 } from "@/assets/fonts/sourcesans-medium.b64";
import { SOURCESANS_SEMIBOLD_B64 } from "@/assets/fonts/sourcesans-semibold.b64";

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
    family: "Source Sans 3",
    fonts: [
      { src: `data:font/ttf;base64,${SOURCESANS_REGULAR_B64}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${SOURCESANS_MEDIUM_B64}`, fontWeight: 500 },
      { src: `data:font/ttf;base64,${SOURCESANS_SEMIBOLD_B64}`, fontWeight: 600 },
    ],
  });
  FONT = "Source Sans 3";
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

// "ink" = no signal colour (normal black text). Colour is reserved for things a
// director should catch: danger (red), success (green), warn (amber).
type Tone = "success" | "warn" | "danger" | "info" | "neutral" | "ink";
const TONE_TEXT: Record<Tone, string> = { success: C.successText, warn: C.warnText, danger: C.dangerText, info: C.infoText, neutral: C.neutralText, ink: C.ink };

const s = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 42, paddingHorizontal: PAGE_MARGIN,
    fontSize: 8, color: C.ink, fontFamily: FONT, lineHeight: 1.4, backgroundColor: C.page,
  },

  // ── letterhead (white, editorial — no heavy band) ──
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexDirection: "row", alignItems: "flex-start", flexShrink: 1, paddingRight: 14 },
  headerLogo: { width: 26, height: 26, borderRadius: 5, marginRight: 10, marginTop: 2, objectFit: "contain" },
  eyebrow: { fontSize: 7, color: C.accent, fontFamily: FONT, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  title: { fontSize: 16.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.2, lineHeight: 1.12 },
  sub: { fontSize: 8, color: C.muted, marginTop: 3 },
  headerRight: { alignItems: "flex-end", flexShrink: 0 },
  metaLabel: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { fontSize: 8.5, color: C.inkStrong, fontFamily: FONT, fontWeight: 500, marginBottom: 4, textAlign: "right" },
  metaConf: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  rule: { borderBottomWidth: 1.2, borderBottomColor: C.accent, marginTop: 10 },

  // ── executive summary (accent rail on white) ──
  summary: { borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 11, marginTop: 15 },
  summaryLabel: { fontSize: 6.8, color: C.accent, fontFamily: FONT, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  summaryText: { fontSize: 8.5, color: "#3a3a3a", lineHeight: 1.55 },

  // ── KPI rail (plain coloured text, no boxes) ──
  kpiRow: { flexDirection: "row", marginTop: 15, flexWrap: "wrap" },
  kpiItem: { flexDirection: "row", alignItems: "baseline", marginRight: 22 },
  kpiN: { fontSize: 17, fontFamily: FONT, fontWeight: 600, letterSpacing: -0.5 },
  kpiL: { fontSize: 7.5, color: C.muted, marginLeft: 5 },

  // ── section heading (light, editorial) ──
  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: C.ruleSection, paddingBottom: 4 },
  h2: { fontSize: 11, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.2, flexGrow: 1 },
  h2count: { fontSize: 8.5, fontFamily: FONT, fontWeight: 500, color: C.accent },
  h2note: { fontSize: 7, color: C.faint, marginTop: 5, marginBottom: 1, lineHeight: 1.4 },

  // ── per-company block (flows continuously, no forced page break) ──
  companyBlock: { marginTop: 17 },
  companyBlockHead: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1.2, borderBottomColor: C.accent, paddingBottom: 7, marginBottom: 1 },
  companyTitle: { fontSize: 12, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.3 },
  companyStats: { fontSize: 7.2, color: C.muted, marginTop: 2 },
  companyLogoLg: { width: 22, height: 22, borderRadius: 5, marginRight: 9, objectFit: "contain" },
  dotLg: { width: 9, height: 9, borderRadius: 4.5, marginRight: 9 },
  riskText: { fontSize: 8, fontFamily: FONT, fontWeight: 600 },

  // sub-heading inside a company block
  blockHead: { flexDirection: "row", alignItems: "baseline", marginTop: 10, marginBottom: 2 },
  blockTitle: { fontSize: 8, fontFamily: FONT, fontWeight: 600, color: C.muted, letterSpacing: 0.3, textTransform: "uppercase", flexGrow: 1 },
  blockCount: { fontSize: 8, fontFamily: FONT, fontWeight: 500, color: C.accent },

  // ── tables ──
  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule, alignItems: "flex-start" },
  thead: { borderBottomWidth: 0.6, borderBottomColor: C.ruleHead },
  trAlt: { backgroundColor: C.zebra },
  th: { fontSize: 6.5, fontFamily: FONT, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 8, color: C.ink, paddingVertical: 4, paddingHorizontal: 4, lineHeight: 1.4 },
  tdStrong: { fontFamily: FONT, fontWeight: 600, color: C.inkStrong },
  // status / priority: normal case, coloured only for exceptions (no caps, no tracking)
  tdTag: { fontSize: 8, fontFamily: FONT, fontWeight: 500, paddingVertical: 4, paddingHorizontal: 4 },

  // ── misc ──
  empty: { fontSize: 8, color: C.faint, paddingVertical: 8, paddingHorizontal: 2, marginTop: 3 },
  footer: { position: "absolute", bottom: 20, left: PAGE_MARGIN, right: PAGE_MARGIN, flexDirection: "row", justifyContent: "space-between", alignItems: "center", fontSize: 6.5, color: C.ghost, borderTopWidth: 0.6, borderTopColor: "#eaeaea", paddingTop: 5 },
  footerStrong: { color: C.muted, fontFamily: FONT, fontWeight: 500 },
});

// Colour only exceptions; normal priorities/statuses stay ink black.
const priorityTone = (p: string): Tone => (p === "Critical" ? "danger" : p === "High" ? "warn" : "ink");
const statusTone = (st: string): Tone =>
  st === "Completed" || st === "Closed" ? "success"
    : st === "Blocked" || st === "Escalated" ? "danger"
      : "ink";
const riskTone = (r: string): Tone => (r === "High risk" ? "danger" : r === "Watch" ? "warn" : "success");

// Status / priority / risk now render as COLOURED TEXT, not pill chips.
type Cell = string | number | null | { tag: string; tone: Tone } | { strong: string };

function Cell({ c, w }: { c: Cell; w: { width: string } }) {
  if (c && typeof c === "object" && "tag" in c) {
    return <Text style={[s.tdTag, w, { color: TONE_TEXT[c.tone] }]}>{c.tag}</Text>;
  }
  if (c && typeof c === "object" && "strong" in c) {
    return <Text style={[s.td, s.tdStrong, w]}>{c.strong || "—"}</Text>;
  }
  return <Text style={[s.td, w]}>{c === "" || c == null ? "—" : c}</Text>;
}

function THead({ head, widths }: { head: string[]; widths: string[] }) {
  return (
    <View style={[s.tr, s.thead]}>
      {head.map((h, i) => <Text key={i} style={[s.th, { width: widths[i] }]}>{h}</Text>)}
    </View>
  );
}

// One row; `idx` drives the zebra stripe so a split table keeps its rhythm.
function Row({ r, widths, idx }: { r: Cell[]; widths: string[]; idx: number }) {
  return (
    <View style={idx % 2 ? [s.tr, s.trAlt] : [s.tr]} wrap={false}>
      {r.map((c, ci) => <Cell key={ci} c={c} w={{ width: widths[ci] }} />)}
    </View>
  );
}

function Table({ head, widths, rows }: { head: string[]; widths: string[]; rows: Cell[][] }) {
  return (
    <View style={s.table}>
      <THead head={head} widths={widths} />
      {rows.map((r, ri) => <Row key={ri} r={r} widths={widths} idx={ri} />)}
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

  // Delivered-this-period items, grouped by company name.
  const deliveredByCompany = new Map<string, BriefData["delivered"][number]["items"]>();
  for (const g of b.delivered) deliveredByCompany.set(g.company, g.items);

  // Companies with open work get a per-company open-work block.
  const openCompanies = b.companies.filter((c) => c.tasks.length > 0);

  // Consolidated delivered list (one section, last page): companies kept
  // contiguous and in the same order as the open-work blocks (so it reads
  // company-after-company, never jumbled). Company name shows once per group.
  const orderedNames = [
    ...b.companies.filter((c) => (deliveredByCompany.get(c.name)?.length ?? 0) > 0).map((c) => c.name),
  ];
  const OW = ["28%", "15%", "11%", "11%", "13%", "22%"]; // open-work column widths
  const OW_HEAD = ["Task", "Accountable", "Priority", "Deadline", "Status", "Latest update"];

  const Footer = () => (
    <View style={s.footer} fixed>
      <Text style={s.footerStrong}>{title} · Director Brief · {b.monthLabel} · Confidential</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );

  const RiskText = ({ risk }: { risk: string }) => (
    <Text style={[s.riskText, { color: TONE_TEXT[riskTone(risk)] }]}>{risk}</Text>
  );

  const doc = (
    <Document title={`${title} — Director Brief`} author={BRAND_NAME}>
      <Page size="A4" style={s.page} wrap>
        {/* ── Letterhead ── */}
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

        {/* KPI rail — plain coloured text, no boxes */}
        <View style={s.kpiRow} wrap={false}>
          {([
            [b.deliveredCount, "Delivered", "success"],
            [b.openCount, `Open · ${inProgressTotal} in progress`, b.openCount ? "info" : "neutral"],
            [b.overdueCount, b.overdueCount ? "Overdue" : "Overdue · none", b.overdueCount ? "danger" : "success"],
            [b.companyCount, b.atRiskCount ? `Companies · ${b.atRiskCount} at risk` : "Companies", "neutral"],
          ] as [number, string, Tone][]).map(([n, l, tone]) => (
            <View key={l} style={s.kpiItem}>
              <Text style={[s.kpiN, { color: TONE_TEXT[tone] }]}>{n}</Text>
              <Text style={s.kpiL}>{l}</Text>
            </View>
          ))}
        </View>

        {/* Portfolio at a glance */}
        <Section title="Portfolio at a glance" note={`Open and delivered work by company for ${b.monthLabel}. Detail by company follows.`}>
          <Table
            head={["Company", "Open", "In progress", "Overdue", "Delivered", "Risk"]}
            widths={["37%", "12%", "15%", "12%", "13%", "11%"]}
            rows={b.companies
              .filter((c) => c.tasks.length > 0 || (deliveredByCompany.get(c.name)?.length ?? 0) > 0)
              .map((c): Cell[] => [
                { strong: c.name },
                c.open,
                c.inProgress,
                c.overdue ? { tag: String(c.overdue), tone: "danger" } : "0",
                deliveredByCompany.get(c.name)?.length ?? 0,
                { tag: c.risk, tone: riskTone(c.risk) },
              ])}
          />
        </Section>

        {/* ── Open work, per company, flowing — header glued to the first row ── */}
        <Section title="Open work by company" note={`All open items, including those in progress, as at ${b.asAt}.`}>
          {openCompanies.length === 0 ? (
            <Text style={s.empty}>No open work across the portfolio.</Text>
          ) : (
            openCompanies.map((c) => {
              const logo = logoById.get(c.id);
              const rows = c.tasks.map((t): Cell[] => [
                { strong: t.actionItem },
                t.owner,
                { tag: t.priority, tone: priorityTone(t.priority) },
                t.overdue ? { tag: "Overdue", tone: "danger" } : t.deadline ? fmtDay(t.deadline) : "—",
                { tag: t.status, tone: statusTone(t.status) },
                t.latestUpdate ?? "—",
              ]);
              const head = (
                <>
                  <View style={s.companyBlockHead}>
                    {logo ? <Image src={logo} style={s.companyLogoLg} /> : <View style={[s.dotLg, { backgroundColor: c.accent || C.accent }]} />}
                    <View style={{ flexGrow: 1 }}>
                      <Text style={s.companyTitle}>{c.name}</Text>
                      <Text style={s.companyStats}>{c.open} open · {c.inProgress} in progress · {c.overdue} overdue</Text>
                    </View>
                    <RiskText risk={c.risk} />
                  </View>
                  <View style={s.table}><THead head={OW_HEAD} widths={OW} /></View>
                </>
              );
              return (
                <View key={c.id} style={s.companyBlock}>
                  {/* Lead group = company header + column header + first row, unbreakable */}
                  <View wrap={false}>
                    {head}
                    <Row r={rows[0]} widths={OW} idx={0} />
                  </View>
                  {rows.slice(1).map((r, i) => <Row key={i} r={r} widths={OW} idx={i + 1} />)}
                </View>
              );
            })
          )}
        </Section>

        {/* ── Delivered — one flat list on its own final page, companies contiguous ── */}
        {b.deliveredCount > 0 && (
          <View break>
            <Section title={`Delivered in ${b.monthLabel}`} count={b.deliveredCount} note="All items completed or closed this period, listed company by company.">
              <Table
                head={["Company", "Task", "Latest update", "Status", "Closed"]}
                widths={["16%", "33%", "31%", "12%", "8%"]}
                rows={orderedNames.flatMap((name) =>
                  (deliveredByCompany.get(name) ?? []).map((t, i): Cell[] => [
                    i === 0 ? { strong: name } : " ",
                    t.actionItem,
                    t.latestUpdate ?? "—",
                    { tag: t.status, tone: statusTone(t.status) },
                    fmtDay(t.closedDate),
                  ]),
                )}
              />
            </Section>
          </View>
        )}

        <Footer />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
