---
name: session-26jul2026
description: "26 Jul 2026 — slim-down to task management, Next.js security patch, and the document-intake confidence work (incl. the suggest-only handbrake and the agent's ungated second door)"
metadata:
  node_type: memory
  type: project
---

# 26 July 2026 — what changed and why

Written for the owner, who is not technical. Plain English first; the exact
commits and file paths are at the bottom for whoever picks this up next.

---

## 1. Slimmed the system down to task management

Removed six areas the owner doesn't use: **Workbook** (which contained Meetings,
Notes and a To-do list), **Organogram**, **Letters + Letterheads**, **Requests**
(the staff request desk), the **staff data-collection form**, and **Leave**.

**No data was deleted.** Every table is still there — the screens are simply gone.
Any of it can be revived by restoring the route. 44 files deleted, 58 tidied.

Three things nearly broke and were caught:

- **Meetings lived inside Workbook.** `/meeting` only redirected there. Removing
  Workbook removes Meetings — the owner was asked before this went ahead rather
  than it being assumed.
- **`src/lib/meeting-tasks.ts` is the CALENDAR feature** (an event spawning a
  task), not Workbook. It was deleted by mistake and restored.
- **The company page's Org tab shared components with the Organogram.** The shared
  server actions were moved to `src/lib/org-actions.ts` first, so the company page
  still works.

**Leave → Attendance.** `/hrms/leave` is now an Attendance page with
`Register | Holidays` tabs. Holidays had to stay editable because the register
auto-fills them. **"On leave" is now a paintable status** — previously it was only
ever derived from an approved leave request, so removing Leave would have left no
way to record someone being away.

## 2. Security patch

Next.js 16.2.6 → **16.2.11**, closing nine advisories including a
middleware/proxy **authentication bypass** (CVSS 8.3). That one never applied here
— it needs `config.i18n.locales` with a single entry and this app has no i18n
config — but it was patched anyway. Also pinned patched `sharp`, `fast-uri` and
`postcss`.

**A build break happened here.** Forcing `brace-expansion` to the only patched
release (5.0.8) made `npm audit` report "0 vulnerabilities" while the app was
actually broken — 5.0.8 moved to a named export and `minimatch` throws on any
`{a,b}` pattern. Reverted. **A clean audit score and a working build were briefly
opposite things.** See `CLAUDE.md` for the standing note; do not re-apply.

## 3. The document room — the main piece of work

The owner's instinct was that the document AI "isn't smart enough to be handled
alone". Investigation against their Dropbox `Companies` system (a mature
filename-driven agent with its own written contract) found the opposite.

### The AI wasn't weak — it was forbidden from acting

`src/app/documents/actions.ts` contained `const AUTO_FILE = false`, set on
**5 July 2026** (commit `1bd2e2f`, "suggest-only intake"). From then on the intake
read every document properly — resolved the company, category and expiry, composed
the house filename, computed a confidence score — **and then discarded the verdict
and queued it anyway.** The queue only grew, and the reads were never trusted.

Replaced with a **confidence ladder**, modelled on the Dropbox agent:

- **Filed** — the owner came from a HARD signal (an identifier read off the page,
  the folder it was dropped in, or the batch owner declared) AND the read was
  clean AND nothing was ambiguous.
- **To Sort** — everything else, carrying a *specific* reason.
- **Trash** — duplicates and `-OLD`/`-VOID` copies (unchanged).

A fuzzy name match is deliberately **not** enough to file on.

**Owner-configurable**: Settings → AI & Voice → *Filing documents automatically*
(`high` default | `off` | `all`). The rule is no longer a constant buried in a
4,272-line file.

### The second door (the more important find)

`src/lib/agent-apply.ts` — the ORI cloud agent re-reading a held document — filed
on `companyId || personId` alone, **with no confidence gate**. It computed a
`confident` flag and used it only to pick a review label, then filed regardless.

So while the main intake sat behind the handbrake, **the agent was auto-filing
anyway**, on exactly the loose rule the new setting labels "not recommended". The
owner's switch would have governed half the system. Both doors now read the same
setting and gate. When the agent declines to file, it writes back why.

### The dashboard was flattering itself

The Intake accuracy card read **"62% auto-filed"** across three weeks when the
intake filed nothing on its own. Cause: a document the owner confirms by hand and
one the system places both end as `intake_state='filed'`, and the rate could not
tell them apart — **it was counting the owner's own labour as automation.**

`vetted_at` is stamped by every human confirm path and by no automatic one, which
makes it the honest divider. Corrected against 30 days of real data:

```
before   62% auto-filed ·  306 needed you
after    25% auto-filed ·  602 needed you
(filed 643 · 296 confirmed by hand · 148 flagged · 158 held)
```

