---
name: inbound-email-plan
description: Inbound email automation — catch chosen emails, extract attachments/contents, file to person/company/task/document via the existing intake brain. Review-first, scheduled sweep, forward-to-COS path.
metadata:
  node_type: memory
  type: project
---

# COS System — Inbound Email Automation Plan

Sister project to the outbound comms work ([[project_outbound_comms]]). Where that
closed the "last mile" of *sending*, this closes the last mile of *receiving*:
chosen emails (and their attachments) get pulled into COS and filed to the right
person / company / task / document automatically, reusing the Smart Intake brain.

## Goal (owner's words)

"We've set email to go out — now automation to receive. Select specific emails I
get regularly and their contents, documents, images etc. get automatically pulled
to my site (the Inbox), then documented or filed to the right sections or tasks —
without me getting involved, later or in real time."

## Owner decisions (locked, 2026-06-11)

- **Filing mode = REVIEW EVERYTHING FIRST.** Caught emails land in `/inbox` as
  review bundles. **Nothing** is filed to a person/company/task/document until the
  owner approves. (Auto-file-trusted-with-undo is a *later* opt-in, not phase 1.)
  Matches the existing guardrail: "prepare drafts/suggestions only, no silent mutations."
- **Fetch timing = SCHEDULED SWEEP FIRST.** Poll Gmail every ~10–15 min using
  `historyId` so nothing is missed or double-counted. Real-time Pub/Sub push is a
  later phase, not the starting point.
- **Forward-to-COS path = YES, include it.** Besides automatic rules, the owner can
  forward any email (or apply a Gmail label) and it lands in `/inbox` for processing.
  Good for one-off items no rule covers.

## Reuse, don't duplicate

This plan adds almost no new *concepts* — it points existing machinery at the inbox:

- **Google connection** already exists (`src/lib/google.ts`, OAuth, refresh token in
  `settings` keys `google.refreshToken`/`google.connectedEmail`). We add the Gmail
  scope to that same connection — no new login/provider.
- **Smart Intake brain** already files docs to person OR company, fills blanks-only
  profile fields, recomputes compliance, reads PDF/image/Word/Excel + vision
  (`src/app/documents/actions.ts` extractDocumentFromFile, `src/app/people/actions.ts`
  enrichPersonProfile, `src/app/companies/[id]/actions.ts` enrichCompanyProfile).
- **`/inbox`** already supports bundles (pasted text + uploaded files in `attachments`
  JSON under the `inbox/` storage prefix) and a unified "Process" review queue.
- **`undo_tokens`** exists for the later auto-file phase.
- **`audit_log` / `system_events`** for the trail.
- **Recency-aware duplicate detection** (Keep both / Replace+archive) already in the
  doc flow — reuse so the same invoice arriving twice doesn't double-file.

## New pieces (kept minimal)

- **Gmail read layer** `src/lib/gmail.ts` — list/get messages, download attachments,
  track `historyId`. Graceful when unconfigured (mirror `getGroqKey`/`getGoogleStatus`).
- **Inbox rules** — new `inbox_rules` table + a simple Settings/Inbox screen. A rule
  matches on sender / subject keywords / attachment type / Gmail label, and sets the
  target (person, company, category, and whether to also draft a task).
- **Scheduled sweep** — a job (cron/route) that catches new matching emails since the
  last `historyId`, downloads attachments to `inbox/` storage, and creates a **review
  bundle** in `/inbox` (NOT committed). Reuses the existing intake extractor for a
  pre-filled suggestion the owner approves.

## Phases

### Phase 1 — Gmail connection (read scope)
- Add `gmail.readonly` (and later `gmail.modify` only if we want to label/archive
  processed mail) to the existing Google OAuth scopes in `src/lib/google.ts`.
- Settings → Google card gains a "Read inbox for filing" note + reconnect prompt
  (adding a scope needs one re-consent). Status banner shows it's on.
