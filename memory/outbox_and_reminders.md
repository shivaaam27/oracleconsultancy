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

## Current Product Direction

The UI direction is a single "Messages" concept. The schema still has WhatsApp/email/SMS channels because real provider integration has not been chosen yet.

Do not add real dispatch casually. Phase 5c should choose one provider first, then wire send success/failure around `markSent`.

## Draft message format (updated)

`src/lib/outbox-gen.ts` `buildReminder` line format (owner request): **no task code, no status words, keep priority**, and now includes the task **Description** (`comments`) and **Latest update** (each on its own indented line, one-line clamped to 120 chars via `oneLine()`). Status wording is replaced by an "⚠️ " marker shown only when the task is actually overdue. Header counts open items + overdue. `taskMeta` = `due <date> · <priority>`. `buildSmsMessage` is ultra-short (no code/description, one line).

## Director Brief (planned)

**Admin & HR updates (operator notes)** (2026-06): the owner can hand-write narrative notes that aren't tasks — `brief_notes` table (`body`/`company_id` nullable/`note_date`/`created_at`/`created_by`, migration `0054`). `src/lib/brief-notes.ts` `listBriefNotes(range, companyId, names)` returns notes whose `note_date` falls in the brief window (same logic as Delivered), honouring the company filter (company-tagged notes show when that company OR portfolio selected; portfolio notes always show). Surfaced in three places: screen section `src/components/brief-notes-section.tsx` (add/delete inline, sits between Delivered and Recommended director actions), the PDF report (section "2b" between Delivered table and Open work by company), and `briefShareText` ("*Admin & HR updates*" block after Delivered). Server actions `createBriefNoteAction`/`deleteBriefNoteAction` in `src/app/brief/actions.ts`. `BriefData.notes: BriefNote[]`.

New feature: one-tap "share everything incl. closed tasks with the director", beautiful + glanceable. Decisions: default window = **this month**; format = **both** (in-app glanceable page + WhatsApp/Email text now, polished PDF after). Phases: 1 (DONE) outbox draft tweak above · 2 in-app Director Brief page (portfolio, incl. completed/closed this month: top-line stats, per-company strip, "Delivered" closed-tasks section, watch-list) · 3 (DONE) WhatsApp/Email/Copy share + Director Brief promoted to a primary nav tab · 4 (DONE) PDF via print: "PDF" button (window.print()) + @media print stylesheet in globals.css (remaps dark tokens to light, hides .fixed/.print-hidden chrome, strips glass/shadow) · 5 (optional) period filter / per-company / scheduled auto-send. Reuse `getAllTasks()` + `computeCompanyKpis`.
