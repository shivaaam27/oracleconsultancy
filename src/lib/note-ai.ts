import { AI_FAST, AI_SMART } from "@/lib/ai-models";
import { callAIJson, callAIText } from "@/lib/ai-json";
import { getAiKey } from "@/lib/settings";

/**
 * The AI half of Notes. Phase 5 of memory/notes_module_plan.md.
 *
 * ⚠️ THE ONE RULE, taken from the document-intelligence rebuild and stated in §6:
 * **AI may READ and SUGGEST. It must never rewrite, retitle, file, tag or link a
 * note on its own.** Every function here RETURNS a proposal. Not one of them
 * writes to the database, and none of them is called from a save path or a cron.
 * The whole document module had to be rebuilt by hand because that rule was
 * broken once; it is not going to be broken here.
 *
 * Everything runs on the existing provider harness (`callAIText`/`callAIJson`),
 * so it inherits the model ladder, the retry/backoff, the spend ledger and the
 * spend cap for free. No new provider, no new key.
 *
 * AI-off degrades gracefully everywhere: a missing key, an exhausted quota or a
 * spend cap come back as `{ ok: false, reason }` and the caller shows a quiet
 * message. Nothing here throws at the owner.
 */

export type AiFailure = "no-key" | "spend-cap" | "empty" | "error";

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure; message: string };

/** Turn the harness's error string into something a person can act on. */
function fail(error: string | null | undefined): AiResult<never> {
  if (error === "no-key") {
    return { ok: false, reason: "no-key", message: "AI is switched off — add a key in Settings → AI." };
  }
  if (error === "spend-cap") {
    return { ok: false, reason: "spend-cap", message: "The monthly AI budget is used up. Raise it in Settings." };
  }
  return { ok: false, reason: "error", message: "The AI could not be reached just now. Try again in a moment." };
}

/** Notes can be long; a model call cannot be. Enough for a full page of writing,
 *  and the tail is dropped rather than the head because the point of a note is
 *  usually near the top. */
const MAX_CHARS = 12_000;

