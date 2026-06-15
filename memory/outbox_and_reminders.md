---
name: outbox-and-reminders
description: "Reminder drafts, dedupe ledger, and sent-record behaviour"
metadata:
  node_type: memory
  type: project
---

# Outbox and Reminders

Source files:

- `src/lib/outbox-gen.ts` — live per-person task reminders (regenerated each load)
- `src/lib/outbox-history.ts`
- `src/lib/outbox-drafts.ts` — `listOutboxDrafts()` (persisted `status="Draft"` rows)
- `src/lib/outbox-links.ts` — channel deep-links + the one-off message builder
- `src/app/outbox/*` (incl. `drafts-list.tsx`)
- `src/app/outbox/actions.ts` — `recordSent`, `snoozePerson`, plus draft mutations `sendDraft` / `updateDraft` / `deleteDraft`

## Two flows

1. **Live task reminders** — `generateDrafts()` groups open tasks by assignee, regenerated each load (not persisted). The original Outbox behaviour.
2. **Persisted drafts** — rows in `outbox` with `status="Draft"` and a `source` (`task`/`todo`/`adhoc`/`person-pack`). Rendered in a **Drafts** section at the top of the page (`DraftsList`), each with edit / copy / **Open [channel]** / Mark sent / Discard. Current producers:
   - **To-do reminder** (`createTodoReminderDraft` in `src/app/todos/actions.ts`): from an assigned to-do it builds a friendly, channel-aware message (times in EAT) and writes a Draft.
   - **Person Pack** (`createPersonPackDraftAction` in `src/app/people/pack-actions.ts`): the pack builder shows channel-specific wording first, then saves a Draft with `source="person-pack:<person>:<purpose>:<sections>"`. It never sends automatically.

## Sending

**Email now dispatches server-side** (2026-06): `sendDraftEmail(id)` (`outbox/actions.ts`) sends EMAIL drafts through `src/lib/email.ts` (Gmail SMTP via App Password / Resend fallback — see `memory/project_outbound_comms` and `src/lib/settings.ts getEmailConfig`) and marks the row Sent; the DraftCard shows a primary **Send email** button.

**Signature/footer** (2026-06): SMTP sends bypass the Gmail web signature, so a configurable footer is appended centrally in `sendEmail()` (`src/lib/email.ts withSignature`) to BOTH text + html of every outgoing email (outbox messages and calendar invites). Sources (Settings → Email sending): `emailSignature` text (`v2.emailSignature`) AND/OR a branded `emailSignatureImagePath` image (`v2.emailSignatureImagePath`, uploaded to the documents bucket under `email-signature/`). The **image is embedded inline via CID** (`SIG_CID="cos-signature-image"`) — downloaded from storage at send time, attached as base64, referenced `<img src="cid:...">` — so it always renders (no expiring signed URLs). HTML gets a divider + image + text; text/plain gets the text only. `SIG_MARKER` prevents double-signing. When both text + image are blank it falls back to sender name + address. `getEmailConfig()` exposes `signature` + `signatureImagePath`. `EmailAttachment` now supports `encoding:"base64"` + `cid` (SMTP `cid`, Resend `content_id`). The outbox `htmlBody` wrapper is a 600px max-width, line-height 1.6 container. WhatsApp/SMS still use **channel deep-links** (`linkFor` → `wa.me` / `sms:` in `outbox-links.ts`) that open pre-filled for a manual tap-send (WhatsApp Cloud API is paid + heavy — deferred). `mailto:` remains as a manual fallback ("Open Email") when the provider isn't configured. Preferred channel is picked from the person's contact details (`pickChannel`).

## Draft Generation

`generateDrafts(channel)` loads open tasks, groups by assignee, and creates per-person reminder drafts.

Supported channel strings:

- `WHATSAPP`
- `EMAIL`
- `SMS`

WhatsApp/email drafts are longer; SMS drafts are terse.

## Contact Status

Drafts mark contact readiness:

- complete when the relevant channel contact exists;
- missing WhatsApp/email/phone when needed;
- unknown when the person cannot be found.

## Sending / Recording

`markSent` records a send; it does not actually dispatch a message.

It writes:

- a `reminders` row as the idempotency ledger;
- an `outbox` row as the human-readable sent record.

Dedupe key format:

`YYYY-MM-DD|channel|person|taskIds|daily`

The unique index on `reminders.dedupe_key` is the final duplicate-send guard.

## Outbox rebuild (2026-06) — automation hub + honest labels + layout

