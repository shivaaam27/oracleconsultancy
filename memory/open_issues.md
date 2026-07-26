---
name: open-issues
description: "Known gaps, rough edges, and sensible next steps"
metadata:
  node_type: memory
  type: project
---

# Open Issues and Follow-ups

## Product Gaps

- **No real server-side dispatch.** Outbox now creates persisted drafts and sends via channel **deep-links** (`wa.me`/`mailto:`/`sms:`) + manual "Mark sent". A real provider integration is still future (Phase 5c).
- **iPhone liquid lens has no live-backdrop refraction.** WebKit can't apply SVG filters as `backdrop-filter`, so on iOS the nav lens is frosted glass + chromatic morphing border (no pixel-bending of the live content). True refraction works on desktop Chromium. See `liquid_lens.md`. Don't re-add an in-lens icon/clone to "fix" this — it caused doubling.
- **Company detail page 404s in the local dev DB.** `/companies/[id]` calls `notFound()` when no row matches; the local dev data lacks those ids, so it 404s in preview (not a code bug). Test company-page actions against real data.
- **PWA shell is in place** (manifest, service worker, icons, offline page in `public/`); remaining PWA work is the offline data-editing phase (see auto-memory `project_offline_sync.md`).
- **Director Brief Phase 5 (optional).** `/brief` ships with this-month window + WhatsApp/Email/Copy + PDF; period filter (week/all), per-company brief, and scheduled auto-send are future.
- **OCR Phases 3–5 outstanding.** Cleaning registry has data + the daily checklist; history/dashboard, area management, and photos/reminders/export are future (see `hrms.md`).
- **Documents AI** reads PDFs + images (incl. scanned) **and Word/Excel/CSV** (`extractOfficeText` — mammoth + xlsx in `documents/actions.ts`).
- **Daily snapshots need production verification.** `daily_snapshots` and `/api/cron/snapshots` exist, but scheduling/production execution should be confirmed. (Same applies to the new `/api/cron/notify` job.)
- **Push notifications need prod env vars.** Code is complete, but production won't send alerts until `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` are added to Vercel. Keys are generated locally in `.env.local` (gitignored). Push also requires HTTPS (Vercel) — won't fully work in local dev. iOS requires the app be added to the Home Screen first.
- ~~Corrections table has no UI~~ → **Done (June 2026):** "Record correction" lives in the task-timeline entry menu; the original entry gets a "Corrected" badge and a linked CORRECTION audit entry carries the note.
- ~~No auth~~ → **Done:** owner password gate (`/login`, `cos_admin`) + per-person staff portal (`cos_portal`) + optional owner identity 2nd factor + passkeys. See `memory/portal.md` / `memory/auth_login.md`.

## June 2026 build — resolved + new follow-ups