function clip(text: string): string {
  const t = text.trim();
  return t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS)}\n…(the rest of the note is not shown)` : t;
}

/** The house voice, applied to every prompt here. */
const HOUSE =
  "You are helping the owner of a Tanzanian group of companies with his private notes. " +
  "Write British English. Be plain and concrete. Never invent facts, names, numbers or dates that are not in the note. " +
  "If the note does not say something, leave it out.";

/* ------------------------------------------------------------------ */
/* Polish — rough writing into clean prose                             */
/* ------------------------------------------------------------------ */

/**
 * Tidy the writing WITHOUT changing what it says.
 *
 * Returns the proposed text; the caller shows it beside the original and the
 * owner accepts or discards. This is the action the whole module was asked for —
 * "rough ideas go in fast and get polished later" — so it is deliberately
 * conservative: structure kept, meaning untouched, nothing added.
 */
export async function polishNote(text: string): Promise<AiResult<{ text: string }>> {
  const body = clip(text);
  if (!body) return { ok: false, reason: "empty", message: "There is nothing written yet." };

  const key = await getAiKey();
  const res = await callAIText({
    apiKey: key,
    models: [AI_SMART, AI_FAST],
    temperature: 0.2,
    maxTokens: 2000,
    source: "note-polish",
    messages: [
      {
        role: "system",
        content:
          `${HOUSE} Tidy the note below: fix spelling, grammar and punctuation, remove dictation fillers and ` +
          "false starts, and break it into sensible paragraphs. KEEP the meaning, the facts and the order exactly as they are. " +
          "Do NOT add opinions, conclusions, headings or anything the note does not already say. " +
          "Do NOT remove names, numbers, dates or amounts. " +
          "Reply with the tidied note ONLY — no preamble, no quotes, no code fences.",
      },
      { role: "user", content: body },
    ],
  });

  if (!res.ok || !res.text) return fail(res.error);
  const out = stripChrome(res.text);
  if (!out) return { ok: false, reason: "empty", message: "The AI returned nothing usable." };
  return { ok: true, data: { text: out } };
}

/* ------------------------------------------------------------------ */
/* Summarise                                                           */
/* ------------------------------------------------------------------ */

export type NoteSummary = { points: string[] };

/** Three bullets at the top. The caller inserts them as a callout — which is why
 *  callouts were built before this. */
export async function summariseNote(text: string): Promise<AiResult<NoteSummary>> {
  const body = clip(text);
  if (!body) return { ok: false, reason: "empty", message: "There is nothing written yet." };

  const key = await getAiKey();
  const res = await callAIJson({
    apiKey: key,
    model: AI_SMART,
    temperature: 0.1,
    maxTokens: 600,
    source: "note-summarise",
    shape: { required: { points: "array" } },
    messages: [
      {
        role: "system",
        content:
          `${HOUSE} Summarise the note in at most three short bullet points — the things that actually matter. ` +
          'Reply as JSON: {"points": ["…", "…"]}. Each point is one sentence. No preamble.',
      },
      { role: "user", content: body },
    ],
  });

  if (!res.ok || !res.data) return fail(res.error);
  const points = asStringArray((res.data as { points?: unknown }).points).slice(0, 3);
  if (points.length === 0) return { ok: false, reason: "empty", message: "The AI found nothing worth summarising." };
  return { ok: true, data: { points } };
}

/* ------------------------------------------------------------------ */
/* Extract tasks                                                       */
/* ------------------------------------------------------------------ */

export type ExtractedTask = { title: string; why?: string };

/**
 * Find the commitments hiding in a note.
 *
 * Returns a tick-list the owner confirms; **nothing is created silently** (§6).
 * The caller turns accepted ones into `todos` rows via the Phase 4 path, so they
 * arrive in the same list, digest and push as every other to-do.
 */
export async function extractTasks(text: string): Promise<AiResult<{ tasks: ExtractedTask[] }>> {
  const body = clip(text);
  if (!body) return { ok: false, reason: "empty", message: "There is nothing written yet." };

  const key = await getAiKey();
  const res = await callAIJson({
    apiKey: key,
    model: AI_SMART,
    temperature: 0.1,
    maxTokens: 800,
    source: "note-extract-tasks",
    shape: { required: { tasks: "array" } },
    messages: [
      {
        role: "system",
        content:
          `${HOUSE} Find the things in this note that somebody has to DO — commitments, follow-ups, promises, deadlines. ` +
          'Reply as JSON: {"tasks": [{"title": "…", "why": "…"}]}. ' +
          "`title` is a short instruction starting with a verb (\"Chase the permit renewal\"). " +
          "`why` quotes or paraphrases the words in the note that made you think so, in under 12 words. " +
          "Only include something if the note really implies an action. If there is nothing to do, reply with an empty list. " +
          "Never invent a deadline or a person.",
      },
      { role: "user", content: body },
    ],
  });

  if (!res.ok || !res.data) return fail(res.error);
  const raw = (res.data as { tasks?: unknown }).tasks;
  const tasks: ExtractedTask[] = (Array.isArray(raw) ? raw : [])
    .flatMap((t): ExtractedTask[] => {
      const o = (t ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      if (!title) return [];
      const why = typeof o.why === "string" ? o.why.trim() : "";
      return [{ title: title.slice(0, 200), ...(why ? { why: why.slice(0, 120) } : {}) }];
    })
    .slice(0, 10);

  if (tasks.length === 0) return { ok: false, reason: "empty", message: "Nothing in this note looks like a job to do." };
  return { ok: true, data: { tasks } };
}


/* ------------------------------------------------------------------ */
/* Suggest links — the last AI action §6 listed                        */
/* ------------------------------------------------------------------ */

/** One proposed link: which record, and the words in the note that mean it. */
export type LinkSuggestion = {
  /** Index into the candidate list that was handed to the model. */
  index: number;
  /** The exact words in the note that refer to it — this is what gets rewritten
   *  into a mention, so it MUST be text that is really there. */
  phrase: string;
  why?: string;
};

/**
 * Read a note and say what it is about.
 *
 * ⚠️ HOW THIS DIFFERS FROM UNLINKED MENTIONS, and why both exist. `findUnlinked`
 * matches names EXACTLY: write "Sulleiman" and it offers Sulleiman. It is fast,
 * free, and certain. This reads the MEANING — "the permit chap", "the chocolate
 * company", "that Terra job" — which is the half exact matching can never do. It
 * costs a model call, so it is asked for rather than always on.
 *
 * ⚠️ THE MODEL CHOOSES FROM A LIST; IT NEVER NAMES A RECORD. It is given numbered
 * candidates and must answer with numbers, so it cannot invent a person or point
 * at an id that does not exist. Anything outside the list is dropped here, and
 * the caller drops anything whose phrase is not really in the note — because the
 * phrase is what gets rewritten, and rewriting words that were never written is
 * the one way this could damage a note.
 */
export async function suggestLinks(
  text: string,
  candidates: { label: string; kind: string; hint?: string }[],
): Promise<AiResult<{ links: LinkSuggestion[] }>> {
  const body = clip(text);
  if (!body) return { ok: false, reason: "empty", message: "There is nothing written yet." };
  if (candidates.length === 0) {
    return { ok: false, reason: "empty", message: "There is nothing in COS to link to yet." };
  }

  const list = candidates
    .map((c, i) => `${i}. [${c.kind}] ${c.label}${c.hint ? ` — ${c.hint}` : ""}`)
    .join("\n");

  const key = await getAiKey();
  const res = await callAIJson({
    apiKey: key,
    model: AI_SMART,
    temperature: 0.1,
    maxTokens: 700,
    source: "note-suggest-links",
    shape: { required: { links: "array" } },
    messages: [
      {
        role: "system",
        content:
          `${HOUSE} You are given a note and a numbered list of records in the system. ` +
          "Say which records the note is talking about, INCLUDING where it refers to them indirectly — " +
          '"the permit chap", "the chocolate company", "that job for Terra". ' +
          'Reply as JSON: {"links": [{"index": 0, "phrase": "…", "why": "…"}]}. ' +
          "`index` is the number from the list — never a name, never a number that is not on the list. " +
          "`phrase` MUST be copied EXACTLY from the note, word for word, and should be the shortest run of words that refers to the record. " +
          "`why` is under 10 words saying how you knew. " +
          "Only suggest a record you are confident the note really means. A note that mentions nothing on the list gets an empty list. " +
          "Do not guess from a vague similarity, and never suggest a record just because its words look a bit alike.",
      },
      { role: "user", content: `RECORDS:\n${list}\n\nNOTE:\n${body}` },
    ],
  });

  if (!res.ok || !res.data) return fail(res.error);
  const raw = (res.data as { links?: unknown }).links;
  const links: LinkSuggestion[] = (Array.isArray(raw) ? raw : [])
    .flatMap((l): LinkSuggestion[] => {
      const o = (l ?? {}) as Record<string, unknown>;
      const index = Number(o.index);
      const phrase = typeof o.phrase === "string" ? o.phrase.trim() : "";
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length) return [];
      if (!phrase) return [];
      const why = typeof o.why === "string" ? o.why.trim() : "";
      return [{ index, phrase: phrase.slice(0, 120), ...(why ? { why: why.slice(0, 100) } : {}) }];
    })
    .slice(0, 8);

  if (links.length === 0) {
    return { ok: false, reason: "empty", message: "Nothing in this note points at a record in COS." };
  }
  return { ok: true, data: { links } };
}

/* ------------------------------------------------------------------ */
/* Auto-title                                                          */
/* ------------------------------------------------------------------ */

/** A title for an untitled note — a suggestion in the header, one tap to take. */
export async function suggestTitle(text: string): Promise<AiResult<{ title: string }>> {
  const body = clip(text);
  if (!body) return { ok: false, reason: "empty", message: "There is nothing written yet." };

  const key = await getAiKey();
  const res = await callAIText({
    apiKey: key,
    models: [AI_FAST, AI_SMART],
    temperature: 0.3,
    maxTokens: 60,
    source: "note-title",
    messages: [
      {
        role: "system",
        content:
          `${HOUSE} Give this note a short title — at most six words, no full stop, no quotes. ` +
          "It should say what the note is about, the way a person would name it. Reply with the title only.",
      },
      { role: "user", content: body },
    ],
  });

  if (!res.ok || !res.text) return fail(res.error);
  const title = stripChrome(res.text).split("\n")[0]?.trim().slice(0, 120) ?? "";
  if (!title) return { ok: false, reason: "empty", message: "The AI could not name this one." };
  return { ok: true, data: { title } };
}

/* ------------------------------------------------------------------ */
/* Ask your notes                                                      */
/* ------------------------------------------------------------------ */

export type NoteAnswer = { answer: string; usedNoteIds: number[] };

/**
 * Answer a question from the note corpus, WITH citations.
 *
 * The passages come from the caller (the search index built in Phase 6), so this
 * function stays a pure "read these, answer that" step. It is told to say when the
 * notes do not answer the question, which matters more here than anywhere else in
 * COS: these are the owner's own words, and a confident invention would be read as
 * something he wrote.
 */
export async function askNotes(
  question: string,
  passages: { id: number; title: string; text: string }[],
): Promise<AiResult<NoteAnswer>> {
  const q = question.trim();
  if (!q) return { ok: false, reason: "empty", message: "Ask a question first." };
  if (passages.length === 0) {
    return { ok: false, reason: "empty", message: "Nothing in your notes looks related to that." };
  }

  const context = passages
    .map((p, i) => `[${i + 1}] (note ${p.id}) ${p.title}\n${clipTo(p.text, 2000)}`)
    .join("\n\n---\n\n");

  const key = await getAiKey();
  const res = await callAIJson({
    apiKey: key,
    model: AI_SMART,
    temperature: 0.1,
    maxTokens: 900,
    source: "note-ask",
    shape: { required: { answer: "string" }, optional: { used: "array" } },
    messages: [
      {
        role: "system",
        content:
          `${HOUSE} Answer the question using ONLY the notes below. ` +
          'Reply as JSON: {"answer": "…", "used": [1, 2]}, where `used` lists the bracketed numbers you actually relied on. ' +
          "If the notes do not answer it, say so plainly in `answer` and return an empty `used`. " +
          "Never fill a gap with something that is not written down — these are the owner's own words and an invention would be read as his.",
      },
      { role: "user", content: `Question: ${q}\n\nNotes:\n\n${context}` },
    ],
  });

  if (!res.ok || !res.data) return fail(res.error);
  const data = res.data as { answer?: unknown; used?: unknown };
  const answer = typeof data.answer === "string" ? data.answer.trim() : "";
  if (!answer) return { ok: false, reason: "empty", message: "The AI returned nothing usable." };

  const used = Array.isArray(data.used) ? data.used : [];
  const usedNoteIds = used
    .map((n) => passages[Number(n) - 1]?.id)
    .filter((id): id is number => Number.isInteger(id));

  return { ok: true, data: { answer, usedNoteIds: [...new Set(usedNoteIds)] } };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Models add a conversational wrapper however firmly they are told not to. */
function stripChrome(text: string): string {
  let out = text.trim();
  out = out.replace(/^(?:sure|certainly|here(?:'s| is)|here are|the (?:tidied|polished|cleaned)[^:]*)[^:]*:\s*/i, "");
  const quoted = out.match(/^(["'`])([\s\S]*)\1$/);
  if (quoted) out = quoted[2]!;
  out = out.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  return out.trim();
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .map((s) => s.slice(0, 300));
}

function clipTo(text: string, max: number): string {
  const t = (text ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
