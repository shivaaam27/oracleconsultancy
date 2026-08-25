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

  // ── the modern skin (Aug 2026) ────────────────────────────────────────────
  // The report opens on number cards and continues in dense panels — ERPNext's
  // own organisation — but kept in the skin the owner already likes: rounded
  // corners, soft colour fills, a hairline instead of a heavy rule.
  //
  // ⚠️ EVERYTHING HERE IS A FLAT FILL OR A BORDER, AND THAT IS NOT A STYLE
  // CHOICE. @react-pdf/renderer prints neither a shadow nor a gradient, so
  // depth has to come from tint against tint. Reach for either and it renders
  // as nothing at all, silently.
  wash: "#f7f9fc",       // panel ground
  line: "#e4e8ef",       // panel border
  lineSoft: "#eef1f6",   // row separator inside a panel
  successLine: "#cdeadb",
  warnLine: "#f2ddb0",
  dangerLine: "#f8d5d1",
  infoLine: "#d3e6fb",
  neutralLine: "#dfe4ec",
} as const;

// "ink" = no signal colour (normal black text). Colour is reserved for things a
// director should catch: danger (red), success (green), warn (amber).
type Tone = "success" | "warn" | "danger" | "info" | "neutral" | "ink";
const TONE_TEXT: Record<Tone, string> = { success: C.successText, warn: C.warnText, danger: C.dangerText, info: C.infoText, neutral: C.neutralText, ink: C.ink };
// A tone's soft fill and its border — the two halves of a tinted card or pill.
// "ink" carries no signal, so it takes the neutral wash rather than a colour.
const TONE_BG: Record<Tone, string> = { success: C.successBg, warn: C.warnBg, danger: C.dangerBg, info: C.infoBg, neutral: C.neutralBg, ink: C.neutralBg };
const TONE_LINE: Record<Tone, string> = { success: C.successLine, warn: C.warnLine, danger: C.dangerLine, info: C.infoLine, neutral: C.neutralLine, ink: C.neutralLine };

