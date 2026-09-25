---
name: outbox-and-reminders
description: "Outbox (live per-person reminders, saved + scheduled drafts, sent log), email automation registry, branded email template, manual/portal reminders, WhatsApp, to-do reminders, the Report panel (Director Brief) and the notification bell"
metadata:
  node_type: memory
  type: project
---

# Outbox, email automation, reminders and the Report — current reference (Sept 2026)

Everything here is on master. Chat was removed on 26 Sept 2026: nothing in this
area posts into chat any more — pings go through `createNotification` (the bell,
which pushes) and email.

## File map

| Area | Files |
|---|---|
| Outbox data | `src/lib/outbox/gen.ts` (live per-person reminders + message builders), `drafts.ts` (saved drafts + scheduled nudge), `history.ts` (sent log, last-chased), `links.ts` (wa.me / mailto / sms links, channel picking), `snapshot.ts` (read-only automation snapshot) |
| Outbox UI | `src/app/outbox/page.tsx` → `components/studio/outbox/studio-outbox.tsx`; actions `src/app/outbox/actions.ts` |
| Portal Outbox | `src/app/portal/(app)/outbox/page.tsx` + `portal-outbox-list.tsx` |
| Email | `src/lib/email/send.ts` (transport + signature), `src/lib/email/layout.ts` (the one branded template, `renderEmail`) |
| Automation engine | `src/lib/automation/` (below) |
| Manual reminders | `src/lib/reminders.ts` (`sendTaskReminderEmail`, `sendTaskReminderWhatsApp`) |
| WhatsApp | `src/lib/outbox/links.ts` (wa.me), `src/lib/whatsapp.ts` (Twilio, dormant), `src/lib/wa-card.ts` + `src/app/api/wa-card/route.tsx` (summary image) |
| To-do reminders | `src/lib/todo-reminders.ts`, `src/app/api/cron/reminders/route.ts` |
| Report / Director Brief | `components/studio/report-sheet.tsx`, `src/app/report/actions.ts`, `src/lib/director-brief.ts`, `brief-pdf.tsx`, `brief-links.ts`, `brief-notes.ts`, `portal-brief-scope.ts`, `director-brief-send.ts` |
| Bell | `src/lib/notifications.ts`, `src/lib/notification-view.ts` (pure, tested), `components/studio/notifications-panel.tsx` |

## The Outbox (`/outbox`, Studio)