Owner decisions: (1) the Outbox should be the single place automation is visible; (2) honest labels rather than wiring real WhatsApp send for now.

Shipped:

- **Layout cleanup** (`outbox/page.tsx`): scope-warning shrunk from a 4-line amber box to a one-line note with the full explanation behind a `title` tooltip; removed the duplicate "N sent" from the header sub (the progress bar is the single source); added a **"Today's reminders — per-person task nudges you copy & send yourself"** section heading above the live list so the two halves (Drafts vs live reminders) are legible. `pending-list.tsx` toolbar fixed: the two competing `ml-auto` elements (density + search) are now one right-aligned controls group.
- **Honest labels** (`outbox-card.tsx`): the live task-reminders never actually dispatch (copy-to-clipboard only), so all user-facing "Sent" wording → **"done"** ("Copy & done", "Mark as done", badge "Done", footer "Marked done · {channel}"). Only the Drafts "Send email" button truly sends server-side.
- **Automation panel** (`automation-panel.tsx`, server component, native `<details>`): top of the Outbox. Reads `getAutomationSnapshot()` (`src/lib/outbox-automation.ts`) → config state (On·N / Paused / Off pill, send window, daily cap), each switched-on category with its mode ("Sends automatically"/"Prepares a draft") + last-run ("ran today"/"not yet today"/date), and **"Sent automatically · last 7 days"** = `outbox` rows where `message_type='AUTOMATION'` AND `status='Sent'`. Auto-opens only when there are recent sends. Links to `/settings#email-automation` (added `id`+`scroll-mt-24` anchor on that Settings section).
- **Automation-origin drafts labelled** (`drafts-list.tsx`): prepared automation drafts (already flow into `listOutboxDrafts()` as status="Draft") now show a `<Bot>` chip with their category label instead of being indistinguishable. No duplication — they stay in the Drafts list, just tagged.
- **Client-safe split**: `src/lib/outbox-automation-shared.ts` holds the pure `CATEGORY_LABELS` + `labelForSource` (imported by the client Drafts component); `outbox-automation.ts` re-exports them and adds the server-only snapshot reader.