const s = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 42, paddingHorizontal: PAGE_MARGIN,
    fontSize: 8, color: C.ink, fontFamily: FONT, lineHeight: 1.4, backgroundColor: C.page,
  },

  // ── letterhead — a soft banded block, repeated at the top of each part so a
  //    page torn out still says what it is ──
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    backgroundColor: C.infoBg, borderWidth: 0.5, borderColor: C.infoLine, borderRadius: 8,
    paddingVertical: 11, paddingHorizontal: 13,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1, paddingRight: 14 },
  headerLogo: { width: 28, height: 28, borderRadius: 7, marginRight: 10, objectFit: "contain" },
  // Stands in for the logo when a company has none — initials on the one blue,
  // so the band never opens on an empty square.
  headerMark: {
    width: 28, height: 28, borderRadius: 7, marginRight: 10, backgroundColor: C.accent,
    alignItems: "center", justifyContent: "center",
  },
  headerMarkText: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: "#ffffff", letterSpacing: -0.2 },
  eyebrow: { fontSize: 6.6, color: C.infoText, fontFamily: FONT, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 2 },
  title: { fontSize: 16.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.2, lineHeight: 1.12 },
  sub: { fontSize: 8, color: C.muted, marginTop: 3 },
  headerRight: { alignItems: "flex-end", flexShrink: 0 },
  metaLabel: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4 },
  metaValue: { fontSize: 8.5, color: C.inkStrong, fontFamily: FONT, fontWeight: 500, marginBottom: 4, textAlign: "right" },
  metaConf: { fontSize: 6.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },

  // ── executive summary — a quiet panel, no accent rail (the band above is the
  //    accent now, and two accents in six centimetres is one too many) ──
  summary: {
    backgroundColor: C.wash, borderWidth: 0.5, borderColor: C.line, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 12, marginTop: 12,
  },
  summaryLabel: { fontSize: 6.6, color: C.faint, fontFamily: FONT, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 },
  summaryText: { fontSize: 8.5, color: "#3a3a3a", lineHeight: 1.55 },

  // ── KPI tiles (command-centre metric cards) ──
  kpiRow: { flexDirection: "row", marginTop: 13, marginHorizontal: -4 },
  kpiCell: { width: "25%", paddingHorizontal: 4 },
  // The fill and border come from the tile's own tone at render time, so an
  // overdue count sits on red and a delivered count on green.
  kpiTile: { borderRadius: 8, borderWidth: 0.5, paddingVertical: 10, paddingHorizontal: 11 },
  kpiN: { fontSize: 23, fontFamily: FONT, fontWeight: 700, letterSpacing: -0.9, lineHeight: 1 },
  kpiL: { fontSize: 8.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, marginTop: 6 },
  kpiS: { fontSize: 7, color: C.muted, marginTop: 1.5 },

  // ── company cards (portfolio at a glance) ──
  cardGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4, marginTop: 2 },
  cardCell: { width: "50%", paddingHorizontal: 4, marginBottom: 8 },
  card: { borderWidth: 0.5, borderColor: C.line, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11 },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 7 },
  cardDot: { width: 7, height: 7, borderRadius: 2.5, marginRight: 6, flexShrink: 0 },
  cardName: { fontSize: 9.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, flexGrow: 1 },
  cardRisk: { fontSize: 7, fontFamily: FONT, fontWeight: 600, borderRadius: 20, paddingVertical: 1.5, paddingHorizontal: 6 },
  cardStats: { flexDirection: "row", flexWrap: "wrap", marginBottom: 7 },
  cardStat: { flexDirection: "row", alignItems: "baseline", marginRight: 12 },
  cardStatN: { fontSize: 11, fontFamily: FONT, fontWeight: 600 },
  cardStatL: { fontSize: 7, color: C.faint, marginLeft: 3 },
  loadTrack: { height: 4, borderRadius: 2, backgroundColor: C.lineSoft },
  loadCap: { fontSize: 6.8, color: C.faint, marginTop: 3 },

  // ── section heading (light, editorial) ──
  section: { marginTop: 18 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", borderBottomWidth: 1, borderBottomColor: C.ruleSection, paddingBottom: 4 },
  h2: { fontSize: 11, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.2, flexGrow: 1 },
  h2count: {
    fontSize: 7.5, fontFamily: FONT, fontWeight: 600, color: C.infoText,
    backgroundColor: C.infoBg, borderRadius: 20, paddingVertical: 1.5, paddingHorizontal: 7,
  },
  h2note: { fontSize: 7, color: C.faint, marginTop: 5, marginBottom: 1, lineHeight: 1.4 },

  // ── per-company block (flows continuously, no forced page break) ──
  companyBlock: { marginTop: 17 },
  // ⚠️ THE HEAD IS THE PANEL, AND THE TABLE FLOWS UNDER IT ON PURPOSE.
  // Drawing a border around head AND rows together would be the truer panel —
  // but a bordered box that breaks across a page has its border redrawn on both
  // fragments, and a company's table is exactly the thing that breaks. The
  // tinted rounded head plus the closing hairline reads as one panel and cannot
  // paginate badly.
  companyBlockHead: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.wash, borderWidth: 0.5, borderColor: C.line, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 10, marginBottom: 2,
  },
  companyMark: {
    width: 22, height: 22, borderRadius: 6, marginRight: 9,
    alignItems: "center", justifyContent: "center",
  },
  companyMarkText: { fontSize: 8, fontFamily: FONT, fontWeight: 700, color: "#ffffff" },
  companyBlockFoot: { borderBottomWidth: 0.5, borderBottomColor: C.line, marginTop: 1 },
  companyTitle: { fontSize: 11.5, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, letterSpacing: -0.3 },
  companyStats: { fontSize: 7.2, color: C.muted, marginTop: 1.5 },
  companyLogoLg: { width: 22, height: 22, borderRadius: 6, marginRight: 9, objectFit: "contain" },
  dotLg: { width: 9, height: 9, borderRadius: 3, marginRight: 9 },
  riskText: {
    fontSize: 7.5, fontFamily: FONT, fontWeight: 600,
    borderRadius: 20, paddingVertical: 2, paddingHorizontal: 7,
  },

  // ── modern open-work table (columns kept; description under the title) ──
  owHead: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 5, paddingTop: 5, paddingHorizontal: 4 },
  owTh: { fontSize: 6.5, fontFamily: FONT, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.4, paddingRight: 6 },
  owRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.lineSoft, paddingVertical: 7, paddingHorizontal: 4, alignItems: "flex-start" },
  owCell: { paddingRight: 6 },
  owTitle: { fontSize: 9, fontFamily: FONT, fontWeight: 600, color: C.inkStrong, lineHeight: 1.25 },
  owDesc: { fontSize: 7.5, color: C.muted, lineHeight: 1.35, marginTop: 1.5 },
  owText: { fontSize: 8, color: C.ink, lineHeight: 1.35 },
  // Status as a soft pill. A dot and a word made every status look equally
  // calm — Blocked read exactly as quietly as In Progress. The fill comes from
  // the status's own tone at render time.
  owStatusRow: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    borderRadius: 20, paddingVertical: 2, paddingHorizontal: 6,
  },
  owDot: { width: 4.5, height: 4.5, borderRadius: 2.25, marginRight: 4, flexShrink: 0 },
  owStatusText: { fontSize: 7.5, fontFamily: FONT, fontWeight: 600 },
  owSub: { fontSize: 7, color: C.faint, marginTop: 2 },
  owUpdate: { fontSize: 8, color: C.muted, lineHeight: 1.4 },
  owStamp: { fontSize: 7, marginTop: 2 },

  // sub-heading inside a company block
  blockHead: { flexDirection: "row", alignItems: "baseline", marginTop: 10, marginBottom: 2 },
  blockTitle: { fontSize: 8, fontFamily: FONT, fontWeight: 600, color: C.muted, letterSpacing: 0.3, textTransform: "uppercase", flexGrow: 1 },
  blockCount: { fontSize: 8, fontFamily: FONT, fontWeight: 500, color: C.accent },

  // ── tables ──
  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.lineSoft, alignItems: "flex-start" },
  thead: { borderBottomWidth: 0.5, borderBottomColor: C.line },
  trAlt: { backgroundColor: "#fbfcfe" },
  th: { fontSize: 6.5, fontFamily: FONT, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: 0.3, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 8, color: C.ink, paddingVertical: 4, paddingHorizontal: 4, lineHeight: 1.4 },
  tdStrong: { fontFamily: FONT, fontWeight: 600, color: C.inkStrong },
  // status / priority as a soft pill, matching the open-work table
  tdTagCell: { paddingVertical: 4, paddingHorizontal: 4 },
  tdTag: {
    fontSize: 7.5, fontFamily: FONT, fontWeight: 600, alignSelf: "flex-start",
    borderRadius: 20, paddingVertical: 2, paddingHorizontal: 6,
  },

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