**Resolved this round** (don't re-flag as gaps):
- Attendance is now writable (admin register + staff self-check-in). Departments/Sites/Roles have a management UI (Companies hub tabs). Organogram portfolio = ELK multi-parent flowchart. Reporting surfaced across People. Native `<datalist>` dropdowns replaced by `combobox.tsx`. Settings page redesigned (compact cards + section nav). Login redesigned (tabs + passkeys).
- **My first audit over-claimed these as broken — they WORK, don't "fix":** task @mention notifications, meeting decisions/risks extraction + minutes display, recurring obligations (live in Tax & Legal).

**New follow-ups / known gaps:**
- **Passkeys not live-tested** — no biometric hardware in the dev preview; verify the real Face ID/fingerprint ceremony on the live HTTPS site (and add a passkey before the login button can find one). iOS needs the site on the Home Screen.
- **Letters: only 2 templates** (Invitation + Blank). Offer/Employment/Warning/Termination still to add (`lib/letters.ts`).
- **No full-text task search** (search is code/title/company only).
- **Vendor compliance deferred** (vendors are a read-only list; no requirement profiles/scores).
- **`tasks.escalation_level`** is written but never read (dead column — drop or wire).
- **site_tools still uses free-text `location`** (not yet pointed at the shared `sites` table); person-card doesn't show location; no "magic link" email login (discussed, not built).
- **Attendance:** no clock in/out times (status-per-day by design); manager-confirm flow not built (self-marking is trusted).

## ORI-brain build — follow-ups (June 2026)

The 7-wave "ORI as the self-sustaining brain" build shipped (commit `415ef46`; migrations 0094/0095/0096 applied). See `memory/ori_brain.md`. Remaining loose ends:

- **Streaming ORI client doesn't persist QA.** The Ask route auto-records question/answer to `ai_memory` only on the **non-stream** path; the streaming client should POST its final answer to `/api/ai-memory` so streamed conversations are remembered too. Client wiring is still a follow-up.
- **Per-write index hooks rely on the nightly reindex as the catch-all.** Continuous indexing covers the main write paths, but freshness ultimately leans on `/api/cron/reindex` (`reindexAll`) to sweep anything a hook missed. Add hooks on any new write path; don't assume same-second semantic freshness everywhere.
- **AI spend rate is 0 today (Groq free tier).** `MODEL_RATES` carry no real prices and `aiMonthlySpendCap` defaults to 0 = unlimited. Before going paid, set real per-model rates in `MODEL_RATES` and a sensible cap.
- **Provider fallback is a scaffold only.** `GROQ_FAST`/`GROQ_SMART` now have env model ladders (self-heal through a decommissioned model), and an `AIProvider` extension point exists, but only Groq is wired. Adding a real second provider is future.

**Resolved this round** (don't re-flag):
- ~~ORI couldn't answer "who owns Dar Spices" (governance was blind to the Ask context)~~ → **Done:** the Ask context now pulls governance (cap table, beneficial owners, signatories, key persons, company facts, resolutions) plus letters/vendors/assets/leave/pipeline/commitments, so ownership/governance questions are answerable.

## Meeting Workspace Follow-ups

- Add recent meetings to company pages.
- Add a read-only meeting detail/drawer view if history becomes too dense.
- Deepen multilingual support beyond dictation language: original-language notes, English minutes, and translated summaries.
- Expand voice dictionary quality loops beyond Meeting Workspace.
- Add voice intelligence to Outbox drafts and any remaining long-form inputs.
- Decide whether Meeting intelligence output should be stored separately or remain transient/editable text.

## Technical Smells

- **Turbopack dev CSS cache (dev-only).** `globals.css` edits sometimes don't recompile until you stop the dev server, `rm -rf .next`, and restart. Production builds are always fresh.
- `scripts/import.ts` has no `db:import` npm alias.
- `splitNames` regex `/,| & | and /i` can split names containing the word "and".
- Some date parsing still relies on browser date inputs producing `YYYY-MM-DD`.
- Task code allocation is read-max-then-insert with retries. Heavy concurrent creation would need a stronger allocator.

## Things Not To Surprise-Fix

- Do not re-create removed routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`.
- Do not re-add the desktop **sidebar** — navigation is intentionally the one bottom pill on all breakpoints.
- Do not re-add the **"More" sheet** or per-tab popovers — secondary destinations live in the single centred **HRMS "Go to" launcher** (`HrmsLauncher`).
- Brand is **Oracle Consultancy** (renamed from "Oracle Group" in V2); don't reintroduce the old name.
- Do not revert timestamp columns from **`timestamptz`** back to plain `timestamp` (see `database_schema.md`).
- Do not paint an icon/clone inside the **liquid lens** without first solving icon doubling.
- Do not alter `src/db/index.ts` pooler settings.
- Do not add real message dispatch without choosing and configuring a provider.
- Do not add web search into app answers without explicit source handling and user-visible control.

## Added 26 Jul 2026 (see `session_26jul2026.md`)

- **The document filing ladder has never met a real document.** Verifying it means
  putting real files into live storage. First run: drop one document with a TIN
  printed on it (should file itself) and one vague (should wait and explain).
- **Expect the auto-file rate to FALL before it rises.** The 25% shown all came
  through the agent's previously-ungated door, now gated. If nothing auto-files
  after a week, the "hard signal" bar is too high for how documents actually
  arrive — tune the ladder, don't rebuild it.
- **No on-screen link from a document to the version it replaced.** The
  `supersedes_id` link exists in the data and is never surfaced. Superseded copies
  deliberately stay in Trash (21 files compute expiry and all honour `archived`;
  keeping them "filed" risks a permanent false "expired" alert).
- **`brace-expansion` 2.1.2 under `minimatch` stays unpatched** — the only fix
  (5.0.8) breaks the build. Monthly scheduled task re-checks it. Do not add an
  override; see `CLAUDE.md`.
- **`saveSettings` builds an explicit patch object.** A new Settings field that is
  rendered but not added there will silently discard the owner's choice with no
  error. This happened on 26 Jul; check the database, not the screen.