- `src/lib/gmail.ts`: authorised Gmail client, `listMessages(query)`,
  `getMessage(id)`, `getAttachment()`, helpers to parse from/subject/date/threadId.
  Graceful no-config fallback.
- **Done when:** owner reconnects, COS can list (not act on) recent matching emails.

### Phase 2 — Inbox rules + manual forward path
- `inbox_rules` table: `match_from` / `match_subject` / `match_has_attachment` /
  `match_label`, target `company_id` / `person_id` / `category`, `make_task` bool,
  `enabled`, `sort_order`. Migration + `src/lib/inbox-rules.ts`.
- Simple rules screen (Settings or an `/inbox` tab): add/edit/remove rules, plain-
  language preview ("From accountant@… → Oracle Consultancy · Finance · file document").
- **Forward-to-COS:** document a Gmail label (e.g. `COS-file`) the owner applies (or
  a forwarding filter); the sweep treats `label:COS-file` as a catch-all rule →
  bundle. (No inbound mail server needed — we read via Gmail API.)
- **Done when:** rules persist and the rules list shows what each will catch.

### Phase 3 — Scheduled sweep → review bundles (the core)
- A sweep entry point (cron job / protected route) every ~10–15 min:
  1. For each enabled rule, build a Gmail query; list new messages since last
     `historyId` (stored in `settings`).
  2. Download attachments to Supabase `inbox/` storage; capture body text.
  3. Run the existing intake extractor on each attachment/body → a **suggested
     filing** (owner=person/company, category, expiry, profile blanks, dedup check).
  4. Create a **review bundle** in `/inbox` ("3 emails caught — 2 invoices → Dar
     Spices, 1 passport → Shivam") with edit/approve/discard. **No commit yet.**
  5. Write an `audit_log`/`system_events` trace.
- Owner approves in `/inbox` → existing Process flow files the doc, fills blanks,
  recomputes compliance — exactly as a manual bundle does today.
- **Done when:** a real matching email auto-appears as a review bundle, approving it
  files the document end-to-end. (Verify on admin side.)

### Phase 4 — Email → task / reply drafts (dynamic value)
- A rule with `make_task` drafts a **task** (suggest-confirm) on approval, linked to
  the matched company, email body as description, sender captured. Thread-aware:
  replies attach to the same item rather than duplicating.
- Optional **Outbox reply draft** ("Acknowledged, filed under…") for one-tap send —
  never auto-sent (outbound already works via `lib/email`).
- **Renewals feed:** an insurance/licence email updates the matched document's
  expiry → flows into Home compliance/renewals signals.

### Phase 5 — Trust tiers + real-time (opt-in, later)
- Per-rule/per-sender **trusted** flag → auto-file with an `undo_tokens` token; a
  Home "inbox digest" ("COS filed 6 docs, drafted 2 tasks from email — review").
- "Always do this for emails from X" suggestion after repeated approvals → new rule.
- **Real-time push:** Gmail `watch` → Google Pub/Sub → COS webhook, replacing the
  timer for instant catches. More Google Cloud setup; only after the sweep is proven.

## Guardrails (inherit COS rules)
- **No silent mutations / no auto-send** — phase 1–4 always end in a review the owner
  approves. Auto-file (phase 5) is opt-in and always Undo-able.
- Blanks-only profile fill, always reviewed, never overwrites.
- Keep AI optional via `getGroqKey()`; degrade gracefully when Gmail/AI unconfigured.
- British English, plain language. Audit every filing.

## Open / to confirm later
- Whether to grant `gmail.modify` (to auto-label/archive processed mail) or stay
  read-only. Start read-only.
- Where the sweep cron runs (Vercel cron vs an external trigger) — decide at phase 3.
- prod Google OAuth client already live (`cos-system-one.vercel.app`); adding a scope
  needs re-consent with `admin@oracle.co.tz` (Internal consent).