// The pill's tone. Wider than statusTone above, which exists to colour TEXT and
// so deliberately leaves everything unexceptional black; a pill needs a fill for
// every status, including the calm ones.
const statusChipTone = (st: string): Tone =>
  st === "Completed" || st === "Closed" ? "success"
    : st === "Blocked" || st === "Escalated" ? "danger"
      : st === "Under Review" || st === "Waiting External" ? "warn"
        : st === "In Progress" ? "info"
          : "neutral";

/** Initials for the mark that stands in for a missing logo. Two letters at most —
 *  "Furaha Innovation Ltd" is FI, not FIL, because Ltd is not a name. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => w && !/^(ltd|limited|llc|plc|pvt|fzco|inc|co)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || name.slice(0, 2).toUpperCase();

// Status colour for the small leading dot (richer than the text tones — dots
// can carry colour cheaply without making the page busy).
const statusDot = (st: string): string =>
  st === "Completed" || st === "Closed" ? C.successText
    : st === "Blocked" || st === "Escalated" ? C.dangerText
      : st === "Under Review" || st === "Waiting External" ? C.warnText
        : st === "In Progress" ? C.infoText
          : C.faint;

const STALE_DAYS = 14;

// ── Keeping a row whole without losing the end of a long update ──────────────
// A table row is normally `wrap={false}` so it moves to the next page rather
// than splitting mid-cell. But react-pdf CLIPS an unbreakable block that is
// taller than the page instead of moving it — which is how the end of a long
// "Latest update" disappeared off the paper. So a row carrying enough prose to
// risk that is allowed to break across pages instead: split prose reads, cut
// prose does not.
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2; // A4 less both margins
const KEEP_WHOLE_MAX_PT = 380;                   // ~half a page of body text

// Rough text height. Source Sans lowercase prose averages ~0.48em a character,
// which is close enough to decide "is this row a page tall?" — it never has to
// be exact, only never wildly optimistic.
function textHeightPt(text: string, widthPct: string, fontSize = 8, lineHeight = 1.4, padding = 8) {
  const w = Math.max(24, (parseFloat(widthPct) / 100) * CONTENT_WIDTH - padding);
  const perLine = Math.max(8, Math.floor(w / (fontSize * 0.48)));
  const lines = text.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / perLine)), 0);
  return lines * fontSize * lineHeight;
}

// Long prose keeps its shape but loses wasted space: runs of blank lines
// collapse, and spaces/tabs inside a line collapse. Line breaks somebody typed
// on purpose (a list of points) survive.
const tidy = (t: string | null) =>
  (t ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").replace(/[ \t]*\n[ \t]*/g, "\n").trim();

