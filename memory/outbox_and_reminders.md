---
name: outbox-and-reminders
description: "Reminder drafts, dedupe ledger, and sent-record behaviour"
metadata:
  node_type: memory
  type: project
---

# Outbox and Reminders

> **Restructure (2026-06-16) — see "Outbox + email reorg" section at the bottom.** The flat `src/lib/outbox-*.ts` + `email.ts` + `email-automation.ts` files were grouped into `src/lib/outbox/`, `src/lib/email/` and a new registry-driven `src/lib/automation/`. Paths below are pre-reorg; the new map is in that section.

Source files (post-reorg paths):

- `src/lib/outbox/gen.ts` — live per-person task reminders (regenerated each load)
- `src/lib/outbox/history.ts`
- `src/lib/outbox/drafts.ts` — `listOutboxDrafts()` (persisted `status="Draft"` rows)
- `src/lib/outbox/links.ts` — channel deep-links + the one-off message builder
- `src/lib/outbox/snapshot.ts` — read-only automation snapshot for the Outbox panel (was `outbox-automation.ts`)
- `src/lib/email/send.ts` — real email send + signature (was `email.ts`)
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

## Outbox + email reorg + automation registry (2026-06-16) — NOT PUSHED

Owner brief: "improve the outbox and emails — first structure it" → chose **tidy email automation + full code reorg**. The disorder fixed: automation categories were defined in 4 drifting places (the type listed 10, `runDueAutomations` ran 7 hand-inlined, `CATEGORY_LABELS` had its own list, Settings showed only 5 — and `boardPack` was implemented but had no Settings toggle, while `cooldownDays`/`dailyCap`/window/`briefDay` had no controls at all).

**New file map** (all `@/` imports updated app-wide; `git mv` preserved history; tsc clean; 42 tests pass; `/settings`+`/outbox` 200, no console errors):

- `src/lib/email/send.ts` ← `email.ts` (sendEmail, signature, EmailAttachment).
- `src/lib/outbox/{gen,drafts,history,links}.ts` ← the old `outbox-*.ts`.
- `src/lib/outbox/snapshot.ts` ← `outbox-automation.ts` (the panel snapshot reader; now imports from `@/lib/automation`).
- **`src/lib/automation/`** = the registry-driven engine (replaces `email-automation.ts` + `outbox-automation-shared.ts`):
  - `types.ts` — `EmailCategory` (trimmed to the **6 implemented**: overdue, renewals, directorBrief, morningDigest, lifecycle, boardPack — dead `birthdays`/`statutory`/`meetingFollowup`/`custom` **removed**), `RuleMode`, `AutomationConfig`, `AutomationRunSummary`. **Client-safe (no server imports).**
  - `meta.ts` — **single source of truth** for presentation: ordered `CATEGORY_META` ({key,label,onDescription,naturalMode,source,schedule}) → derives `CATEGORY_LABELS`, `NATURAL_MODE`, `labelForSource`. **Client-safe.** Replaced `outbox-automation-shared.ts`.
  - `config.ts` — `getAutomationConfig`/`saveAutomationConfig`/`DEFAULTS`; rebuilds `categories` strictly from known keys (drops stale ones).
  - `runtime.ts` — EAT clock, `withinSendWindow`, `alreadyRanToday`/`markRanToday`, and `makeContext()` → a `RunContext` with **memoised** `tasks()`/`brief()` (kills the old double `getBrief` call) + `sendToOwner`/`sendToPerson`. Defines `CategoryDef`.
  - `categories/{overdue,renewals,director-brief,morning-digest,lifecycle,board-pack}.ts` — one `CategoryDef` each (`scheduledToday()` + `run(ctx,mode)`). Logic moved **verbatim** (overdue cooldown+cap, board-pack PDF attach, morning digest builder).
  - `registry.ts` — the ordered `REGISTRY` array.
  - `engine.ts` — `runDueAutomations()` = a loop over `REGISTRY` applying pause→window→schedule→dedupe; per-category try/catch (a throwing category no longer marks ran, so it retries).
  - `index.ts` — **server-only** public surface (`runDueAutomations`, config, types, re-exports meta). **Client components import `@/lib/automation/meta` directly**, never the index.

**Settings tidy** (`settings/page.tsx` + `actions.ts`): the category toggle list now **derives from `CATEGORY_META`** (so `boardPack` now appears + is switchable; one label source). New **"How it behaves"** form (`setAutomationTuning` action) exposes send-window from/to, daily cap, cooldown days, and the Director-Brief weekday. `setEmailAutomation` now reads `NATURAL_MODE` from meta instead of an inline map.

**Adding a category now = 3 edits**: a `CategoryDef` file, a `CATEGORY_META` entry, a key in `EmailCategory` — then registry/engine/Settings/snapshot all pick it up. **Behaviour unchanged**; this was structure only. Owner to review before push. Channels still: email truly sends, WhatsApp/SMS deep-link (Twilio WhatsApp send still half-wired + uncommitted in `lib/whatsapp.ts` — left untouched by this reorg).

## Branded HTML email template (2026-06-16) — automations now send beautiful HTML

Owner brief: "design the messages that go out via email — modern, beautiful, easy to read." Owner approved (via rendered mockup) a clean, whitespace-led design: **deep teal `#0f6e56` accent, typed `ORACLE CONSULTANCY` wordmark** (no logo image), restrained minimal look.