**This is why the handbrake went unnoticed for three weeks** — nobody investigates
a metric that says things are fine.

### Also shipped

- **Travel shelf (09)** — business flights, hotels, itineraries. Marked
  non-expiring (a flown ticket is spent, not overdue). A "dummy" booking bought
  for a visa application stays on Immigration with that application.
- **Sort queue grouped by company** — a run of one company's documents now sits
  under one heading with a count, so the queue is cleared in batches.
- **Reasons are the deliverable** — "Held for review" is gone.
- **`DOCUMENTS.md`** at the repo root — the rules in plain English so the owner
  can audit behaviour without reading code. Keep it current.

### Deliberately NOT done

- **Superseded copies staying visible as `-OLD`.** 21 files compute document
  expiry; today a retired copy is archived and all 21 already honour that. Keeping
  it "filed" would mean teaching every one to skip it, and a single miss fires a
  false "expired" alert forever. Dropbox needs `-OLD` in the filename because the
  filename IS its database; this app has a real `supersedes_id` link doing the job.
- **`_NEEDID`.** "No person matched" already carries that meaning without a
  column.
- **Auto-binning near-duplicates.** An earlier plan to send them to Trash was
  **withdrawn** — the existing code already trashes identical files and holds
  "looks similar" ones on purpose, with `sameLogicalDocPair` guarding against
  treating a renewal as a duplicate. **A renewed licence shares most of its words
  with last year's; auto-binning on similarity would have destroyed renewals.**

---

## Mistakes made and caught (recorded on purpose)

1. Deleted `meeting-tasks.ts` believing it was Workbook; it is the calendar
   feature. Restored.
2. Proposed auto-binning near-duplicates — would have destroyed renewals.
   Withdrawn after reading the existing guards.
3. A `brace-expansion` override made the audit read clean while breaking the
   build. Caught by testing, not by the score.
4. The new Settings dropdown rendered and appeared to save but silently discarded
   the value — `saveSettings` builds an explicit patch object and the new field
   wasn't in it. Caught by querying the database rather than trusting the screen.
5. Described the `brace-expansion` chain as "build tooling"; it is actually
   runtime (`googleapis` → … → `minimatch`). Same conclusion, wrong reasoning.
   Corrected in `CLAUDE.md`.

**Pattern worth keeping:** every one of these was caught by checking the real
artefact — the database, the build, the running page — rather than the thing that
reports on it.

---

## Still open

- **The ladder has not met a real document.** Verifying it would mean putting real
  files into live storage. Suggested first run: drop one document with a TIN
  printed on it (should file itself) and one vague (should wait and explain).
- **Expect 25% to fall before it rises.** All of it came through the ungated door,
  now stricter. If nothing auto-files after a week, the "hard signal" bar is too
  high for how documents actually arrive — a tuning question, not a rebuild.
- **No on-screen link from a document to the version it replaced.** The
  `supersedes_id` link exists in data and is never shown.
- **One standing security warning** (`brace-expansion`) that cannot be fixed
  without breaking the build. A monthly scheduled task re-checks it.

---

## Commits (master)

| Commit | What |
|---|---|
| `8821ff7` | Slim down to pure task management: remove 6 unused feature areas |
| `0eed7b3` | Merge slim-down |
| `f157184` | Security: Next.js 16.2.6 → 16.2.11 + patched transitive deps |
| `f14ce38` | Merge security patch |
| `d54d151` | Replace the suggest-only handbrake with a confidence ladder |
| `f2c63fb` | Travel shelf, company-grouped sort queue, DOCUMENTS.md |
| `7287420` | Gate the agent's filing door, stop the metric flattering itself |
| `24f092f` | Merge document-intake confidence work |
| `fdd70c3` | docs: correct the brace-expansion note (runtime, not build-only) |

**Rollback points:** `16190e7` (before everything today), `0eed7b3` (before the
security patch), `f14ce38` (before the document work).

## Key files

- `src/app/documents/actions.ts` — the filing ladder + `ownerStrength`
- `src/lib/agent-apply.ts` — the second door, now gated
- `src/lib/intake-metrics.ts` — the honest rate
- `src/lib/settings.ts` + `src/app/settings/actions.ts` — `documentAutoFile`
  (**note:** `saveSettings` needs every new field added explicitly)
- `src/lib/documents-shared.ts` + `src/lib/doc-catalog.ts` — Travel shelf
- `src/components/sorting-desk.tsx` — company grouping
- `src/lib/org-actions.ts` — moved out of the deleted `/hrms/org`
- `DOCUMENTS.md` — the owner-facing contract
