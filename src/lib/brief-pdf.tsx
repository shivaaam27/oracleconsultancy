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

  // ── KPI tiles (command-centre metric cards) ──
  kpiRow: { flexDirection: "row", marginTop: 16, marginHorizontal: -4 },
  kpiCell: { width: "25%", paddingHorizontal: 4 },
  kpiTile: { backgroundColor: C.zebra, borderRadius: 7, paddingVertical: 10, paddingHorizontal: 11 },
  kpiN: { fontSize: 21, fontFamily: FONT, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1 },
  kpiL: { fontSize: 8.5, fontFamily: FONT, fontWeight: 500, color: C.inkStrong, marginTop: 6 },
  kpiS: { fontSize: 7, color: C.faint, marginTop: 1.5 },

  // ── company cards (portfolio at a glance) ──
  cardGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 2 },
  cardCell: { width: "50%", paddingHorizontal: 4, marginBottom: 8 },
  card: { borderWidth: 0.5, borderColor: C.cardBorder, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  cardDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6, flexShrink: 0 },
  cardName: { fontSize: 9.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, flexGrow: 1 },
  cardRisk: { fontSize: 7.5, fontFamily: FONT, fontWeight: 600 },
  cardStats: { flexDirection: "row", flexWrap: "wrap", marginBottom: 7 },
  cardStat: { flexDirection: "row", alignItems: "baseline", marginRight: 12 },
  cardStatN: { fontSize: 11, fontFamily: FONT, fontWeight: 600 },
  cardStatL: { fontSize: 7, color: C.faint, marginLeft: 3 },
  loadTrack: { height: 3.5, borderRadius: 2, backgroundColor: "#eef0f2" },
  loadCap: { fontSize: 6.8, color: C.faint, marginTop: 3 },

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

  // ── modern open-work table (columns kept; description under the title) ──
  owHead: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: C.ruleHead, paddingBottom: 5, marginTop: 4 },
  owTh: { fontSize: 6.5, fontFamily: FONT, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4, paddingRight: 6 },
  owRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 7, alignItems: "flex-start" },
  owCell: { paddingRight: 6 },
  owTitle: { fontSize: 9, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, lineHeight: 1.25 },
  owDesc: { fontSize: 7.5, color: C.muted, lineHeight: 1.35, marginTop: 1.5 },
  owText: { fontSize: 8, color: C.ink, lineHeight: 1.35 },
  owStatusRow: { flexDirection: "row", alignItems: "center" },
  owDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 5, flexShrink: 0 },
  owSub: { fontSize: 7, color: C.faint, marginTop: 2 },
  owUpdate: { fontSize: 8, color: C.muted, lineHeight: 1.4 },
  owStamp: { fontSize: 7, marginTop: 2 },

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

// Status colour for the small leading dot (richer than the text tones — dots
// can carry colour cheaply without making the page busy).
const statusDot = (st: string): string =>
  st === "Completed" || st === "Closed" ? C.successText
    : st === "Blocked" || st === "Escalated" ? C.dangerText
      : st === "Under Review" || st === "Waiting External" ? C.warnText
        : st === "In Progress" ? C.infoText
          : C.faint;