- **`src/lib/email/layout.ts`** = the one shared template. `renderEmail(doc: EmailDoc, brand?)` → **email-safe HTML** (tables + inline styles, 600px card on #f4f5f7 canvas; Gmail/Outlook/Apple-safe). Pure + client-safe (no server imports) → unit-tested (`layout.test.ts`, 3 tests). Block kinds: `stats` (metric tiles, `danger` tints red), `section` (label + left/right rows), `items` (priority pill + title + meta), `list` (bullets), `text`. Plus `cta` button, hidden `preheader`, header (wordmark + date + title/subtitle), footer (sign-off + quiet "why you got this · manage in Settings" note). **Change the look in this ONE file → all emails update.**
- **Signature interplay**: the template footer starts with `SIG_MARKER` (`<!--cos-signature-->`, MUST match `email/send.ts`), so `withSignature` returns the html unchanged (no double-sign). Sign-off text comes from `getEmailConfig().signature` (falls back to `fromName`) passed in as `brand.signature`. **The branded signature IMAGE is intentionally NOT shown in automation HTML** (text sign-off only — clean digests); plain-text fallback also unsigned. `send.ts` untouched.
- **Wiring**: `RunContext.sendToOwner`/`sendToPerson` now take `opts.doc?` — when present they render `html` via `renderEmail` (with the signature) and send it alongside the existing plain `text` (kept as the fallback). All **6 categories** build a `doc`: overdue (staff list + "Open the tracker"), renewals (items w/ Expired=danger/Expiring=warn pills), directorBrief (`briefEmailDoc(b)` in `director-brief.ts` — stats + by-company + needs-attention pills), morningDigest (list block per section; `buildMorningDigest` now returns `{subject,text,doc}`), lifecycle (bullets), boardPack (text + PDF still attached). Settings "Send Director Brief now" also renders the HTML so the test matches the real send.
- Per-automation **copy** lives in each `categories/*.ts` doc (titles/subtitles/footerNote/CTA) + the brief doc in `director-brief.ts`. Staff-facing reminder body (the rich grouped one for PREPARE drafts) still in `outbox/gen.ts`.
- **Not done** (candidates): branded signature image in automation HTML (needs a `send.ts` tweak to attach the CID when SIG_MARKER present); upgrading the **outbox DRAFT** send (`sendDraftEmail` still uses the old grey `htmlBody` — drafts are person/client messages, left for a separate pass); per-company branding on staff emails; **WhatsApp message design** (owner's stated next step). tsc clean; 45 tests pass; `/settings`+`/outbox` 200, no errors. **NOT pushed yet.**

## Office sign-offs + staff task-reminder email + ORI persona sweep (2026-06-16)

Owner decisions: footer signs off as an **office** (not a job title — "Chief of Staff" dropped system-wide); **task reminders go to anyone with open tasks, Mon/Wed/Fri**; AI persona renamed to **ORI**.

- **Office footer** (`email/layout.ts`): `EmailDoc.office?: EmailOffice` (`director`|`admin`|`compliance`|`hr`) → footer renders `{OFFICE_LABELS[office]}` + `Oracle Consultancy Limited` (two lines), default `admin`. `OFFICE_LABELS` = Director's Office / Admin's Office / Admin Compliance Office / Admin HR Office. Removed the old `brand.signature` path — template emails no longer pull the free-text `emailSignature` (still used by non-template sends via `withSignature`). Per-automation office set: taskReminders/overdue/directorBrief/morningDigest/boardPack = `admin`, renewals = `compliance`, lifecycle = `hr`. runtime `sendToOwner`/`sendToPerson` + `sendDirectorBriefNow` now call `renderEmail(doc)` (no signature arg).
- **New automation `taskReminders`** (`categories/task-reminders.ts`, registry FIRST — before `overdue`): emails each person their OPEN tasks (overdue flagged), grouped by company, on **Mon/Wed/Fri** (`eatWeekday ∈ {1,3,5}`). AUTO sends via `buildTaskReminderDoc` (new, in `outbox/gen.ts`: 2 stat tiles open/overdue, one `items` block per company, Overdue pill=danger else priority pill, due-date meta, "Open the tracker" CTA, office=admin); PREPARE leaves an Outbox draft per person. Respects cooldown + dailyCap; logs Sent rows `message_type='AUTOMATION'` source `automation-taskreminders` → shows in the Outbox automation panel + feeds last-chased. **Running before `overdue` means the shared cooldown stops double-chasing the same day** (cooldown default 2; at 0 both could send).
- **`overdue` repurposed as a "safety net"** (label + onDescription only): a daily catch for anyone still overdue, complementing the Mon/Wed/Fri reminder. Logic unchanged.
- **ORI persona sweep**: "Chief of Staff" removed from all 9 AI system prompts (`api/{action,ask,company-summary,digest-narrative,draft-email,polish}/route.ts`, `meeting/actions.ts` ×2, `voice/actions.ts`) → "You are ORI, the assistant for…" / "the Oracle Consultancy …". Also `digest.ts` header sub "Chief of Staff briefing" → "{BRAND} briefing". `grep -i "chief of staff" src` = clean (only the layout.test assertion that it's absent).

Settings auto-shows the new toggle (derives from `CATEGORY_META`). tsc clean; 46 tests pass; `/settings` 200 (Task-reminders + Overdue-safety-net toggles render); no errors. **NOT pushed.** Still open: branded signature image in template HTML; pretty HTML for Outbox draft sends (`sendDraftEmail` still uses old grey `htmlBody`); WhatsApp message design.

## Manual "Send a reminder" engine — Phase 1 admin Outbox (2026-06-16)

Owner ask: the admin Outbox copy-&-done cards should also offer a real "Send email" in the new design; later, directors/managers/Admin (HR→Admin rename) get the same in the portal with an optional note; WhatsApp waits for Twilio. Decisions: roles = Director/Manager/Admin all see everyone; WhatsApp = wait for Twilio; send flow = optional note then send; **manager sign-off = manager's own name + "Manager's Office"**.

- **Template additions** (`email/layout.ts`): `EmailOffice` += `manager` ("Manager's Office"); `EmailDoc.signoffName?` (name shown bold above the office, office drops to muted sub-line) + `EmailDoc.note?` (teal-soft callout above the content, attributed "— {signoffName}").
- **Shared engine** `src/lib/reminders.ts` → `sendTaskReminderEmail({ personId, note?, sender:{office,name?,sourceTag?} })`: loads person + their open tasks, builds `buildTaskReminderDoc(name, tasks, {office,signoffName,note})`, sends real email, logs a Sent `outbox` row (message_type "TASK REMINDER") → shows in sent log + feeds cooldown. Reasons: no-email/no-tasks/not-configured/not-found. **This is the one brain admin + portal both call.**
- `buildTaskReminderDoc` now takes `opts?: {office,signoffName,note}`.
- **Admin Outbox** (`outbox/actions.ts` `sendReminderEmail(personId, note?)` → engine with office "admin"; wired into `outbox-card.tsx`): expanded card gained "Add a personal note" toggle + a primary **Send email** button (when the person has an email); Copy-&-done demoted to secondary. Verified /outbox 200 with all three actions in the DOM; tsc clean; 46 tests pass. **NOT pushed.**
- **NEXT — Phase 2 (portal):** Director/Manager/Admin team view (all staff + tasks) calling the same engine with sender office=their role + name; includes the portal **hr→admin role rename** (portal-auth, Settings picker, `portal-hr` stamps). **Phase 3 = WhatsApp** once Twilio live (owner).

## Phase 2 — portal Team view + reminders + HR→Admin relabel (2026-06-16)

- **HR → Admin (label only):** the visible "HR / Admin" strings → "Admin" (portal `layout.tsx` "Admin portal", profile badge "Admin access", Settings role-picker options). **Internal role value stays `"hr"`** (renaming the enum across ~25 files + migrating `people.portal_role` data was needless risk for a label change — so `hr` is still the stored value; users only ever see "Admin").
- **Portal reminder action** `portalSendReminderEmail(personId, note?)` (`portal/actions.ts`): Director/Manager/Admin(hr) only; honours the `director.outreachPaused` kill switch; office by role (director→`director`, manager→`manager`, hr→`admin`), `signoffName = me.name`, sourceTag `portal-{dir|mgr|admin}:{name}`; calls the shared `sendTaskReminderEmail`; logs `portal.reminder.email` event + a Sent row visible in the **admin** Outbox sent log.
- **`/portal/team`** (new route, `team/page.tsx` + `team/remind-button.tsx`): guards staff out; lists **every** active person with open tasks (all three management roles see everyone, per owner), overdue-first, top-5 tasks + counts; each row has a `RemindButton` (client) = "Email reminder" → optional note → send. Linked from the **portal home** (manager/admin card) and the **director board** ("Team reminders" chip in Take action). **Pill nav left untouched** (mobile-crowding risk) — reachable via those links.
- Verified: tsc clean; 46 tests; `/portal/team` compiles + serves 200, no errors. **Send path reuses the proven engine but NOT live-tested with a real portal login** (needs a director/manager account on the deployed site). WhatsApp deferred to Phase 3 (Twilio go-live). **NOT pushed.**

## Document request + per-document renewal notice (2026-06-16)

Owner: of the 4 (permit/doc renewal, doc request, directors brief, morning digest), do these now. Decisions: renewal = digest to owner PLUS a per-document "send renewal notice" (you decide per doc); doc request = email offers BOTH portal upload AND reply-with-files.

- **`src/lib/doc-requests.ts`** (reuses `renderEmail` + `sendEmail`, logs Sent rows):
  - `sendDocumentRequestEmail({personId, sender})` — loads the person's `status="missing"` person_requirements, emails the branded "Documents needed" list (items w/ "Needed" muted pill; portal CTA + "or reply with files" text; office=admin), then **flips those rows to "requested"** + logs an outbox Sent row (message_type "DOCUMENT REQUEST"). Reasons: no-email/no-items/not-configured.
  - `sendDocumentRenewalNotice({documentId, sender})` — resolves recipient (document's `person_id` → that person's email, else `company_id` → `companies.email`), emails the branded renewal notice (Expired=danger/Expiring=warn pill, expiry date, company; office=compliance "Admin Compliance Office"); logs "RENEWAL NOTICE" Sent row. Reason no-recipient when neither has an email.
- **Triggers:** person checklist (`requirements-checklist.tsx`) "Needs action" header gained **"Request by email"** (when `missingMandatory>0`) → `requestDocumentsByEmail(personId)` (`people/requirement-actions.ts`); documents **`needs-attention-panel.tsx`** gained **"Send notice"** beside the existing "Chase" → `sendDocumentRenewalNoticeAction(id)` (`documents/actions.ts`, office=compliance). The old "Chase" (drafts to Outbox) stays.
- Both designs rendered + owner-approved (full-bleed template). tsc clean; 46 tests; pages compile (couldn't click-test the gated UI — preview lost its admin session). **NOT pushed.** **STILL TO DO from the 4:** refine the **weekly directors brief** + **daily morning digest** emails (they already render through the polished template; content/look pass only).

## Director brief + morning digest email refinement (2026-06-16)

- **`briefEmailDoc`** (`director-brief.ts`) enriched from 3 sections to the FULL brief, matching `briefShareText`: stats → By company → **Admin & HR updates** (notes) → **Delivered this month** → Needs attention → **Recommended director actions** → **Compliance watch** (company % + missing/expired/expiring) → **Statutory deadlines** → **People** (headcount/joiners/on-leave, leave to approve, below-full, leave liability TZS). Each section guarded by presence. The Settings "Send Director Brief now" + the weekly automation both use this.
- **Morning digest** (`categories/morning-digest.ts`) gained a 3-tile glance row at the top (events · due today · overdue[danger]) above the existing per-section lists.
- tsc clean; 46 tests. Enriched brief rendered + shown. **All 4 of the owner's batch done** (permit/doc renewal, doc request, directors brief, morning digest). Couldn't render the *real* brief via tsx (director-brief pulls `server-only`) — owner can self-demo via Settings → Send Director Brief now. **NOT pushed yet** at time of writing this line.

## Sender identity per office + reply-to + task subject (2026-06-16)

Owner: admin@oracle.co.tz is the Admin mailbox; emails should show the SENDER'S OFFICE as the from-name. Decided (all staff emails are @oracle.co.tz): ship office display-names + reply-to NOW; true send-as-their-address deferred (needs domain verification).

- **`senderName(office)`** in `email/layout.ts`: director→"OC Director's Office", manager→"OC Manager's Office", everything else (admin/compliance/hr/automations)→"OC Admin's Office".
- **`SendEmailInput.fromName?`** (`email/send.ts`): overrides the from DISPLAY name only; the from ADDRESS stays `cfg.fromAddress` (admin@oracle.co.tz) — `from: \`${fromName} <${fromAddress}>\``, applied in both SMTP + Resend paths. **True send-as a director's own address needs the oracle.co.tz domain verified (Resend) — DEFERRED owner setup.**
- Wired `fromName = senderName(office)` into: automations (`runtime.ts` sendToOwner/sendToPerson, from the doc's office), manual + portal reminders (`reminders.ts`), doc request + renewal notice (`doc-requests.ts`), Settings "Send Director Brief now". So portal director/manager sends now read "OC Director's/Manager's Office"; everything else "OC Admin's Office".
- **Reply-To**: `ReminderSender.replyTo`; `portalSendReminderEmail` passes `me.email` → a staff reply reaches the director/manager who sent it (not admin). `sendEmail` already threaded replyTo to SMTP + Resend.
- **Subject**: staff task reminders (manual `reminders.ts` + `task-reminders` automation) → **"Your Outstanding Tasks"** (was "Your tasks"). Overdue safety-net keeps "Your overdue tasks". Other subjects' formal/corporate polish = LATER (owner deferred).
- Verified by a manager-style demo to ishivamparmar: From "OC Manager's Office <admin@oracle.co.tz>", Reply-To priya.shah@oracle.co.tz, subject "Your Outstanding Tasks". tsc clean; 46 tests.

## WhatsApp (non-provider) — gate fix + short envelope + branded landing (2026-06-18) — NOT PUSHED

Resuming the **manual wa.me** WhatsApp lane (Twilio/Meta still shelved). The "image header + link + format" pieces were built earlier (commits d579300 → b844666 → 6534a33: `/api/wa-card` Aurora summary image, `/r/[p]/[t]` reminder link with OG card, `buildWhatsAppManualMessage`) but had a **silent show-stopper bug**.

- **THE BUG (found by "verify the preview renders"):** `/r/[p]/[t]` was **behind the admin gate**. The proxy matcher (`src/proxy.ts`) excluded `api/wa-card`/`api/og-banner` (the image) but NOT the `/r/` page that references it, so `/r/...` matched the gate exactly like `/task/...`. Consequence: WhatsApp's crawler (no `cos_admin` cookie) fetching `/r/...` got **307 → /login** and read the generic banner — the per-person card NEVER rendered — and a human tapping the link landed on the **admin login**, not the portal. Confirmed with a regex test + a cookie-less curl (was 307; now 200). **The whole approach never worked end-to-end before this.**
  - **Fix:** added `r/` to the proxy matcher exclusion list (it carries its own HMAC gate via `verifyWaCardToken`, same model as `api/wa-card`). Verified `/people` still 307→/login (gate otherwise intact).
  - **Chrome:** `/r/` added to `HideOnPortal` so the public landing shows NO admin nav pill / drawers / capture wizard (same posture as `/portal`).
- **Branded landing page** (`src/app/r/[p]/[t]/page.tsx` rewritten; `redirect.tsx` deleted): was a redirect-flash ("Opening your staff portal…" → `window.location.replace`). Now a **real Aurora page** — dark glass card matching `/api/wa-card`: logo + "Oracle Consultancy · Staff portal" + Live pill, "Hi {first} — here's where things stand", two stat tiles (open / overdue, red when overdue), TOP OVERDUE list (top 4 + "N days late"), big **"Open your tasks →"** CTA → `/portal`. `export const dynamic="force-dynamic"` (live per-person counts). `generateMetadata` (the OG preview) kept; bad/invalid sig → generic "Open your staff portal" card. So the link is useful **even when WhatsApp doesn't render the preview**.
- **Short "envelope" message** (`buildWhatsAppManualMessage` in `outbox/gen.ts`): was a per-company task list capped at 10 (+ "…and N more"). Now 3 lines — `Hi {first}, a quick reminder — you have N open tasks, M overdue.` / nudge / signed link last. **No markdown** (asterisks show literally in the wa.me compose box pre-send), **no task list** (so the wa.me URL never grows with task count). The **card carries the detail**. The rich `buildWhatsAppMessage` (markdown + status dots) is untouched — it stays for the Twilio path + automation-suggestions where you can attach the real image and URL length is a non-issue.
- **Verified (dev server, mobile):** `/r/4/<sig>` (Vishal Pragji, 10 open/7 overdue) → 200, new landing renders correctly, og:image = absolute `/api/wa-card?p=4&t=…`, wa-card image 200 PNG, console clean. tsc clean; gen tests 5/5.
- **OWNER OPS (for the deployed preview to work):** `appBaseUrl()` must resolve to the public host so the OG image/link are reachable by WhatsApp's crawler — set **`NEXT_PUBLIC_APP_URL`** in Vercel (see [[project_app_url]]). Locally it's `localhost:3000` (fine for dev only). **Real-WhatsApp render is the owner's device test** against the deployed site (paste a `/r/...` link in a chat; WhatsApp caches previews per-URL, but the link is per-person-unique so that's self-busting — only a card *redesign* would need a fresh URL to bust the cache).
- **NOT pushed** — owner reviews first.

## WhatsApp landing — light Aurora redesign + announcements + live refresh (2026-06-18) — NOT PUSHED

Owner loved the landing page; asked to (1) make it **white/light Aurora** (both the landing page AND the preview image), (2) embed **announcements that target the person** (from Administrator / Directors / Managers), (3) make it **self-refreshing** ("leave and come back and it's current — like a screensaver but not exactly"), and (4) **never scroll** — the card must stay whole on any phone/tablet. Approved via two light-mode mockups first.

- **Shared data layer `src/lib/wa-summary.ts`** (server-only, `cache()`-wrapped so metadata + page share one compute): `loadWaSummary(personId, withNotices=true)` → `{ first, open, overdue, top[], notices[] }`. `top` = ALL overdue most-late-first (client caps). `notices` = `feedForPerson()` (reuses the existing announcements engine), **person-directed (`audienceKind:"people"`) surfaced first** via a stable sort, then pinned/newest; each → `{id,title,source,unread}` where source = Administrator (`web-ui`) / Director (`portal-dir`) / Manager (`portal-mgr`). Used by the page, the refresh endpoint AND the image (image passes `withNotices=false`).
- **Live-refresh endpoint `GET /api/wa-card/data?p=&t=`** (`force-dynamic`, `no-store`) — signed JSON (same HMAC as `/api/wa-card`; public via the `api/wa-card` matcher exclusion). The card re-fetches it.
- **`reminder-card.tsx`** (client) — the light-Aurora card. Server-renders from `initial` (instant paint, no-JS friendly), then keeps current: refresh **on `visibilitychange`/`focus`** + a **60s pulse only while visible** (paused when backgrounded — no battery/data waste). NOT a websocket; "current the instant you look." On a data change the "Live" pill flashes "Updated" (2.2s) — no layout shift. **No-scroll:** outer is `position:fixed; inset:0` (escapes the root-layout `<main>` padding) + `overflow:hidden`; fluid `clamp()` sizing; overdue rows capped by viewport height (`rowsForHeight`: 4 ≥820px, 3 ≥680, 2 ≥580, else 1) with a "+N more open · M more notices" line. Verified `scrollable:false`, container fills viewport exactly (768×1024). Megaphone = lucide (not emoji).
- **`page.tsx`** rewritten: verify sig → `loadWaSummary` → `<ReminderCard>`; invalid sig → friendly fallback card (no data, no refresh). `generateMetadata` (the OG preview) unchanged.
- **`/api/wa-card` image** re-skinned to **light** (white surfaces, accent bar, tinted tiles, "Updated live") and now uses `loadWaSummary` for counts/top-3 (DRY).
- **Announcements are display-only on the landing** (no receipt write from a public GET — reading/acking still happens in the portal).
- **Verified** (dev, mobile+tablet): tsc clean; 40 tests; light landing + light image render; demo announcement targeting Vishal (id 4) showed the "Notice · Administrator" panel with unread dot; deleting it + firing focus removed it from the card **with no reload** (proves live refresh); no scroll on phone/tablet; console clean. Demo announcement removed (table back to 0).
- New/changed files: `src/lib/wa-summary.ts`, `src/app/api/wa-card/data/route.ts`, `src/app/r/[p]/[t]/reminder-card.tsx` (new); `src/app/r/[p]/[t]/page.tsx`, `src/app/api/wa-card/route.tsx` (rewritten). **NOT pushed.**
- Perf note: `loadWaSummary` calls `getAllTasks()` (loads all tasks) each refresh; fine at this scale (single operator, few staff) — optimise later if needed.

### "From who" on the preview image + landing (2026-06-18)
Owner asked the WhatsApp link-preview image to be **landscape** (already is — 1200×630) and show **open · overdue · company logo + name · from who**. Everything was already there EXCEPT the sender. Added a **"From {who}"** line (chosen format: **sender's name + office**).
- `wa-card.ts`: `waReminderLink(personId, from?)` + `waCardImageUrl(personId, from?)` now append an (unsigned, display-only) `from`/`?from=` param; new `sanitizeFrom()` (clamp 48 chars, strip newlines) + `waFromLabel({name, role})` → `"{name} · Director/Manager"` or `"the Administrator"` (admin/owner) / `"{ownerName} · Administrator"` if owner identity name set.
- The `from` flows: a caller builds `waReminderLink(id, from)` → `/r/{id}/{sig}?from=…` → `generateMetadata` reads `searchParams.from` and bakes it into the og:image URL (`waCardImageUrl(id, from)`) → the image renders "From …". The landing card (`reminder-card.tsx` `from?` prop) shows it under the greeting. `from` is **static per-send** (URL param), NOT part of the live-refresh JSON.
- Call sites: **Outbox** (`gen.ts generateDrafts`) reads `v2.ownerName` directly via `sb` (NOT `getOwnerIdentity` — that imports `server-only`+`next/headers` and broke `gen.test.ts`; **rule: don't pull admin-auth into outbox/gen**) → admin sends are "from the Administrator"/owner name. **Portal /team** uses `waFromLabel({name: me.name, role: me.portalRole})`. **Twilio path** (`reminders.ts sendTaskReminderWhatsApp` gained `from?`; `portalSendReminderWhatsApp` passes it).
- Also fixed a satori spacing quirk on the image greeting ("Hi X—" → proper " — ") by using a single template string.
- Verified: image + landing render "From Priya Shah · Manager"; og:image carries `&from=`; tsc clean; 40 tests.

## Director reminders + WhatsApp task summary (2026-06-18) — NOT PUSHED

Owner: directors could see everyone's tasks but couldn't easily send a reminder; creating a task had no "notify" step; the real Email/WhatsApp send was buried on `/portal/team` (only linked from the "On leave" KPI tile). Plus: add a way to send the accountable person a **WhatsApp** summary of ALL their open tasks (email already renders well — detail is for WhatsApp only).

- **New builder `buildTaskSummaryWhatsApp(name, tasks, link?)`** (`outbox/gen.ts`): detailed WhatsApp text, grouped by company; per task = *title* (bold) + Status · Priority + Due + ⚠️ N days overdue + Responsible (all assignees) + About (description, clamped 100) + Latest (recent update, clamped 100). Reminder link last (card preview). Distinct from the short `buildWhatsAppManualMessage` nudge (kept).
- **New action `portalSendTaskSummaryWhatsApp(personId)`** (`portal/actions.ts`): director/manager/hr only; kill-switch honoured; gathers the person's open tasks, builds the summary + a signed reminder link (`waFromLabel` "from who"), returns a **wa.me deep-link** (manual tap-send, since Twilio shelved), logs an Outbox Draft (`message_type "TASK SUMMARY"`).
- **Reusable `components/notify-person.tsx`** — `<NotifyPerson personId name>` = two buttons: **WhatsApp summary** (→ action → opens wa.me) + **Email summary** (→ existing `portalSendReminderEmail`, real send). Used on:
  - **After creating a task** (`director-task-form.tsx`): success step "Assigned to X · send them a summary?" with NotifyPerson (instead of just closing). Responsible select made controlled to capture the assignee.
  - **Tasks list expanded row** (`portal-tasks-command.tsx`): kept Remind owner / Remind all (now gated behind new `canManage` prop), added a "Send {name} a summary of all their open tasks" block. `TaskRow` gained `canManage`.
  - **Per-task page** (`task-quick-actions.tsx` + `task/[code]/page.tsx` passes `ownerId`).
- **Team page** (`team/page.tsx`): its WhatsApp text now uses `buildTaskSummaryWhatsApp` (was the short envelope).
- **Board entry point** (`director-board-client.tsx`): added a "Team →" link to the "Needs you" section header (was only reachable via the mislabeled "On leave" tile).
- **Verified live** (director Pulin Manek): Tasks list row shows Remind owner + WhatsApp/Email summary; clicking WhatsApp summary logged a TASK SUMMARY draft whose body had every requested field grouped by company (confirmed via DB, then deleted); board has 2 Team links; board + tasks render, no runtime errors (the transient "Unterminated regexp" console spam was stale HMR from mid-edit — tsc exit 0 on the final file). tsc clean; 40 tests pass.

### Team-page expand + manager parity (2026-06-18, same batch)
- **`team/team-task-list.tsx`** (client): each teammate's open tasks now expand INLINE — a 5-line preview → "Read all N tasks" reveals EVERY task with full detail (title · ⚠️Nd overdue · company · status · priority · responsible · description · Latest update). `team/page.tsx` maps `ts → details[]` and renders `<TeamTaskList>` (replaced the old top-5 `<ul>`). Verified live: Jitesh's card expanded to all 8 with detail.
- **Manager parity (sync both ways, no duplication):** the reminder/summary features are all in shared, role-agnostic code — `NotifyPerson`, `buildTaskSummaryWhatsApp`, `portalSendTaskSummaryWhatsApp`/`portalSendReminderEmail` (all allow director **and** manager + hr), the `/portal/tasks` command view (`isManagement` = manager|hr|director; `canManage = role !== "staff"`), the per-task page (`canRemind = isManagement`), and the Team page (allows all non-staff). Managers reach Tasks via the nav pill (`showTasks`) and Team via the home card link. **No manager-specific copies built.**
- **Shared after-create notify:** added the same "Assigned ✓ → send a summary?" step to **`QuickAdd`** in `portal-tasks-command.tsx` (used by BOTH manager `portalCreateTask` and director `portalDirectorCreateTask`), so the notify step now fires on the Tasks-list quick-add for both roles — not just the director board's `director-task-form`. tsc clean; 40 tests. **NOT pushed.**

## Capture bar + message-send + wa.me bug fix (2026-06-18) — NOT PUSHED
Owner batch on the director board / messaging:
- **`wa.me` "link failed" bug — ROOT CAUSE + FIX:** some numbers are stored LOCAL (e.g. Shivam's whatsapp `"0686450999"`) while wa.me REQUIRES international. `outbox/links.ts` now normalises via `intlDigits()` (in `waLink`): `+…`/`00…` kept, leading `0` → `255…` (DEFAULT_CC = Tanzania), bare 9-digit → `255…`. Fixes admin Outbox **and** every portal wa.me path (all go through `waLink`). 8 unit tests in `links.test.ts`. (`smsLink` keeps raw digits — local dialling is fine.)
- **"Send a message" now SENDS** (`director-message.tsx`): "Draft message" → **"Send message"**; on submit it opens the pre-filled wa.me/mailto/sms deep-link (one-tap manual send) AND logs the Outbox draft. `portalDirectorDraftMessage` now also returns the resolved `channel`. If no contact on file → warns + still saves a draft.
- **Dropdowns upgraded** native `<select>` → **FluidSelect** (app-anchored) in `director-message` (recipient), `director-task-form` (company/responsible/priority, via hidden inputs), `director-event-form` (company). Event attendees already used `PeoplePicker`. Verified `nativeSelectsOnPage: 0` on the message sheet.
- **Team chip in the capture bar** (`smart-capture-bar.tsx`): a "Team" link sits after Task/Event/Message → `/portal/team`; the redundant "Team →" link was removed from the board's "Needs you" header. The `↵ opens a quick form` hint moved to `lg:` so 4 chips fit on phones/tablets.
- **Suggestion rotates the top-3 urgent tasks**: board passes `suggestions[]` (overdue-first, top 3) instead of one; `SmartCaptureBar` cycles every 5s while the bar is empty, with dot indicators; `<AutoRefresh seconds={60} />` added to the board so the list stays live. Verified rotation live (VAT Registration → Oracle Consultancy Structure).
- Verified: tsc clean; 48 tests; board renders; message sheet opens with FluidSelect + Send + seeded body. **NOT pushed.**
- **People directory — BUILT then MERGED into one list (2026-06-18).** Final design (owner iterated through grid/masonry mockups, rejected both): `/portal/team` is now a **single merged list** — NO tabs, NO expand chevron. Each active person = one `PersonCard` (`team/person-card.tsx`): top row = avatar + name + role·company·counts + icon cluster **call · WhatsApp · email · profile**; the person's open tasks render **directly below** (`team-task-list.tsx`, "Read all N" expands full detail); people with no open tasks show just the top ("No open tasks"). The **WhatsApp/email icons are adaptive** — with open tasks they send the task summary/branded reminder (`portalSendTaskSummaryWhatsApp` / `portalSendReminderEmail`, email opens a short note box first so it's not a one-tap send); with none they open a blank chat/`mailto`. Greyed when no contact. Sorted **overdue-first**; search + clear. `team-view.tsx` = header + search + `PersonCard` list; `page.tsx` builds one `TeamPerson[]` (all active people, counts from `getAllTasks`, contacts via `tel:`/`mailto:`/normalised `waLink`). **Deleted** `remind-button.tsx` + `whatsapp-button.tsx` (superseded). Earlier the reminder buttons were converted to icon-style + a "With open tasks | Everyone" toggle + search-clear were added — all now folded into the merged card. **Team chip in capture bar** is `flex-wrap` (no clip at 375px). **Manager parity**: Team page allows non-staff; managers reach it via home card + `/portal/tasks` nav; all reminder/summary actions permit manager/hr. tsc clean; 48 tests; merged page verified live (24 people, 0 chevrons, tasks inline, adaptive icons, console clean).

### ALL PUSHED (2026-06-18, commit 18f4a0c)
Everything in the three sections above — director/manager reminders + WhatsApp task summary, capture-bar Team chip + rotating suggestion + send-on-submit + FluidSelect dropdowns + wa.me number-normalisation fix, and the merged people directory on `/portal/team` — is now on **master/origin** (commit 18f4a0c). The various "NOT pushed" lines in those subsections are superseded. (Earlier WhatsApp-landing batch was e440bc7, below.)

### PUSHED (2026-06-18, commit e440bc7)
The **entire WhatsApp non-provider overhaul** above (gate fix + short envelope + light landing + announcements + live refresh + "from who") is now on **master/origin** — the "NOT pushed" notes in the earlier subsections are superseded. **Owner OPS still outstanding:** set `NEXT_PUBLIC_APP_URL` in Vercel (so WhatsApp's crawler fetches the og:image on the live host) + device-test a `/r/...` link in a real WhatsApp chat. Twilio go-live still shelved.

### Director Brief company filter — `?co=` rename + dropdown (2026-08-02)

**The bug (owner-reported, reproduced live).** Picking a company on `/brief` opened a
**company preview drawer** over the report, and dismissing that preview **wiped the
filter** (back to Portfolio). The filter was effectively unusable.

**Root cause — a parameter-name collision, not a Brief bug.** `CompanyDrawer` is mounted
globally in `src/app/layout.tsx` and opens on **any** `?company=<id>` outside
`/companies/[id]` (`company-drawer.tsx`: `open = !!searchParams.get("company") && !onCompanyPage`);
its `close()` **deletes** that param. The Brief's filter happened to use the same word.
One click therefore filtered the brief *and* popped the drawer; closing the drawer
stripped the param and reset the brief. (Escape closed the drawer *without* stripping —
which is why the filter sometimes appeared to stick.) Any `/brief?company=N` link — a
bookmark, anything already shared — hit the same thing.

**Fix.**
- New `src/lib/brief-links.ts` — `BRIEF_COMPANY_PARAM = "co"`, `briefHref()`,
  `briefPdfHref()`, `parseBriefCompanyId()`. One place builds every /brief link so the
  screen, the PDF button and the share links can't drift.
- `/brief` reads `?co=`; a legacy `?company=` **server-redirects** onto `?co=` (so old
  links land on a clean filtered report and never trigger the drawer). `/brief/pdf`
  accepts `co` first, `company` as a fallback.
- `brief-company-filter.tsx` rewritten: 13 wrapping pills → ONE Aurora `FluidSelect`
  (`Portfolio · all companies` + company accent dots). Client component, `router.push`.
- `brief-period-filter.tsx` now carries the selected company across — changing period
  used to silently drop it.
- `BriefData.companyOptions` gained `accent` (for the dropdown dots).

**FORWARD RULE: `?company=` is RESERVED app-wide for the global CompanyDrawer preview.**
Never use it as a page's own filter parameter — pick a page-specific name.

**Unfiltered PDF is byte-for-byte unchanged** — no filter → identical code path. Verified
live: `?co=3` and legacy `?company=3` both render the Terra Green PDF; no params renders
the portfolio PDF. tsc clean, 278 tests pass. Person filter + a portal picker are still
open (owner questions outstanding). NOT pushed.

### Director Brief — person filter + dot fallback + compliance link (2026-08-02, same batch)

- **Person filter (`?who=`)** — `getBrief(..., { personId })`. "Theirs" = **owns OR leads
  (accountable) OR is assigned** (`r.ownerId === pid || assigneeIds.includes || leadIds.includes`).
  Everything downstream derives from the filtered `rows`, so delivered / open work / watch-list
  / per-company figures all narrow together. Per-company KPIs are **recomputed**
  (`computeCompanyKpis(rows)`) because the portfolio-wide ones count everyone. Company-level
  sections (compliance, statutory, HR, week ahead) deliberately stay company-scoped — they
  aren't about a person. `peopleOptions` is derived from the tasks in the CURRENT company
  scope (no extra DB read, no dead-end names). New `brief-person-filter.tsx`.
- Filters **compose**: `?co=` + `?who=` together. `brief-links.ts` now takes a
  `BriefSelection {companyId, personId}`; every /brief + PDF link is built there.
- Naming precedence everywhere (hero, PDF title, PDF filename, share text, email subject):
  **person → company → BRAND_NAME**. With a person selected the company drops to the subtitle.
- **PDF exec summary** now says "<subject> delivered N…" instead of always BRAND_NAME — a
  company/person-filtered PDF used to claim "Oracle Consultancy delivered…". Unfiltered output
  is unchanged (subject === BRAND_NAME).
- **Dropdown dots**: companies with no `accent_color` (e.g. Akasaki) rendered NO dot, so their
  names sat out of line. Fall back to `hsl(var(--accent))` — same fallback the "By company"
  cards already use.
- **Compliance recommendation link** was `/documents?company=<id>` → now `/companies/<id>`.
  `/documents` never read `company` (its searchParams are only `from`/`tab`), so it filtered
  nothing AND popped the CompanyDrawer preview. The company page's `ComplianceSummaryCard` is
  the real destination.
- **STILL OPEN**: the PDF's Delivered KPI tile has a hardcoded `"in June"` subtitle
  (`brief-pdf.tsx`) — wrong in every month/period. Left alone on purpose (owner said don't
  change the default PDF); needs his go-ahead. Portal person/company picker not built.

Verified live on `npm run dev` (port 3000): `?who=11` → hero "Mr Amal Somaiya", 2 companies,
no preview drawer; all four PDF combinations render 200 with the right filenames; **unfiltered
PDF still "Director-Brief-Oracle-Consultancy-Limited-…"**. tsc clean, 278 tests pass. NOT pushed.

### Brief person list — staff register, not task assignees (2026-08-02, same batch)

Owner spotted odd single-word names (Aryan, Hitesh, Joemar, Rashmit) in the person filter.
**Cause:** `peopleOptions` was derived from task owners/leads/assignees. All four are
**ARCHIVED leavers** (`people.active = false`, ids 14/45/43/40) whose old tasks are still
attached, so an assignee-derived list resurrected them — and simultaneously OMITTED any
active person with no tasks yet. (DB at the time: 43 people rows, 30 active, 13 inactive;
8 single-word names, all inactive.)

**Fix:** `peopleOptions` now comes from `people` where `active = true` (added to getBrief's
opening `Promise.all`). Result: 30 active people listed, leavers gone, and staff with zero
tasks are selectable — "who has nothing assigned" is a legitimate question, and the report
answers it honestly (0/0/0). A `?who=<archived id>` still FILTERS correctly (only the list
changed), so old links keep working. `selectedPersonName` prefers the register, falling back
to the task-derived name map for archived ids.

Verified: dropdown = 31 options (Everyone + 30), none archived; `?who=72` (no tasks) renders
a clean zero brief + an 18KB PDF; `?who=14` (archived) still renders; unfiltered PDF unchanged
at 4MB "Director-Brief-Oracle-Consultancy-Limited-…". tsc clean, 278 tests pass. NOT pushed.

### Brief — "in June" fix + pick-any-month period (2026-08-02, same batch)

- **"in June" fixed.** The PDF's Delivered KPI tile carried a HARDCODED `"in June"` sub-label
  (`brief-pdf.tsx`) — wrong in every month and every period. Now `in ${b.monthLabel}`. Owner
  confirmed the sighting first; note it only ever appeared in the DOWNLOADED PDF (the tile row
  on page 1), never on screen and never in a browser Ctrl+P of the page — those are separate
  renderers, which is why he couldn't find it at first.
- **Any-month period.** `BriefPeriod` gained `BriefMonthPeriod = \`on:${string}\`` (e.g.
  `?period=on:2026-06`). The `on:` prefix keeps it clear of the preset names. `parseBriefPeriod`
  validates `/^on:\d{4}-(0[1-9]|1[0-2])$/` before casting; `periodRange` returns
  [1st of month, 1st of next month) with a "June 2026" label — same shape as "last-month".
  New `brief-month-filter.tsx` (FluidSelect, "Any month" + last 12 months); options built
  SERVER-side via `briefMonthOptions(now)` in `brief-links.ts` so labels can't drift between
  server and browser. Picking a month deselects all four preset pills automatically (none
  matches an `on:` period); "Any month" hands control back.
- Composes with the company + person filters and flows into the PDF, share text and email.

Verified: `?period=on:2026-06` → "June 2026", 19 delivered (vs 11 in August), all preset pills
off; PDF filenames `…-June-2026.pdf` and `…-Mr-Amal-Somaiya-June-2026.pdf`. tsc clean, 278
tests pass. NOT pushed.

### Brief — multi-month (tick several, merged) (2026-08-02, same batch)

Owner wanted to tick MORE THAN ONE month, non-adjacent allowed, MERGED into one report
(he explicitly chose merged over side-by-side comparison).

- `BriefMonthPeriod` now carries a comma list: `?period=on:2026-05,2026-06,2026-08`.
- `periodRange` returns **`ranges[]`** alongside start/end. Delivered is tested against
  `ranges.some(...)` — NOT the outer span — so skipping a month with data really skips it.
  Every preset returns a single-element `ranges` so nothing else changed.
  `start`/`end` stay the outer SPAN and still feed the two span-based secondary signals
  (staff joiners, brief notes); with a gap those cover the whole stretch. Noted, accepted.
- Label: `monthListLabel` → "June 2026" · "June & July 2026" · "May, June & August 2026" ·
  cross-year keeps the year on each ("December 2025 & March 2026").
- `brief-month-filter.tsx` rewritten as a Radix DropdownMenu of CheckboxItems (FluidSelect is
  single-select). `onSelect={e => e.preventDefault()}` keeps the menu OPEN while ticking; the
  picks are held in local state and applied on CLOSE — so three ticks rebuild the brief once,
  not three times. Trigger reads "Any month" / the month name / "N months". `briefMonthOptions`
  now emits bare "YYYY-MM"; `briefSelectedMonths` + `briefMonthsToPeriod` convert.

**Verified arithmetic (live):** June alone 19 delivered · July alone 14 · June+July **33**
(=19+14) · June+**August** **30** (=19+11, correctly SKIPPING July's 14) · May+June+August 46.
Open stayed 38 throughout — as designed, open work is always "as at today", never historical.
UI: ticking keeps the menu open, Escape applies once → `?period=on:2026-05,2026-06,2026-08`,
PDF `Director-Brief-…-May-June-August-2026.pdf`. tsc clean, 278 tests pass. NOT pushed.

**Owner briefed on the key limitation:** a month only scopes DELIVERED (+ joiners). Open /
overdue are live. "What was open at the end of June" would need historical state
reconstruction — not built, quoted as a separate piece of work.

### Brief — a picked month now scopes EVERYTHING, not just delivered (2026-08-03)

Owner: "why is April showing tasks when there was no system then?" Data check: tasks only
exist from **31 May 2026**; closed-per-month = May 16 / Jun 19 / Jul 14 / Aug 11; April had 0.
The 38 "open" he saw were TODAY's open work, which used to render on every period.

**Now:** an `on:` month selection also filters the task set — a task belongs to month M if it
EXISTED by end of M and had not already been closed before M began (computed from
created_date + closed_date; no history reconstruction). Per-company figures are recomputed
from that set. `historicOnly` (no selected month reaches today) additionally drops
**compliance, statutory deadlines and the week ahead** — all "as things stand now" figures
that would imply they were true back then.

**Presets are untouched** (`monthScoped` gates everything), so This month / Last month /
Quarter / Year and the default PDF behave exactly as before. Verified: default still
11/38/2/13 with the compliance section present; April 2026 → 0/0/0/0 and those three sections
gone; June 2026 → 19 delivered / 18 open / 6 companies (was 19/38/13).

**KNOWN GAP, disclosed to owner:** a task live in June but closed in JULY sits in June's scope
yet appears in neither June bucket (not delivered-in-June, not open-today). June: 47 tasks were
live, 19+18=37 shown, 10 fall through. The fix is to define the open bucket as "not closed by
month END" instead of "open today" — rejected for now because those rows would display their
CURRENT status ("Completed") under a heading that says Open work, which reads as a bug.
Awaiting his call.

**Testing note:** section headings use CSS `uppercase`, so `innerText` returns them
UPPERCASED — case-sensitive regex checks against the rendered page give false negatives. One
earlier verification pass was wrong because of this; always match case-insensitively.

tsc clean, 278 tests pass. NOT pushed.

### Brief — Lead / Working toggles on the person filter (2026-08-03)

Data check first: `task_assignees.role` holds exactly two values — **accountable** (70 rows)
and **working** (91) across 98 live tasks. 59 tasks have an explicit accountable person;
**39 tasks have NO lead at all** and 3 have nobody attached (flagged to the owner — "Lead"
will look emptier than expected until those are tagged). Owner is ALWAYS also an assignee
row in this data, so the `leadIds` owner-fallback never fires today.

- `?role=lead` / `?role=working` (`BRIEF_ROLE_PARAM`), only emitted alongside `?who=`.
- Mapping: **lead** = `leadIds.includes(pid)` (the accountable set, which already falls back
  to the owner); **working** = `assigneeIds.includes(pid) && !leadIds.includes(pid)`. Clean
  split — verified on Amal Somaiya: both = 1 delivered/3 open, lead = 0/1, working = 1/2, so
  lead + working exactly equals both. No double counting.
- UI: owner rejected a 3-way All/Lead/Working segmented control as "a lot of noise" — it's
  **two independent toggle buttons** after the person dropdown instead. Neither pressed =
  both (today's behaviour); pressing the active one again clears it; hidden entirely until a
  person is picked.
- **PDF: owner's explicit choice (a)** — the lens narrows the PDF's CONTENTS (818KB vs 821KB
  for lead vs both) but is deliberately ABSENT from the title and filename, both still
  "Director-Brief-Mr-Amal-Somaiya-August-2026.pdf". Do not "fix" this.
- `BriefSelection` now carries `personRole`, so the period/month/company filters all preserve
  it as you switch.

**Dev-server gotcha hit again:** the toggles appeared absent on first check — a stale cached
render. A cache-busting query param forced the real page. When a just-added element seems
missing in the preview, force-reload before debugging the code.

tsc clean, 278 tests pass. NOT pushed.

### Portal Director Brief — filters under the hero, permission-gated (2026-08-03)

**Who actually uses it (checked):** FIVE portal directors, not just Pulin —
Pulin Manek (id 13, `director_company_id` NULL = whole portfolio), Kishan Suchak + Chirag
Tanna (both company 6), Daniel Opanga (company 5), Parin Manek (company 2). So FOUR of five
are locked to one company; scope is the whole design constraint. Also 4 managers + 1
receptionist on the portal.

**Before:** one bare "Download PDF" button in the profile hero, `isDirector` hard-coded, no
parameters at all — always this month, whole scope.

**Now:** owner asked for the toggles under the hero card, explicitly NOT a full portal brief
page. New `portal-brief-filters.tsx` — a card below the hero with the same four controls
(multi-month checkboxes · company · person · Lead/Working) plus Download + Preview. Choices
live in LOCAL state and only assemble the download URL, so changing a filter never reloads the
profile behind you. Company picker hides itself when they govern only one company.

**Permission-gated, not role-gated** (CLAUDE.md forward rule): new `directorBrief`
CapabilityKey in `portal-permissions.ts`, defaulting `director: true` and everyone else false
— an exact mirror of the old behaviour. The owner can now grant it to managers in
Settings → Portals without a deploy.

**Scope enforcement — the security half.** New `src/lib/portal-brief-scope.ts`:
- `portalBriefOptions(me)` builds the company + people lists from `companyScope(me)`. People
  are matched via BOTH `person_companies` and `people.company_id`, so someone attached to a
  scoped company but based elsewhere still appears. A company-locked director therefore never
  sees other companies' staff NAMES in the picker — the leak the admin version would have had.
- `resolvePortalBriefFilters(me, params)` re-resolves EVERY query value against their scope in
  the route. Anything outside is DROPPED (falls back to their full scope) rather than honoured
  or errored, so a hand-edited link cannot widen the report. A `role` without a valid `who` is
  dropped too.

**Verified as Pulin (portfolio director):** card renders; company list 13 + "All"; people list
30 + "Everyone"; `?co=3` → Terra Green PDF; `?who=11` → Amal PDF; `?period=on:2026-06,2026-07`
→ June-July PDF; **`?co=99999` → silently falls back to the full portfolio, 200 not 500**.
NOT verified end-to-end: the company-locked path (couldn't sign in as Kishan/Parin) — it runs
through the same `companyScope` helper as every other portal read, but flag it if he tests.

tsc clean, 278 tests pass. NOT pushed.

### Portal brief filters — one aligned row (2026-08-03)

Owner: buttons were on two rows with mismatched heights. All seven controls now share ONE
class matching Button `sm` secondary (`h-8 px-2.5 text-xs rounded-lg border border-border
bg-bg-elev`) and sit in a single `flex flex-wrap items-center gap-2` row — filters AND the
Download/Preview actions together. Preview became a proper button (Eye icon) instead of a
text link. `cn()`/tailwind-merge lets the h-8/px-2.5/text-xs override FluidSelect's built-in
px-3 py-1.5 text-sm.

Verified: desktop = all 7 on one line, identical height, same top. Mobile 375px = wraps to 3
tidy lines, still 32px each, **no horizontal overflow**. (Desktop measured 26px not 32px —
that's the portal's accessibility text-size setting scaling rem, not a bug.)

**Preview vs Download is NOT duplication** — confirmed from the response headers:
Preview → `Content-Disposition: inline` (opens in the PDF viewer), Download → `attachment`
(saves). Same file, two intents.

### Notification bell — complete rebuild (2026-08-03)

Owner: "a total mess … the way information is displayed is wrong". Measured first —
admin bell held **136 rows**, 1,000 across everyone.

**What was wrong (all evidenced from live data):**
- **41% mis-filed.** 56 of 136 admin rows were ORI daily digests ("11 staff quiet with open
  work") written with `kind: "assigned"` and no task → rendered under Tasks with an
  "assigned you" icon, as if a person handed you a job.
- **Duplicates.** 6 bursts / 8 redundant rows; the same DS-012 update stored 4× in one minute.
- **Nothing expired.** 69 of 136 older than 14 days, oldest 37d.
- **List lied.** `listNotifications` capped at 30 while the badge counted all 136.
- **One glance wiped the signal** — opening called `markAllRead`.
- **Portal flood.** 581/1000 rows `chat`; "Your tasks · <Company>" repeated ~30× per person.
- **Dead groups.** UI built for Messages/Tasks/Leave/Meetings/Announcements, but kinds
  mention/reply/pinned/leave have NEVER occurred.
- **Inverted hierarchy.** `title` = boilerplate ("Mr Pulin Manek assigned you a task"),
  `body` = the actual task name, code on a third line. Every row opened identically.

**Fix — `src/lib/notification-view.ts` (pure, client-safe, 14 unit tests).** Corrections are
applied at READ time, so all ~1,000 existing rows file correctly with **no migration** and
**no edits to the ~17 cron call sites** that write `kind: "assigned"`.
- `isSystemDigest` = actor ORI && no taskCode; `isDailyReminder` = chat && title starts
  "Your tasks". Both → Activity lane.
- **Two lanes** replace five categories: `needs-you` (assigned/mention/chat_mention/reply/
  pinned) vs `activity` (everything else).
- `notifSubject` promotes `body` to the headline and demotes actor+verb+code+time to the meta
  line, shortening the actor via `getGivenName` ("Mr Pulin Manek" → "Pulin").
- `groupNotifications` collapses repeats. **Window is per-type:** 12h for ordinary bursts, but
  INFINITE for digests/reminders — they repeat daily by design, so a 12h window never folded
  them (caught this in live testing, not in the unit tests; added a 30-day reminder test).

**Other changes:** list limit 30 → 80; `markRead(recipient, ids)` so only what you open is
marked (opening the panel no longer clears anything, explicit "Mark all read" button added);
`purgeOldRead()` drops READ rows older than 14 days, wired into the morning-run cron (unread
is always kept).

**Verified live in Pulin's portal:** 80 rows → "Needs you 5" / "Activity 5" (was 75 unfiltered
activity rows). Headlines now read "ISO Certification - Full details and execution" with
"Pulin assigned you · ME-023 · 12h" beneath. The 22 daily reminders fold into one row showing
"Show all 22". tsc clean, 292 tests pass. NOT pushed.

**Owner's two calls:** keep the daily "Your tasks" reminder in the bell, and keep ORI digests
in the bell — so both were re-filed, not removed.

### Bell — panel-closes bug, portal single list, recurring supersede (2026-08-03)

**Bug: clicking anything in the panel closed it.** The panel is `createPortal`'d to
`<body>`, so it is NOT inside the trigger's `ref`. The outside-click handler tested only
`ref.current.contains(target)` on `mousedown`, so every click INSIDE the panel read as
outside. Pre-dated the rebuild (the old collapsible section headers had it too) — it only
became obvious once tabs existed, because rows navigate away anyway. Fix: a second
`panelRef` on the dialog; the handler now checks both.

**Lanes are command-centre only.** Owner: "activity isn't needed for directors, managers or
staff". Measured first — Activity would hold **94% of a staff bell** (355 of 453 rows are the
daily reminder), 93% for managers/directors, 69% for admin. So hiding it behind a tab would
bury their work, not tidy it. Portals now render ONE plain list (`lanes` prop, default off);
`top-pill.tsx` passes `lanes`, the portal layout doesn't. Surface-based, not capability-based
— the owner asked about permissions but didn't ask for a switch; easy to add later.

**Recurring items supersede instead of piling up** (owner: "everyday its new and the previous
ones gone"). `isRecurring`/`recurringKey` in `notification-view.ts` (ORI digest = actor ORI +
no task; daily reminder = chat + title starts "Your tasks"). `createNotification` DELETES
prior rows with the same recipient+title before inserting, so today's replaces yesterday's.
`purgeSupersededRecurring()` (nightly, morning-run) keeps only the newest per recipient+key —
clears the backlog that built up before this existed and self-heals any slip. Chunked deletes
(200/batch) so a large backlog can't blow the REST URL length.

**Verified live (Pulin's portal):** no tabs; **10 rows, down from 75**. Expanding a collapsed
group ("Show all 22") no longer closes the panel — mousedown and click both survive. tsc
clean, 292 tests pass. **NOT verified:** the admin two-lane UI — the portal session takes
precedence in the preview browser, so `/` redirects to `/portal/board`; the lane code is the
same component and type-checks, but he should eyeball the command-centre bell. NOT pushed.

### Notification backlog swept (2026-08-03) — DESTRUCTIVE, done with owner's yes

`npm run db:backup` taken first (backups/2026-08-03T07-38-16Z, 97 tables / 21,114 rows), per
the CLAUDE.md rule for bulk DB changes. Dry run before applying.

Rule applied = the same one in `notification-view.ts`: recurring (ORI digest = actor ORI + no
task_code; daily reminder = kind chat + title starts "Your tasks"), keep the NEWEST per
recipient+title. **1,110 → 304 rows: 806 redundant copies deleted, 41 recurring groups kept,
263 non-recurring rows untouched.** Worst piles: person:13 (Pulin) −99, person:2 −99,
person:71 −59, admin −51.

Pulin verified after: **113 rows → 14**, 9 distinct titles, "has been quiet" down from 71
copies to 4 (one per person).

**STILL WRONG, flagged to owner, NOT yet built:** directors receive the quiet-staff nudge as
ONE ROW PER PERSON, while admin gets it correctly aggregated ("11 staff quiet with open
work"). The sweep can't fix that — it's per-person at the point ORI writes it, in
`src/app/api/cron/ori-automations/route.ts`. Advice given: aggregate it for directors too,
and probably drop it from the director BELL altogether (it's oversight, not a request
addressed to them — their board already carries a nudge banner). Also noted: two rows whose
entire title is a person's name ("Mr Shivam Parmar", "Admin Shivam") are chat messages and
should read "Shivam messaged you".

### Quiet-staff nudge aggregated for managers/directors (2026-08-03)

`checkQuietStaff` in `src/app/api/cron/ori-automations/route.ts` sent ONE notification PER
QUIET PERSON to each manager — a director woke to four near-identical rows ("Mr Yash Chavda
has been quiet", "Mr Ashit Shah has been quiet"…) every day, while the OWNER already got a
single roll-up. Now managers get the same single roll-up: lines are collected into a
`managerLines` map and one notification is emitted per manager after the loop.

**Title must stay count-stable for the supersede to work.** "4 staff quiet with open work"
today vs "3 staff…" tomorrow are different strings, so an exact-title supersede would let
every day's variant survive (that is exactly why admin had "11 staff…", "6 staff…" and
"8 staff…" all coexisting). So `recurringKey` now STRIPS a leading count, and a new
`recurringTitleMatch` returns `{op:"like", value:"%staff quiet with open work"}` for those;
`createNotification` uses `.like()` instead of `.eq()` when the op is "like". Wording is
deliberately "N staff" for both singular and plural so the stem never changes. 5 new tests.

**Chat titles: NO change needed** — investigated and the concern was unfounded. A DM's title
is the bare sender name ("Mr Shivam Parmar"), but the bell's `notifSubject` promotes the BODY
to the headline, so it already renders "Hello" / "Shivam messaged · 2d". The bare name is only
the phone-push title, which is the correct WhatsApp-style convention there.

**One-off cleanup:** deleted 13 old-format "X has been quiet" rows (9 of them unread) across 6
recipients — they can't be superseded by the new aggregate (different title stem) and the
signal regenerates daily. Pulin: 14 → 10 rows.

`.next` had to be cleared to get a clean tsc: `.next/dev/types/routes.d.ts` was genuinely
truncated (`api/portal/ori/ask": {}` — missing its opening quote), which produced ~10 phantom
errors in an otherwise clean codebase. Stop the dev server, `rm -rf .next`, restart. tsc clean,
**297 tests pass**. NOT pushed.
