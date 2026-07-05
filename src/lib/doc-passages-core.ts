/* ------------------------------------------------------------------ *
 * Document passage layer (PURE / client-safe core) — the "organised
 * registry" over a document's already-stored body text. Splits the flat
 * extracted text into meaningful blocks, each tagged with a best-effort
 * LOCATION ("Page 4", "Clause 32", "Section 3"), and keyword-searches
 * WITHIN a document — AI-free, instant, no I/O.
 *
 * The server wrapper (doc-passages.ts) reads documents.extracted_text and
 * calls these. No new table / migration: passages are derived on demand.
 *
 * Works for every file type because it operates on the extracted TEXT the
 * intake already captured (PDF text layer, OCR of scans/photos, Office/CSV).
 * Degrades gracefully to paragraph blocks when no page/section markers exist.
 * ------------------------------------------------------------------ */

export type Passage = { ord: number; location: string; body: string };
export type PassageHit = Passage & {
  /** Match count-driven rank (how many distinct query terms landed). */
  score: number;
  /** Excerpt around the first hit, each matched term wrapped in «…» so the UI
   *  can highlight it (same convention as the document FTS snippet). */
  snippet: string;
};

const MIN_PASSAGE = 40; // merge blocks shorter than this into the next
const MAX_PASSAGES = 400; // bound a pathologically long document
const SNIPPET_RADIUS = 140; // chars of context on each side of the first hit

/** Explicit location label at the top of a block: "Page 4", "--- page 4 ---",
 *  "Sheet: Payroll", "Slide 3". Null if none. */
function markerLocation(block: string): string | null {
  const head = block.slice(0, 60);
  const m =
    /^[\s\-—=]*(page|pg\.?|sheet|slide|tab|section)\s+([0-9]+|[ivxlcdm]+|[a-z][\w-]*)/i.exec(head) ||
    /^[\s\-—=]*(page|sheet|slide)\s*[:#]\s*(\S+)/i.exec(head);
  if (!m) return null;
  const kind = m[1].toLowerCase().startsWith("pg") ? "Page" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return `${kind} ${m[2]}`;
}

/** A clause/section number leading the block → a friendly location tag, so a
 *  contract term is locatable. Handles the WORD form ("Clause 32", "Article 3")
 *  and a bare leading number ("32." / "32.1 Severance"). */
function clauseLocation(block: string): string | null {
  const named = /^\s*(clause|article|paragraph|para|item)\s+(\d{1,3})/i.exec(block);
  if (named) {
    const kind = named[1].toLowerCase() === "para" ? "Paragraph" : named[1][0].toUpperCase() + named[1].slice(1).toLowerCase();
    return `${kind} ${named[2]}`;
  }
  const m = /^\s*(\d{1,3})(?:\.\d{1,3})?[.)]?\s+[A-Za-z]/.exec(block);
  return m ? `Clause ${m[1]}` : null;
}

/**
 * Split a document's extracted text into located passages. Boundary preference:
 * form-feed page breaks (\f) → explicit "Page/Sheet/Slide N" markers → blank-line
 * paragraph blocks. Short blocks merge forward so a lone heading never becomes a
 * passage on its own.
 */
export function splitIntoPassages(text: string | null | undefined): Passage[] {
  const t = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!t) return [];

  const usedFormFeed = t.includes("\f");
  const rawBlocks = usedFormFeed ? t.split("\f") : t.split(/\n\s*\n+/);

  const passages: Passage[] = [];
  let pageCounter = 0;
  let sectionCounter = 0;
  let carry = "";
  let carriedLoc: string | null = null;

  const flush = (body: string, loc: string | null) => {
    const clean = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!clean) return;
    sectionCounter += 1;
    const location = loc || clauseLocation(clean) || `Section ${sectionCounter}`;
    passages.push({ ord: passages.length, location, body: clean.slice(0, 4000) });
  };

  for (const raw of rawBlocks) {
    if (passages.length >= MAX_PASSAGES) break;
    const block = raw.trim();
    if (!block) continue;

    // A form-feed is a hard page boundary — trust the running page count over any
    // in-text "Page …" phrase. Otherwise fall back to marker detection.
    let loc: string | null;
    if (usedFormFeed) {
      pageCounter += 1;
      loc = `Page ${pageCounter}`;
    } else {
      loc = markerLocation(block);
    }

    const candidate = carry ? `${carry}\n\n${block}` : block;
    // Merge tiny fragments forward — but NOT across a form-feed page break, where
    // each page is its own passage however short.
    if (!usedFormFeed && candidate.length < MIN_PASSAGE) {
      carry = candidate;
      carriedLoc = carriedLoc || loc;
      continue;
    }
    flush(candidate, carriedLoc || loc);
    carry = "";
    carriedLoc = null;
  }
  if (carry) flush(carry, carriedLoc);
  return passages;
}

const TOKEN_STOP = new Set(["the", "a", "an", "of", "for", "to", "in", "on", "and", "is", "with", "at", "by"]);

function queryTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !TOKEN_STOP.has(w)),
    ),
  ).slice(0, 8);
}

function makeSnippet(body: string, tokens: string[]): string {
  const lower = body.toLowerCase();
  let first = -1;
  for (const tk of tokens) {
    const i = lower.indexOf(tk);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  const start = first === -1 ? 0 : Math.max(0, first - SNIPPET_RADIUS);
  const end = Math.min(body.length, (first === -1 ? 0 : first) + SNIPPET_RADIUS * 2);
  let excerpt = body.slice(start, end).replace(/\s+/g, " ").trim();
  for (const tk of tokens) {
    excerpt = excerpt.replace(new RegExp(`(${tk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "«$1»");
  }
  return (start > 0 ? "…" : "") + excerpt + (end < body.length ? "…" : "");
}

/**
 * Keyword-search WITHIN a set of passages (AI-free). Returns the best-matching
 * passages, each with location + a highlighted snippet, ranked by how many
 * distinct query terms they contain. A passage must match at least one term.
 */
export function searchPassages(passages: Passage[], query: string, limit = 4): PassageHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const hits: PassageHit[] = [];
  for (const p of passages) {
    const lower = p.body.toLowerCase();
    let matched = 0;
    let occurrences = 0;
    for (const tk of tokens) {
      const n = lower.split(tk).length - 1;
      if (n > 0) {
        matched += 1;
        occurrences += n;
      }
    }
    if (matched === 0) continue;
    hits.push({ ...p, score: matched * 100 + Math.min(occurrences, 20), snippet: makeSnippet(p.body, tokens) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