const STALE_DAYS = 14;

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

  // Worst-first ordering (most overdue, then most open) — used on the cover
  // grid AND the per-company detail so the two read in the same order.
  const worstFirst = (a: BriefData["companies"][number], z: BriefData["companies"][number]) =>
    z.overdue - a.overdue || z.open - a.open;
  const dCount = (name: string) => deliveredByCompany.get(name)?.length ?? 0;

  // Cover cards: any company with open OR delivered work.
  const coverCompanies = b.companies
    .filter((c) => c.tasks.length > 0 || dCount(c.name) > 0)
    .sort(worstFirst);

  // Companies with open work get a per-company open-work block.
  const openCompanies = b.companies.filter((c) => c.tasks.length > 0).sort(worstFirst);

  // Recency / age helpers (smart layer): when was a task last touched, how long
  // it has been open, and whether it has gone quiet.
  const DAY = 86_400_000;
  const daysSince = (d: Date | null) => (d ? Math.floor((asOf.getTime() - d.getTime()) / DAY) : null);
  const relWhen = (d: Date | null) => {
    const n = daysSince(d);
    if (n == null) return null;
    if (n <= 0) return "today";
    if (n === 1) return "yesterday";
    if (n < 30) return `${n}d ago`;
    return fmtDay(d);
  };

  // Clamp long prose so rows stay tidy (full text still lives in the app).
  const clamp = (t: string | null, n: number) => {
    if (!t) return "";
    const s2 = t.replace(/\s+/g, " ").trim();
    return s2.length > n ? s2.slice(0, n - 1).trimEnd() + "…" : s2;
  };

  // Open-work table column widths (description lives inside the Task column).
  const OWW = {
    task: { width: "30%" }, who: { width: "15%" }, pri: { width: "9%" },
    dl: { width: "11%" }, st: { width: "13%" }, up: { width: "22%" },
  } as const;

  // Consolidated delivered list (one section, last page): companies kept
  // contiguous and in the same order as the open-work blocks (so it reads
  // company-after-company, never jumbled). Company name shows once per group.
  const orderedNames = [
    ...b.companies.filter((c) => (deliveredByCompany.get(c.name)?.length ?? 0) > 0).map((c) => c.name),
  ];

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

        {/* KPI tiles — command-centre metric cards */}
        <View style={s.kpiRow} wrap={false}>
          {([
            [b.deliveredCount, "Delivered", "in June", "success"],
            [b.openCount, "Open", `${inProgressTotal} in progress`, "info"],
            [b.overdueCount, "Overdue", b.overdueCount ? "need attention" : "all on time", b.overdueCount ? "danger" : "success"],
            [b.companyCount, "Companies", b.atRiskCount ? `${b.atRiskCount} at risk` : "all healthy", "ink"],
          ] as [number, string, string, Tone][]).map(([n, l, sub, tone]) => (
            <View key={l} style={s.kpiCell}>
              <View style={s.kpiTile}>
                <Text style={[s.kpiN, { color: TONE_TEXT[tone] }]}>{n}</Text>
                <Text style={s.kpiL}>{l}</Text>
                <Text style={s.kpiS}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Portfolio at a glance — company cards with a load bar */}
        <Section title="Portfolio at a glance" note={`Open and delivered work by company for ${b.monthLabel}. Per-company detail follows.`}>
          <View style={s.cardGrid}>
            {coverCompanies.map((c) => {
              const delivered = dCount(c.name);
              const pct = c.open > 0 ? Math.round((c.overdue / c.open) * 100) : 0;
              return (
                <View key={c.id} style={s.cardCell} wrap={false}>
                  <View style={s.card}>
                    <View style={s.cardHead}>
                      <View style={[s.cardDot, { backgroundColor: c.accent || C.accent }]} />
                      <Text style={s.cardName}>{c.name}</Text>
                      <Text style={[s.cardRisk, { color: TONE_TEXT[riskTone(c.risk)] }]}>{c.risk}</Text>
                    </View>
                    <View style={s.cardStats}>
                      <View style={s.cardStat}><Text style={[s.cardStatN, { color: C.inkStrong }]}>{c.open}</Text><Text style={s.cardStatL}>open</Text></View>
                      <View style={s.cardStat}><Text style={[s.cardStatN, { color: C.inkStrong }]}>{c.inProgress}</Text><Text style={s.cardStatL}>in progress</Text></View>
                      <View style={s.cardStat}><Text style={[s.cardStatN, { color: c.overdue ? C.dangerText : C.faint }]}>{c.overdue}</Text><Text style={s.cardStatL}>overdue</Text></View>
                      <View style={s.cardStat}><Text style={[s.cardStatN, { color: delivered ? C.successText : C.faint }]}>{delivered}</Text><Text style={s.cardStatL}>delivered</Text></View>
                    </View>
                    <View style={s.loadTrack}>
                      <View style={{ height: 3.5, borderRadius: 2, width: `${pct}%`, backgroundColor: c.overdue ? C.dangerText : C.successText }} />
                    </View>
                    <Text style={s.loadCap}>{c.overdue ? `${pct}% of open work overdue` : "on track"}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>

        {/* ── Open work, per company — starts on its own page after the cover ── */}
        <View break>
        <Section title="Open work by company" note={`All open items, including those in progress, as at ${b.asAt}.`}>
          {openCompanies.length === 0 ? (
            <Text style={s.empty}>No open work across the portfolio.</Text>
          ) : (
            openCompanies.map((c) => {
              const logo = logoById.get(c.id);
              const head = (
                <View style={s.companyBlockHead}>
                  {logo ? <Image src={logo} style={s.companyLogoLg} /> : <View style={[s.dotLg, { backgroundColor: c.accent || C.accent }]} />}
                  <View style={{ flexGrow: 1 }}>
                    <Text style={s.companyTitle}>{c.name}</Text>
                    <Text style={s.companyStats}>{c.open} open · {c.inProgress} in progress · {c.overdue} overdue</Text>
                  </View>
                  <RiskText risk={c.risk} />
                </View>
              );
              const headRow = (
                <View style={s.owHead}>
                  <Text style={[s.owTh, OWW.task]}>Task</Text>
                  <Text style={[s.owTh, OWW.who]}>Accountable</Text>
                  <Text style={[s.owTh, OWW.pri]}>Priority</Text>
                  <Text style={[s.owTh, OWW.dl]}>Deadline</Text>
                  <Text style={[s.owTh, OWW.st]}>Status</Text>
                  <Text style={[s.owTh, OWW.up]}>Latest update</Text>
                </View>
              );
              const renderRow = (t: BriefData["companies"][number]["tasks"][number]) => {
                const stale = (daysSince(t.lastUpdatedAt) ?? Infinity) >= STALE_DAYS;
                const age = daysSince(t.createdDate);
                const when = relWhen(t.lastUpdatedAt);
                const pTone = priorityTone(t.priority);
                return (
                  <View key={t.id} style={s.owRow} wrap={false}>
                    <View style={[s.owCell, OWW.task]}>
                      <Text style={s.owTitle}>{t.actionItem}</Text>
                      {t.description ? <Text style={s.owDesc}>{clamp(t.description, 120)}</Text> : null}
                    </View>
                    <Text style={[s.owText, s.owCell, OWW.who]}>{t.owner}</Text>
                    <Text style={[s.owText, s.owCell, OWW.pri, { color: pTone === "ink" ? C.muted : TONE_TEXT[pTone] }]}>{t.priority}</Text>
                    <View style={[s.owCell, OWW.dl]}>
                      <Text style={[s.owText, { color: t.overdue ? C.dangerText : t.deadline ? C.ink : C.faint }]}>
                        {t.overdue ? "Overdue" : t.deadline ? fmtDay(t.deadline) : "No date"}
                      </Text>
                      {age != null ? <Text style={s.owSub}>open {age}d</Text> : null}
                    </View>
                    <View style={[s.owCell, OWW.st]}>
                      <View style={s.owStatusRow}>
                        <View style={[s.owDot, { backgroundColor: statusDot(t.status) }]} />
                        <Text style={s.owText}>{t.status}</Text>
                      </View>
                    </View>
                    <View style={OWW.up}>
                      <Text style={s.owUpdate}>{t.latestUpdate ? clamp(t.latestUpdate, 160) : "—"}</Text>
                      <Text style={[s.owStamp, { color: stale ? C.warnText : C.faint }]}>
                        {when ? `updated ${when}` : "no update yet"}{stale ? " · no recent update" : ""}
                      </Text>
                    </View>
                  </View>
                );
              };
              return (
                <View key={c.id} style={s.companyBlock}>
                  {/* Lead group = company header + column header + first row, unbreakable */}
                  <View wrap={false}>
                    {head}
                    {headRow}
                    {renderRow(c.tasks[0])}
                  </View>
                  {c.tasks.slice(1).map((t) => renderRow(t))}
                </View>
              );
            })
          )}
        </Section>
        </View>

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