Second pass (DONE + PUSHED, commit 00452bc): **Approve & send** label on automation-origin *email* drafts (`drafts-list.tsx`, only when `canEmail` — WhatsApp prepared drafts keep Open/Mark-done as that channel can't truly send yet); **sent-log timestamp bug fixed** — new `todaysSentRecords()` in `outbox-history.ts` returns today's real `outbox` rows by `sent_at` (drawer "Done today" no longer synthesises page-load time); **message-clip bug fixed** — `outbox-card.tsx` measures overflow (ref + scrollHeight) and shows a "Show full message"/"Show less" toggle instead of the old `max-h-64 overflow-y-auto` silent clip.

NOT yet done (next candidates): real WhatsApp send (scaffolded in `lib/whatsapp.ts` — needs owner's Meta account + approved templates); bulk actions ("send all email drafts", "copy top N"); schedule-a-draft (send later in the 08–18 window); per-person "last chased N days ago" inline so you don't re-nudge; an "Approve & send" that also works for WhatsApp once real send lands.

## Modern redesign (2026-06) — surface-kit adoption

Owner: "old, bulky, big and ugly" → modernise to match the rest of the app. Outbox was one of the last pages on the old `PageHeader` + `rounded-2xl` ad-hoc cards; 12 other pages already use `surface-kit` (Hero/Panel/SectionLabel). Now aligned:

- **Header → `Hero`** (aurora-lit) with a **metric rail** in the body: *to chase · done today · automation on/paused/off* (big tabular numbers, tone-coloured) + the progress bar folded in (killed the standalone strip + duplicate count). Sent-log moved to Hero `actions`.
- **`Reveal`** entrance motion staggered across Hero → Automation → Drafts → reminders (reduced-motion safe).
- **`SectionLabel`** for "Drafts" / "Today's reminders" instead of hand-rolled uppercase spans.
- **One unified card** (`outbox-card.tsx`): removed the compact/expanded **density toggle** entirely (owner chose "one clean card"); a single `rounded-2xl ring-1 ring-border border-l-2` card with a single urgency cue (left accent edge, no more stripe+dot), avatar, tap-to-expand chevron, message in an inner `rounded-xl` panel, one tidy action row. `PendingList` now renders one stacked list (no grid/density branches); `OutboxCard` keeps `compact`/`sentChannels` props for caller-compat but ignores them.
- **Drafts card** restyled to the same language (`rounded-2xl ring-1 ring-border border-l-2 border-l-accent`).
- **Automation panel** container → `rounded-3xl ring-1 ring-border`.
- Tokenised colours: `text-danger`/`text-warn`/`border-l-danger` etc. instead of raw `red-500`/`amber-500`.

All behaviour unchanged (automation hub, honest labels, send/copy, bug fixes intact). Verified desktop + mobile, no console errors. **REMINDER: tell owner about the deferred items in [[outbox-remaining-work]] now that the redesign is done.**

## Split-view workspace (2026-06) — email-client layout

Owner: drafts took too much vertical space (each rendered full message body, always open) → had to scroll far to reach reminders, and it only grows. Owner approved (via visual mockup) an **email-client split view**, default **All, urgency-sorted**.

- New `src/app/outbox/outbox-workspace.tsx` (client): **left = one compact row per item** (drafts + reminders + sent), **right = selected item's full message + actions**. Segmented filter **All / Reminders / Drafts / Sent** with live counts; company filter + search; urgency dot (red overdue / amber due-soon); type chip + 🤖 mark for automation-origin drafts. Sorted by urgency rank then name. Mobile: list only → tap opens a full-screen detail overlay with Back.
- **Reuses the existing cards as the detail pane** (no logic rewrite): `OutboxCard` gained `detail` (always-expanded, no outer chrome) + `onResolved` (advance selection after done/skip); `DraftCard` exported + gained `detail`. **Critical fix: each detail card is `key`'d by item key** so React remounts on selection change — otherwise the stateful message body goes stale when you switch items (header updated, message didn't).
- `page.tsx` now renders Hero → AutomationPanel → `<OutboxWorkspace>` → Snoozed. Retired from the page: `DraftsList` and `PendingList` (PendingList file kept only for its `PendingItem` type, still imported by page; the component is now dead — safe to delete later).
- Verified desktop + mobile, all three item types, no console errors. (preview_screenshot tool times out on this tall page all session — verified via DOM instead.)

## Reminders Phase 1 — last-chased + bulk send + auto-send cooldown (2026-06-15)

Owner brief: "work on reminders", **auto-send the safe ones / prepare the rest**, WhatsApp **stays tap-to-send**, and sweep leftover "COS" naming. Built (tsc clean; verified live on `/outbox`, no console errors):

- **Last-chased memory.** `lastChasedByName()` in `outbox-history.ts` = most recent **Sent** `outbox` row per lowercased recipient name (any channel). Surfaced in `outbox-workspace.tsx`: a "chased Nd ago" hint on each reminder row + a "Last chased Nd ago · {channel}" line atop the reminder detail. `chasedAgo()` formatter lives client-side (can't import the server `outbox-history` fn into the client component — `LastChased` is `import type` only).
- **Bulk send.** `sendAllEmailDrafts()` in `outbox/actions.ts` loops `sendDraftEmail` over every EMAIL Draft with a valid address; stops on not-configured. Toolbar button **"Send all email (N)"** in the workspace (shows only when emailDraftCount>0; degrades exactly like the per-draft Send-email button).
- **Auto-send cooldown (the "safe auto-send" the owner chose).** New `cooldownDays` on `AutomationConfig` (**default 2**). The `overdue` category — already the scheduled safe-nudge engine via `/api/cron/email` — now skips anyone chased within N days in **both** `auto` mode (`email-automation.ts`) and `prepare` mode (`createOverdueReminderDrafts(rows, { cooldownDays })`). Auto-sends now also write a **Sent `outbox` row** (`source: automation-overdue`) so they show in the sent log + feed last-chased + the next cooldown (previously auto-sends were unlogged — a real gap).
- **Brand sweep.** Visible "COS" → **"Oracle Consultancy"** (Google-Calendar settings desc, test-email subject, automation-suggestion/signal/person-pack copy, `.ics` PRODID); the **"COS Assistant"** actor name → **"ORI"** (task-detail route + portal task/activity pages). Pure code comments left as-is. Rule: system→Oracle Consultancy, assistant→ORI.

`cooldownDays` has no Settings control yet (default 2 is sensible). Still NOT done (the agreed later phases): morning digest (#3), ad-hoc "remind me" (#4), unified Reminders view (#5). WhatsApp real send stays deferred by owner choice.

## Reminders Phases 3–5 — morning digest + ad-hoc "remind me" + Home view (2026-06-15)

Owner chose the full scope: **owner AND staff**, **timed push**, unified view **on Home** (not a new page). Built, tsc clean, verified on `/outbox` + `/` (admin Home card: add is optimistic + persists, delete commits) + `/settings` (toggle renders). Portal twin built + tsc-clean (not live-tested — needs a staff login).

- **New primitive — `personal_reminders` table** (migration `0079`, hand-written `CREATE TABLE IF NOT EXISTS` + journal entry idx 79, **no snapshot** — same convention the owner used for 0078; `migrate()` only needs the .sql + journal). `person_id` NULL = owner, else staff. Cols: title/notes/remind_at/done/done_at/**pushed**/created_at/created_by. Also added to `schema.ts`. `src/lib/personal-reminders.ts` = the data layer (list/create/setDone/delete/reminderOwner/dueRemindersForPush/markPushed/dueTodayCount).
- **Timed push** — `/api/cron/reminders` (every 15 min in `vercel.json`) fires due reminders via the **per-person** `sendToRecipient` (`"admin"` for owner, `"person:<id>"` for staff — push.ts already supports this). Marks `pushed=true` regardless of device reach (no re-fire loop); the item still shows in the list + digest. Needs VAPID env (already used by `/api/cron/notify`) + the person's device subscription in `push_subscriptions`.
- **Unified "Your reminders" card on Home** — `src/components/reminders-card.tsx` (shared client component): quick-add (title + `datetime-local`) + open list with mark-done/delete, **optimistic local state** that resyncs from props (Home is heavy → `router.refresh()` lags, so don't make the user wait). Admin Home (`_hub/cos-home.tsx`) passes owner actions (`src/app/reminders/actions.ts`); portal Home (`portal/(app)/page.tsx`) passes staff actions (`portalCreateReminder/portalToggleReminderDone/portalDeleteReminder` in `portal/actions.ts`, each scoped to the signed-in person via `reminderOwner`). createAction returns the new row so the card appends without a refetch.
- **Morning digest** — new `morningDigest` email-automation category (default off; Settings toggle "Daily morning digest (to you)", NATURAL mode `auto`). `buildMorningDigest()` composes today's **events + your reminders + overdue + due-today tasks + renewals** and sends to the owner (`sendOrDraftToOwner`, source `automation-morning`); returns null when there's nothing to say (no empty email). Runs daily via the existing `/api/cron/email` (06:00 UTC = 09:00 EAT). **Staff "morning digest" = the in-app portal Home card** (not a per-staff email — avoids mass-mailing).

Owner to flip on: Settings → Email automation → "Daily morning digest". Timed push needs VAPID set + each device subscribed (owner already has 1 push sub; staff subscribe via the portal notification opt-in). Nothing pushed to git. Minor known nit: deleting a reminder can flash back for ~1s during the heavy-page refresh race, then settles (confirmed gone on reload).

## MERGE — reminders folded into to-dos (2026-06-16, supersedes the personal_reminders design above)

Owner: "merge todo and reminders" (the reuse-don't-duplicate principle). **A reminder is now just a to-do with a `remind_at` time + a ping.** The day-old `personal_reminders` table was **dropped** (migration `0080`), and `todos` gained `remind_at` + `pushed` (idempotent ALTER + journal idx 80). `src/lib/personal-reminders.ts`, `src/app/reminders/actions.ts`, and `src/components/reminders-card.tsx` were **deleted**.

- **Model.** A `todos` row with `remind_at` set = a reminder (fires the timed push + shows in the morning digest). Owner to-dos: `kind` NULL. A staff member's own personal to-dos: **`kind = "self"`** + `person_id = them` — this keeps staff personal items OUT of the admin Workbook (`listTodos()` already filters `kind IS NULL`). Journey steps stay `kind` onboarding/offboarding.
- **Home = the single to-do surface** (owner's choice). `src/components/todo-card.tsx` (client) replaces the reminders card on admin Home (`listOwnerTodos()` + `createOwnerTodoAction`/`toggleOwnerTodoDoneAction`/`deleteOwnerTodoAction` in `todos/actions.ts`) and on portal Home (`listSelfTodos(me.id)` + `portalCreateTodo`/`portalToggleTodoDone`/`portalDeleteTodo`, ownership-guarded via `todoOwner`). Quick-add = title + **optional** datetime (set a time → it pings). Workbook to-do list still works (same data, richer editor).
- **Data/cron/digest** all read todos now: `src/lib/todo-reminders.ts` (`listOwnerTodos`/`listSelfTodos`/`dueTodoRemindersForPush`/`markTodosPushed`/`ownerReminderTodosDueBy`/`todoOwner`). `/api/cron/reminders` pushes due reminder-todos (kind `self` → `person:<id>`, else → `admin`). Morning digest's "Your reminders" line = `ownerReminderTodosDueBy(end)`.
- **Two real bugs caught in preview + fixed in `todo-card.tsx`** (tsc didn't catch either): (1) a **value import** of `sortTodoCard` from the server-only `todo-reminders` lib pulled Supabase into the client bundle → `SUPABASE_SERVICE_ROLE_KEY is not set` on Home — fixed by keeping the sort client-local and importing only the **type**. **Rule: client components may only `import type` from libs that import `@/db/supabase`.** (2) `router.refresh()` ran inside `useTransition`, so `pending` (which disabled every button) stayed true for the whole slow Home re-render → the next click no-op'd — fixed by a `busy` flag that spans only the awaited action, with `router.refresh()` after it (background). The card uses an **add/remove-by-id overlay** over the server list so optimistic changes survive the slow refresh with no flash-back. Verified: add shows once, delete enabled + commits, 0 flash-backs, 0 leftover rows.

## Current Product Direction

The UI direction is a single "Messages" concept. The schema still has WhatsApp/email/SMS channels because real provider integration has not been chosen yet.

Do not add real dispatch casually. Phase 5c should choose one provider first, then wire send success/failure around `markSent`.

## Draft message format (updated)

`src/lib/outbox-gen.ts` `buildReminder` line format (owner request): **no task code, no status words, keep priority**, and now includes the task **Description** (`comments`) and **Latest update** (each on its own indented line, one-line clamped to 120 chars via `oneLine()`). Status wording is replaced by an "⚠️ " marker shown only when the task is actually overdue. Header counts open items + overdue. `taskMeta` = `due <date> · <priority>`. `buildSmsMessage` is ultra-short (no code/description, one line).

## Director Brief (planned)

**Admin & HR updates (operator notes)** (2026-06): the owner can hand-write narrative notes that aren't tasks — `brief_notes` table (`body`/`company_id` nullable/`note_date`/`created_at`/`created_by`, migration `0054`). `src/lib/brief-notes.ts` `listBriefNotes(range, companyId, names)` returns notes whose `note_date` falls in the brief window (same logic as Delivered), honouring the company filter (company-tagged notes show when that company OR portfolio selected; portfolio notes always show). Surfaced in three places: screen section `src/components/brief-notes-section.tsx` (add/delete inline, sits between Delivered and Recommended director actions), the PDF report (section "2b" between Delivered table and Open work by company), and `briefShareText` ("*Admin & HR updates*" block after Delivered). Server actions `createBriefNoteAction`/`updateBriefNoteAction`/`deleteBriefNoteAction` in `src/app/brief/actions.ts`. `BriefData.notes: BriefNote[]`. Notes are inline-editable (body + company) via the pencil icon. A **hide-company toggle** ("Company shown/hidden") persists to `localStorage` key `v2.briefNotesHideCompany` and toggles class `hide-brief-note-company` on `<html>`; CSS `html.hide-brief-note-company .brief-note-company { display:none }` hides the Company column on BOTH the screen list and the PDF table (the PDF Company `<th>`/`<td>` carry the `brief-note-company` class; `window.print()` prints the live DOM so the class applies). Order across screen/PDF/share text: Admin & HR updates BEFORE Delivered; the PDF Admin block is a plain fragment (not `.report-section`) so it shares the page with Delivered.

New feature: one-tap "share everything incl. closed tasks with the director", beautiful + glanceable. Decisions: default window = **this month**; format = **both** (in-app glanceable page + WhatsApp/Email text now, polished PDF after). Phases: 1 (DONE) outbox draft tweak above · 2 in-app Director Brief page (portfolio, incl. completed/closed this month: top-line stats, per-company strip, "Delivered" closed-tasks section, watch-list) · 3 (DONE) WhatsApp/Email/Copy share + Director Brief promoted to a primary nav tab · 4 (DONE) PDF via print: "PDF" button (window.print()) + @media print stylesheet in globals.css (remaps dark tokens to light, hides .fixed/.print-hidden chrome, strips glass/shadow) · 5 (optional) period filter / per-company / scheduled auto-send. Reuse `getAllTasks()` + `computeCompanyKpis`.
