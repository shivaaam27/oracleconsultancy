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

## Added 17 Aug 2026 — the portal's `zoom: 0.8` vs `getBoundingClientRect`

**✅ FIXED 17 Aug 2026 — every anchored dropdown on the portal used to open in the
WRONG PLACE**, and the error grew the further down the page you were. Kept here
because the trap is easy to walk back into. Measured on `/portal/task/PE-004`:

| Control | Before | After |
|---|---|---|
| Priority (`FluidSelect`) | told `top: 123.5`, rendered 99 — **over its own trigger** | 5px below it, 0 sideways |
| Add someone (`useAnchored`) | told `top: 435`, rendered 348 — **81px above**, 46px left | 5px below it, 0 sideways |
| Due date (`date-popover`) | same fault | 5px below it, 0 sideways |

The ratio was **exactly 0.8** every time. Near the top of a page the drift was
~24px; at y≈800 it would have been ~160px.

**The fix: `src/lib/zoom.ts`** — `rootZoom()` and `layoutRect(el)`, one definition,
and its header comment is the explanation. `use-anchored.ts` now returns LAYOUT
pixels plus `bottomOffset` / `viewportWidth` / `viewportHeight`, **so that no
consumer ever touches `window.innerHeight` again** — that mixing was the actual
bug, and five call sites had copied it. `fluid-select.tsx` measures through
`layoutRect`; `tour-guide.tsx` too (it is mounted on the portal layout, so the
first tour ever written would have been misplaced). `portal-pill`/`top-pill` had
each solved this locally with their own ratio sum — both now call `rootZoom()`.

**FORWARD RULE: a measurement that becomes a style comes from `layoutRect()`.**
`getBoundingClientRect()` and `window.inner*` are visual pixels; CSS lengths are
layout pixels; on the portal those differ by 0.8.

Verified: `tsc` clean, 281 tests pass, and the three controls above re-measured in
the browser as a director. **The notification bell's panel is the one path checked
by code + type-check only** — a synthetic click doesn't open it, so give it one
eyeball. Admin side is `zoom: 1`, where every function in `zoom.ts` is the
identity, so nothing there could shift.

**The cause, and it is a one-line idea:** `getBoundingClientRect()` returns
**visual** pixels (already scaled by the zoom), but those numbers are then written
back as **CSS** pixels into a document that scales them by 0.8 again. Portal pages
set `zoom: 0.8` (`portal-zoom.tsx` + `globals.css` ~line 584); the admin side is
`zoom: 1`, which is why the command centre looks perfect and only the portal is
wrong — and why this survived so long.

Affected (all read a rect and write it as a style): **`lib/use-anchored.ts`**
(Due date via `date-popover`, Companies via `task-copy-companies`, Add-someone +
Leads in `portal-tasks-command`, `people-picker`, `notification-bell`) and
**`fluid-select.tsx`** (Priority · Category · Risk). `use-anchored`'s `maxHeight`
has the same fault via `window.innerHeight`, so menus are also ~25% shorter than
the room actually available.

**Fix:** divide rect values by the effective zoom before writing them. Don't read
the CSS — derive it, exactly as `portal-pill.tsx` already does
(`cr.width / el.offsetWidth`), then share that helper. Two files, and every portal
dropdown comes right at once.

**🟡 `vh`/`vw`/`dvh` are 20% short on portal pages** — measured `100vh` = 670px of
an 838px screen, `100vw` = 979 of 1223. `position: fixed; inset: 0` IS correct
(full screen), so sheets and dialogs still cover properly and the portal sidebar
(`fixed inset-y-0`) is genuinely full height. What is smaller than intended:
`chat-surface`'s `md:h-[calc(100dvh-13rem)]` pane and `max-h-[85dvh]` sheet, and
`announcement-takeover`'s `max-h-[50vh]`. Cosmetic — do not "fix" it by removing
the zoom.

**What is NOT wrong, so stop re-checking it:** media queries evaluate against the
REAL window (at a 1223px window `min-width:1024px` is true and `1280px` is false),
so breakpoints still fire at true sizes; there is no horizontal overflow
(`scrollWidth == clientWidth`); and content fills the window with no dead strip.

## ✅ Real identities were being used as placeholders (17 Aug 2026)

The Command Centre tab's "Name or email" field carried
`placeholder="admin@oracle.co.tz"` — the owner's **actual** sign-in identifier,
shown to anyone who opened `/login`. When owner identity is configured that field
IS the second factor, so the page was giving away half of it. Now no placeholder at
all; the label is the instruction.

Two of the same fault, found by grepping for the domain rather than assuming it was
one slip:
- `/portal/login` suggested `"e.g. Shivam"` — a real member of staff.
- `/mcp/connect` (which sits OUTSIDE the admin gate, by design — see the matcher in
  `src/proxy.ts`) suggested a real staff address.

**FORWARD RULE: on any page reachable without signing in — `/login`,
`/portal/login`, `/mcp/connect`, `/e/`, `/r/` — a placeholder, example or default
must be a SHAPE ("Your first name or work email"), never a real person, address or
company identifier.** Settings placeholders are fine: only the owner sees them.

## ✅ The sidebar overlap, finally caught (17 Aug 2026)

**It was real, and it was the gutter arriving one paint late.** Proof from the raw
server HTML: the rail ships at `w-[208px]` and is painted by CSS immediately, while
`--portal-sidebar` (the variable the gutter reads) was written by a **`useEffect`**
and the CSS fallback was **`0px`** — so every portal page began life with **80px of
itself underneath the rail**, and `main` simultaneously picked up the ADMIN gutter
(108px) because `html:not([data-portal-zoom])` was true until `PortalZoom`'s effect
ran too. Slow hydration made it last; **failed hydration made it permanent**, which
is what Kishan saw.

**I reproduced the permanent version by accident** — a few Fast Refresh cycles left
both markers stripped (the effects' cleanups remove them), and the page sat
overlapped exactly as reported. **Careful: that also means a measurement taken
mid-editing-session is not evidence about production.** Hard-reload first.

The fix, in three parts:
1. **Fallbacks are the rail's expanded width**, not a guess: `var(--portal-sidebar,
   208px)` and `var(--desk-sidebar, 208px)`. A fallback narrower than the rail IS
   the bug.
2. **The width is server-rendered** from a new rail cookie (`cos-portal-rail` /
   `cos-desk-rail`) as an inline custom property on the shell / on `main`, so the
   first paint is already correct in both states and no hydration is required. The
   sidebars' effects now write to **that element**, not `<html>` (an element's own
   custom property beats an inherited one — writing to `<html>` would do nothing),
   and they **never remove it on cleanup**.
3. **Portal pages opt out of the admin gutter with `body main:has([data-portal-shell])`**
   — a separate rule, so a browser without `:has()` drops only the override instead
   of failing shut and un-guttering the command centre.

**FORWARD RULE: layout geometry must not depend on an effect.** If CSS paints it
immediately, CSS (or the server) has to size it immediately.

**⚠️ Superseded — the earlier note below is what I believed before the above:**
report, which was never reproduced by measuring the sidebar: it was probably never
the sidebar, but a dropdown opening ~80px up and to the left, over the rail. That
is fixed now — **ask him whether the complaint has gone** before spending another
session hunting the rail.