// Status / priority / risk now render as COLOURED TEXT, not pill chips.
type Cell = string | number | null | { tag: string; tone: Tone } | { strong: string };

function Cell({ c, w }: { c: Cell; w: { width: string } }) {
  if (c && typeof c === "object" && "tag" in c) {
    // The width belongs to the CELL and the pill hugs its own text — put both on
    // one element and the pill stretches the full column.
    return (
      <View style={[s.tdTagCell, w]}>
        <Text style={[s.tdTag, { color: TONE_TEXT[c.tone], backgroundColor: TONE_BG[c.tone] }]}>{c.tag}</Text>
      </View>
    );
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
// It is kept whole unless one of its cells is tall enough that an unbreakable
// row would be clipped rather than moved (see textHeightPt above).
function Row({ r, widths, idx }: { r: Cell[]; widths: string[]; idx: number }) {
  const tallest = Math.max(0, ...r.map((c, ci) => {
    const text = c == null ? "" : typeof c === "object" ? ("tag" in c ? c.tag : c.strong) : String(c);
    return textHeightPt(text, widths[ci] ?? "10%");
  }));
  return (
    <View style={idx % 2 ? [s.tr, s.trAlt] : [s.tr]} wrap={tallest > KEEP_WHOLE_MAX_PT}>
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
  // Whoever the report is ABOUT: a person is the most specific selection, then a
  // company, else the parent brand. With nothing filtered this is BRAND_NAME, so
  // the portfolio-wide PDF is byte-for-byte what it always was.
  const title = b.selectedPersonName ?? b.selectedCompanyName ?? BRAND_NAME;
  const inProgressTotal = b.companies.reduce((n, c) => n + c.inProgress, 0);

  const summary =
    `In ${b.monthLabel}, ${title} delivered ${b.deliveredCount} item${b.deliveredCount === 1 ? "" : "s"} across ${b.companyCount} portfolio companies. ` +
    `${b.openCount} item${b.openCount === 1 ? "" : "s"} remain open (${inProgressTotal} in progress)` +
    `${b.overdueCount ? `, with ${b.overdueCount} overdue requiring attention` : ", with nothing overdue"}.` +
    `${b.watch.length ? ` ${b.watch.length} item${b.watch.length === 1 ? " is" : "s are"} flagged for attention.` : ""}` +
    `${b.directorActions.length ? ` ${b.directorActions.length} recommended director action${b.directorActions.length === 1 ? "" : "s"} listed.` : ""}`;

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
  // The update column carries the whole update now, so it gets the room: at 22%
  // it was ~27 characters a line, which turned a three-line note into a ribbon.
  const OWW = {
    task: { width: "27%" }, who: { width: "13%" }, pri: { width: "8%" },
    dl: { width: "10%" }, st: { width: "12%" }, up: { width: "30%" },
  } as const;

  // True when a row is tall enough that keeping it whole would clip it — the
  // update and the task cell are the only two that carry prose.
  const rowMustBreak = (t: BriefData["companies"][number]["tasks"][number]) =>
    Math.max(
      textHeightPt(tidy(t.latestUpdate), OWW.up.width, 8, 1.4, 0),
      textHeightPt(tidy(t.actionItem) + "\n" + clamp(t.description, 120), OWW.task.width, 9, 1.25, 6),
    ) > KEEP_WHOLE_MAX_PT;

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
    <Text style={[s.riskText, { color: TONE_TEXT[riskTone(risk)], backgroundColor: TONE_BG[riskTone(risk)] }]}>{risk}</Text>
  );

  const doc = (
    <Document title={`${title} — Director Brief`} author={BRAND_NAME}>
      <Page size="A4" style={s.page} wrap>
        {/* ── Letterhead ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {headerLogo
              ? <Image src={headerLogo} style={s.headerLogo} />
              : <View style={s.headerMark}><Text style={s.headerMarkText}>{initialsOf(title)}</Text></View>}
            <View>
              <Text style={s.eyebrow}>Director Brief</Text>
              <Text style={s.title}>{title}</Text>
              <Text style={s.sub}>
                {b.monthLabel} · {b.selectedPersonName
                  ? (b.selectedCompanyName ?? "Across all companies")
                  : "Tasks by company"}
              </Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.metaLabel}>As at</Text>
            <Text style={s.metaValue}>{b.asAt}</Text>
            <Text style={s.metaConf}>Confidential · Board use</Text>
          </View>
        </View>

        <View style={s.summary} wrap={false}>
          <Text style={s.summaryLabel}>Executive summary</Text>
          <Text style={s.summaryText}>{summary}</Text>
        </View>

        {/* KPI tiles — command-centre metric cards */}
        <View style={s.kpiRow} wrap={false}>
          {([
            [b.deliveredCount, "Delivered", `in ${b.monthLabel}`, "success"],
            [b.openCount, "Open", `${inProgressTotal} in progress`, "info"],
            [b.overdueCount, "Overdue", b.overdueCount ? "need attention" : "all on time", b.overdueCount ? "danger" : "success"],
            [b.companyCount, "Companies", b.atRiskCount ? `${b.atRiskCount} at risk` : "all healthy", "ink"],
          ] as [number, string, string, Tone][]).map(([n, l, sub, tone]) => (
            <View key={l} style={s.kpiCell}>
              <View style={[s.kpiTile, { backgroundColor: TONE_BG[tone], borderColor: TONE_LINE[tone] }]}>
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
                      <Text style={[s.cardRisk, { color: TONE_TEXT[riskTone(c.risk)], backgroundColor: TONE_BG[riskTone(c.risk)] }]}>{c.risk}</Text>
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
                  {logo
                    ? <Image src={logo} style={s.companyLogoLg} />
                    : <View style={[s.companyMark, { backgroundColor: c.accent || C.accent }]}>
                        <Text style={s.companyMarkText}>{initialsOf(c.name)}</Text>
                      </View>}
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
                // The update prints in full, so the row is only kept whole while
                // it is short enough that keeping it whole cannot clip it.
                const update = tidy(t.latestUpdate);
                return (
                  <View key={t.id} style={s.owRow} wrap={rowMustBreak(t)}>
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
                      <View style={[s.owStatusRow, { backgroundColor: TONE_BG[statusChipTone(t.status)] }]}>
                        <View style={[s.owDot, { backgroundColor: statusDot(t.status) }]} />
                        <Text style={[s.owStatusText, { color: TONE_TEXT[statusChipTone(t.status)] }]}>{t.status}</Text>
                      </View>
                    </View>
                    <View style={OWW.up}>
                      <Text style={s.owUpdate}>{update || "—"}</Text>
                      <Text style={[s.owStamp, { color: stale ? C.warnText : C.faint }]}>
                        {when ? `updated ${when}` : "no update yet"}{stale ? " · no recent update" : ""}
                      </Text>
                    </View>
                  </View>
                );
              };
              return (
                <View key={c.id} style={s.companyBlock}>
                  {/* Lead group = company header + column header + first row, kept
                      together — unless that first row is itself page-tall. */}
                  <View wrap={rowMustBreak(c.tasks[0])}>
                    {head}
                    {headRow}
                    {renderRow(c.tasks[0])}
                  </View>
                  {c.tasks.slice(1).map((t) => renderRow(t))}
                  <View style={s.companyBlockFoot} />
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