One screen for the owner and a director (`getViewer()`; a director needs the
`navOutbox` capability). Header: **All · Reminders · Drafts · Sent**, the sent
log and "Send all email"; two dark cards (today's chasing; automatic sending);
then a list beside the one item it has open.

1. **Reminders — generated live, never stored.** `generateDrafts()` groups open
   tasks by assignee on every load: one item per person with every open task.
   A director sees only people in their companies and only those companies'
   tasks, and the WhatsApp text is rebuilt as theirs (`buildPortalTaskReminder`,
   signed "<name> - Director/Manager", pointing at `/portal`).
2. **Saved drafts** (owner only) — `outbox` rows with `status = "Draft"` and a
   `source`. Producers: to-do reminder (`createTodoReminderDraft` in
   `app/todos/actions.ts`), person pack (`createPersonPackDraftAction` in
   `app/people/pack-actions.ts`), automation "prepare" mode, the Report's
   "Save as a draft", portal task summaries, MCP `draft_message`.
3. **Sent** — today's log (`todaysSentRecords()` by real `sent_at`) and a 7-day
   history.

A director gets no saved drafts, no snoozing, no undo, and the automation card
read-only; **every action re-checks this on the server** (`guardOwner` etc. in
`outbox/actions.ts`), not just in the UI.

### Scheduled drafts
`outbox.scheduled_for` marks when a draft is meant to go. **A draft is never
sent on its own.** When its time comes the Outbox floats it to the top, and
**`nudgeDueScheduledDrafts()`** (`lib/outbox/drafts.ts`, run from `morning-run`
and `/api/cron/tick`) sends the owner ONE push ("A scheduled message is ready
to send") per draft, recorded in a small ledger in `settings`
(`outbox.scheduledNudged`, last 300 ids) so it never repeats. (Audit 26 Sept
2026: the scheduled time had been written and never read.)

### Sending, recording, dedupe
- **Email truly sends** server-side: `sendDraftEmail(id)` (drafts; still wraps
  the body in the plain `htmlBody()`, not the branded template),
  `sendAllEmailDrafts()` (loops, stops on not-configured), `sendReminderEmail
  (personId, note?)` (live reminder → the shared engine, office "admin").
- **WhatsApp / SMS are deep-links** (`linkFor` → `wa.me` / `sms:`) that open
  pre-filled for a manual tap-send; `mailto:` is the fallback when email is not
  configured. `pickChannel` picks the preferred channel from the person's
  contacts.
- **`markSent` / `recordSent` record a send; they do not dispatch.** They write a
  `reminders` row (idempotency ledger) and an `outbox` row (the human-readable
  record). Dedupe key `YYYY-MM-DD|channel|person|taskIds|daily`; the unique
  index on `reminders.dedupe_key` is the final duplicate guard.
- Live reminders are labelled honestly: "Copy & done" / "Mark as done", never
  "Sent", because a copy is not a send.
- **Last chased**: `lastChasedByName()` = newest Sent `outbox` row per
  lowercased recipient name, any channel. Shown on each reminder and feeds the
  automation cooldown.
- Snooze a person for today: `snoozePerson` / `unsnoozePerson`.

### Message format (`lib/outbox/gen.ts`)
- `buildReminder`: **no task code, no status words, keep priority**; includes
  the Description (`comments`) and Latest update, each one line clamped to 120
  chars; "⚠️" only when actually overdue; `due <date> · <priority>`.
- `buildSmsMessage`: one terse line. `buildEmailMessage`: plain text.
- `buildWhatsAppManualMessage`: the short 3-line wa.me "envelope" — **no
  markdown** (asterisks show literally in the wa.me compose box) and **no task
  list** (so the URL never grows with task count).
- `buildTaskSummaryWhatsApp`: the detailed per-task WhatsApp text, grouped by
  company (title, status · priority, due, overdue days, responsible, about,
  latest). `buildWhatsAppMessage`: the rich markdown version for Twilio.
- `buildTaskReminderDoc(name, tasks, {office, signoffName, note})`: the branded
  email doc (two stat tiles, one `items` block per company, "Open the tracker").
- ⚠️ **Don't pull admin-auth into `outbox/gen.ts`.** `generateDrafts` reads
  `v2.ownerName` directly via `sb`; `getOwnerIdentity` imports `server-only` +
  `next/headers` and breaks `gen.test.ts`.
- ⚠️ **wa.me needs international numbers.** Some are stored local
  ("0686…"). `waLink` normalises via `intlDigits()`: `+…`/`00…` kept, leading
  `0` → `255…`, bare 9 digits → `255…` (Tanzania default). Every wa.me path
  goes through `waLink` (`links.test.ts`). `smsLink` keeps raw digits.
- `waReminderLink()` now returns plain `${appBaseUrl()}/portal`: the signed
  `/r/<id>/<token>` landing card and its live-refresh endpoint were **removed
  26 Sept 2026** (the portal is where the tasks are, and it asks them to sign
  in). `/api/wa-card` (the signed summary image, HMAC via `verifyWaCardToken`)
  survives for Twilio's `MediaUrl`, and stays excluded from the proxy gate.

## Email: transport, signature, template

**Transport** (`lib/email/send.ts`, config `getEmailConfig()` in
`lib/settings.ts`): Gmail SMTP when `GMAIL_USER` + `GMAIL_APP_PASSWORD` exist
(the single `admin@oracle.co.tz` mailbox), else Resend. `SendEmailInput`
carries `fromName` (display name only), `fromAddress` (honoured on Resend only
— see `memory/emailwork.md`), `replyTo`, `attachments` (`encoding: "base64"`,
`cid`).

**Signature**: SMTP bypasses the Gmail web signature, so `withSignature()`
appends a footer centrally: `v2.emailSignature` text and/or
`v2.emailSignatureImagePath` image, **embedded inline by CID**
(`SIG_CID="cos-signature-image"`) — downloaded at send time, never a signed URL
that expires. Falls back to sender name + address when both are blank.
⚠️ **`SIG_MARKER` (`<!--cos-signature-->`) must match between `send.ts` and
`layout.ts`** — the template's footer starts with it so `withSignature` does not
double-sign. Template emails sign as an office, not with the free-text
signature or image.

**Template** (`lib/email/layout.ts`, `renderEmail(doc)`): email-safe HTML
(tables + inline styles, 600px card), pure and client-safe, unit-tested
(`layout.test.ts`). Blocks: `stats`, `section`, `items`, `list`, `text`, plus
`cta`, hidden `preheader`, header, footer, optional `note` callout (attributed
to `signoffName`). **Change the look here once and every email follows.**
- `EmailOffice` = director | manager | admin | compliance | hr | command →
  `OFFICE_LABELS` footer ("Director's Office", "Manager's Office", "Admin
  Office", "Admin Compliance Office", "Admin HR Office", "Oracle Consultancy").
  `hr` here is an email office, not a portal role.
- `senderName(office)` → the inbox display name: "OC Director's Office" / "OC
  Manager's Office" / "Oracle Consultancy" (command) / "OC Admin Office". The
  ADDRESS stays `admin@oracle.co.tz` on Gmail.
- Subjects: staff task reminders = **"Your Outstanding Tasks"**; the overdue
  safety net = "Your overdue tasks".
- ⚠️ **This template has no `<head>`**, so a `<style>` rule is dropped by Gmail.
  Nothing structural may depend on one, and no multi-column layouts (see
  `memory/event_attachments.md` for the Gmail case that proved it).

## The automation registry (`src/lib/automation/`)

- `types.ts` — `EmailCategory` (six), `RuleMode`, `AutomationConfig` (`paused`,
  send window `windowStartHour`/`windowEndHour` in EAT, `dailyCap`,
  `cooldownDays` default 2, `briefDay`, per-category mode). **Client-safe.**
- `meta.ts` — **single source of truth for presentation**: ordered
  `CATEGORY_META` → `CATEGORY_LABELS`, `NATURAL_MODE`, `labelForSource`.
  **Client-safe.**
- `config.ts` — `getAutomationConfig` / `saveAutomationConfig`; rebuilds
  `categories` strictly from known keys (drops stale ones).
- `runtime.ts` — EAT clock (`eatWeekday`), `withinSendWindow`,
  `alreadyRanToday`/`markRanToday`, `makeContext()` → `RunContext` with
  memoised `tasks()`/`brief()` and `sendToOwner`/`sendToPerson` (render `opts.doc`
  through `renderEmail`, plain text as fallback, `fromName = senderName(office)`).
  Defines `CategoryDef` (`scheduledToday()` + `run(ctx, mode)`).
- `categories/*.ts` + `registry.ts` — `REGISTRY` in this order:
  1. **`taskReminders`** — each person their open tasks, **Mon/Wed/Fri**. Runs
     FIRST so the shared cooldown stops `overdue` double-chasing the same day
     (at cooldown 0 both could send). Source `automation-taskreminders`.
  2. **`overdue`** — daily safety net for anyone still overdue; respects
     cooldown + cap; auto-sends log a Sent row (`automation-overdue`).
  3. **`renewals`** — document/permit renewal nudges (office compliance).
  4. **`directorBrief`** — the weekly brief to the owner on `briefDay`
     (`briefEmailDoc` in `director-brief.ts`).
  5. **`morningDigest`** — daily "your day" to the owner: 3 glance tiles
     (events · due today · overdue), then Today's events, Your reminders (to-dos
     with `remind_at`), Overdue tasks, Due today, Documents to renew. Returns
     nothing when there is nothing to say (no empty email).
  6. **`lifecycle`** — probation endings to the owner (office hr). It also reads
     `pendingLeave`, which is always empty now the Leave module is retired.
  (`boardPack` was removed with the board pack; there is no doc-request
  category.)
- `engine.ts` — `runDueAutomations()`: loop over `REGISTRY` applying pause →
  window → schedule → dedupe; per-category try/catch (a throwing category is not
  marked ran, so it retries). Called by `/api/cron/email` (06:00 UTC = 09:00
  EAT), Settings "Run now", and the Home control levers.
- `index.ts` — **server-only** public surface.
- ⚠️ **Client components import `@/lib/automation/meta` directly, never the
  index** — the index pulls server code into the browser bundle.
- **Adding a category = 3 edits**: a `CategoryDef` file, a `CATEGORY_META`
  entry, a key in `EmailCategory` (+ its place in `REGISTRY`). Settings, the
  snapshot and the Outbox labels pick it up.
- **Settings** (Automation group): the toggle list derives from
  `CATEGORY_META`; "How it behaves" (`setAutomationTuning`) exposes the window,
  daily cap, cooldown and brief weekday. Automation-origin drafts carry their
  category label in the Outbox; Sent rows are `message_type='AUTOMATION'`.
- Every automated external send is gated by `canAutoSend()`
  (`src/lib/guardrails.ts`), which AND-combines the automation pause, the
  `director.outreachPaused` kill switch and the per-channel auto-send setting,
  and fails closed on error.

## Manual and portal reminders

- **The one engine**: `sendTaskReminderEmail({ personId, taskId?, note?, sender:
  {office, name, title, replyTo, fromAddress, sourceTag} })` in
  `lib/reminders.ts` — loads the person + open tasks, builds
  `buildTaskReminderDoc`, sends, logs a Sent `outbox` row ("TASK REMINDER") that
  feeds the sent log and cooldown. Reasons: no-email / no-tasks /
  not-configured / not-found. Admin Outbox and portal both call it.
- **Portal** (`app/portal/actions.ts`): `portalSendReminderEmail`,
  `portalSendReminderWhatsApp`, `portalSendTaskSummaryWhatsApp`. Gated by the
  **`messageOnTasks` capability** (not a role check), the
  `director.outreachPaused` kill switch, and `personCanSeePerson` (managers:
  themselves or a direct report; directors: their scope). Office by role
  (director → `director`, manager → `manager`), `signoffName = me.name`,
  **Reply-To = the sender's own email** so a staff reply reaches them.
  `portalSendTaskSummaryWhatsApp` returns a wa.me link and logs a "TASK
  SUMMARY" draft. `waFromLabel()` gives "<name> · Director/Manager".
- **`components/notify-person.tsx`** (`<NotifyPerson>` — WhatsApp summary +
  Email summary): after creating a task in `director-task-form.tsx`, on the
  task quick actions, and in the portal Outbox list.
- **`/portal/team`** (`team/page.tsx`, `team-view.tsx`, `person-card.tsx`,
  `team-task-list.tsx`): one merged list of people, overdue-first, each with
  call · WhatsApp · email · profile icons and their open tasks inline ("Read all
  N"). The WhatsApp/email icons send the task summary / branded reminder when
  the person has open tasks, else open a blank chat / `mailto`.
- Portal roles are staff · manager · director · receptionist (the HR role is
  gone).

## WhatsApp
Manual wa.me deep-links are the live lane. **Twilio** (`lib/whatsapp.ts`,
`sendTaskReminderWhatsApp`) is wired but dormant: without `TWILIO_*` env it
returns `not-configured` and callers fall back to wa.me. Proactive messages
outside Meta's 24-hour window need a pre-approved template (Content SID).

## To-do reminders ("remind me")
**A reminder is a to-do with a `remind_at` time.** (`personal_reminders` was
dropped in migration 0080; `todos` gained `remind_at` + `pushed`.)
- Owner to-dos: `kind` NULL. A staff member's own: **`kind = "self"`** +
  `person_id` (kept out of owner lists). Journey steps stay
  `onboarding`/`offboarding`; note to-dos carry `note_id`.
- `runTodoReminders()` (`/api/cron/reminders`, daily 07:00 UTC, and every
  `/api/cron/tick`) pushes due ones — `kind self` → `person:<id>`, else →
  `admin`; a note's reminder opens that note — and marks them `pushed`
  regardless of device reach (no re-fire loop). Needs VAPID env + a device
  subscription.
- `src/lib/todo-reminders.ts`: `listOwnerTodos`, `listSelfTodos`,
  `dueTodoRemindersForPush`, `markTodosPushed`, `ownerReminderTodosDueBy`,
  `todoOwner` (ownership guard for the portal actions).
- ⚠️ **Client components may only `import type` from a lib that imports
  `@/db/supabase`.** A value import of a sort helper from `todo-reminders`
  once took Home down with "SUPABASE_SERVICE_ROLE_KEY is not set".
- ⚠️ **Don't run `router.refresh()` inside `useTransition` when `pending`
  disables the buttons** — on a heavy page `pending` stays true for the whole
  re-render and the next click is swallowed. Use a `busy` flag around the
  awaited action, refresh after it, and overlay optimistic adds/removes by id so
  nothing flashes back.

## The Report (Director Brief)

**`/brief` is no longer a page** (owner, 26 Sept 2026: it repeated Home; what
mattered was the PDF, its filters and the ways to send it). `/brief` redirects
to `/?report=1` keeping `period`, `co` (or legacy `company`) and `who`, and the
**Report panel** (`components/studio/report-sheet.tsx`, mounted once in the
Studio shell) opens itself. Open it from anywhere with
`window.dispatchEvent(new CustomEvent("cos:report", { detail: { companyIds,
personIds } }))` — Home's header, a company page and a person page do.

- Choose company · person · period → the four numbers the PDF leads with →
  **Download PDF · Email (PDF attached) · WhatsApp · Copy · Save as a draft**.
- Server side `src/app/report/actions.ts`: `reportOptions`, `reportSummary`,
  `emailReport` (renders `renderBriefPdf` and attaches it as
  `briefPdfFilename(b)`), `draftReport`, `reportRecipients`, and owner-only
  `addReportNote` / `deleteReportNote`. Owner = everything; a director is held
  to `resolvePortalBriefFilters` scope.
- **Notes** (`brief_notes`, `lib/brief-notes.ts`, owner only): hand-written
  "Admin & HR updates" that fall in the report window, company-tagged or
  portfolio-wide; they go into the text, the email and the PDF.
- **Portal**: the `directorBrief` capability (label "Report"; default manager +
  director) gates it. `components/portal-brief-filters.tsx` on the portal
  Profile builds the download URL for `/api/portal/brief-pdf`. **Scope is
  enforced in `src/lib/portal-brief-scope.ts`**: `portalBriefOptions(me)` builds
  the company + people lists from `companyScope(me)` (people via both
  `person_companies` and `people.company_id`), so a company-locked director
  never sees other companies' staff names; `resolvePortalBriefFilters(me,
  params)` re-resolves every query value and **drops** anything out of scope
  (falls back to their full scope — never honoured, never a 500), so a
  hand-edited link cannot widen the report.
- **The PDF** — `src/lib/brief-pdf.tsx` (@react-pdf/renderer), two routes one
  renderer: `/brief/pdf` and `/api/portal/brief-pdf`. Its traps (no shadows or
  gradients, `wrap={false}` clipping, tables flowing under the panel head) are
  in `CLAUDE.md`.
- **Weekly email**: `briefEmailDoc(b)` — stats → By company → Admin & HR
  updates → Delivered → Needs attention → Recommended director actions →
  Statutory deadlines → People; each section only when present.
  `sendDirectorBriefNow` (Settings) and `sendDirectorBriefToOwnerNow`
  (`director-brief-send.ts`) render the same doc.

### Filters (`src/lib/brief-links.ts` builds every link — keep it that way)
- **`?co=`** company, **`?who=`** person, **`?role=lead|working`** (only with
  `who`), **`?period=`** presets or `on:YYYY-MM[,YYYY-MM…]`.
- ⚠️ **`?company=` is RESERVED app-wide** for the global `CompanyDrawer`
  preview (`components/company-drawer.tsx` opens on it and deletes it on close).
  Never use it as a page's own filter — that is exactly what made the brief's
  company filter unusable. Files uses `?co=` / `?pe=` for the same reason.
- **Person = owns OR leads (accountable) OR is assigned.** Per-company KPIs are
  recomputed from the filtered rows. `peopleOptions` comes from the **active
  staff register**, not task assignees (assignee-derived lists resurrected
  archived leavers and hid people with no tasks). An archived `?who=` still
  filters.
- **Lead / working**: lead = `leadIds.includes(pid)`; working = assigned and
  not lead — a clean split, no double counting. ⚠️ **By the owner's explicit
  choice the lens narrows the PDF's contents but is ABSENT from its title and
  filename.** Do not "fix" this.
- Naming precedence (headline, PDF title, filename, share text, email subject):
  **person → company → brand**.
- **Months**: `periodRange` returns `ranges[]`; Delivered is tested against
  `ranges.some(...)`, not the outer span, so a skipped month is really skipped.
  Labels via `monthListLabel` ("June & July 2026"). `start`/`end` stay the outer
  span for the span-based signals (joiners, notes) — accepted.
- **A picked month scopes EVERYTHING**: a task belongs to month M if it existed
  by the end of M and was not closed before M began (`created_date` +
  `closed_date`; no history reconstruction). `historicOnly` (no picked month
  reaches today) also drops compliance, statutory deadlines and the week ahead.
  Presets are untouched (`monthScoped` gates it).
  **KNOWN GAP, disclosed to the owner:** a task live in June but closed in July
  appears in neither June bucket. The fix ("open = not closed by month end")
  was rejected because those rows would show their CURRENT status under "Open
  work". Awaiting his call.
- ⚠️ **Testing note:** section headings are CSS `uppercase`, so `innerText`
  returns them upper-cased — match case-insensitively.

## The notification bell

`createNotification` (`src/lib/notifications.ts`) writes the row and pushes;
it is also how event/meeting pings now reach people (kind `meeting`). The view
logic is **`src/lib/notification-view.ts`** — pure, client-safe, unit-tested,
and applied at READ time so old rows file correctly with no migration.
- Two lanes on the administrator (`needs-you` vs `activity`); portals render
  ONE plain list (activity would be ~94% of a staff bell). `notifSubject`
  promotes the body to the headline and demotes actor · verb · code · time to
  the meta line. `groupNotifications` folds repeats (12h window; infinite for
  recurring kinds).
- **Recurring items supersede**: `isRecurring` / `recurringKey` (ORI digests =
  actor ORI + no task; legacy daily "Your tasks" chat reminders).
  `createNotification` deletes prior rows with the same recipient + title first,
  and `purgeSupersededRecurring()` (morning-run) keeps only the newest per key.
  ⚠️ **A recurring title must stay COUNT-STABLE** — "4 staff quiet…" vs "3
  staff…" are different strings, so `recurringKey` strips a leading count and
  `recurringTitleMatch` returns a `like` match (`%staff quiet with open work`);
  keep the wording "N staff" for singular and plural.
- `checkQuietStaff` (`api/cron/ori-automations`) sends ONE roll-up per manager
  or director, like the owner's — not a row per quiet person.
- Only what you open is marked read (`markRead(recipient, ids)`), with an
  explicit "Mark all read". `purgeOldRead()` (morning-run) drops READ rows older
  than 14 days (`NOTIF_RETENTION_DAYS`); unread is always kept.
- ⚠️ **A panel portalled to `<body>` is outside the trigger's ref** — an
  outside-click handler must test the panel's own ref too, or every click inside
  it closes it.

## Not built / deferred
- True send-as a director's own address (see `memory/emailwork.md`).
- Real WhatsApp send (Twilio go-live, owner's account + templates).
- Branded template for Outbox DRAFT sends (`sendDraftEmail` still uses the
  plain `htmlBody`); the signature image in template emails.
- Delivered-vs-open gap for picked months (above).
