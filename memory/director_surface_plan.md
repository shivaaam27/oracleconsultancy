---
name: director-surface-plan
description: "Full product spec for the Director login + read-only board view (Phase 7 of the person-record plan). Reuses the staff-portal auth; directors get a board, can issue directives, cannot edit operational data. Not built yet — spec for approval."
metadata:
  node_type: project
---

# Director Surface — Full Plan (Phase 7)

A board-level login for directors. **Reuses the staff portal** (`/portal`, `cos_portal`
cookie, `portal-auth.ts`, scrypt password on `people.portal_password_hash`) with a new
`portal_role = "director"`. Directors land on a **read-only board**, can **issue directives**
to the owner, and **cannot change any operational data**. Not built yet.

## 1. Persona & goals
A director sits on the board of one or more of the 7 companies. They want, in 30 seconds:
"Is the group healthy? What needs my attention? What's the exposure (compliance, leave
liability, overdue risk)?" — and the ability to **leave a directive** without phoning the owner.
They are NOT operators: no task management, no approvals, no staff data drill-down.

## 2. Access lifecycle (reuses Settings → Staff portal access)
- **Grant:** owner picks a person, sets role **Director**, sets a password. (Adds `director`
  to the existing `staff | manager` role picker.)
- **Sign in:** `/portal/login` (same screen). Director role → routed to `/portal/board`.
- **Revoke:** immediate (portal re-checks DB each request), same as staff.
- **Self-service:** change own password + sign out (reuse portal account controls).
- **Dual role:** `portal_role` is a single value; a person is staff OR manager OR director.
  If someone genuinely needs both, that's a later decision (v1: director is director).

## 3. Scope model (DECISION NEEDED)
- **A (recommended):** board scoped to the director's companies = primary `company_id` +
  `person_companies` associations. A director with **no** links = group-wide (all 7).
- **B:** every director sees the whole group.
- Enforced **server-side** (never trust the client). Requires extending `getBrief` to accept a
  **set** of company ids (today it takes one or null=all), or aggregating per company.

## 4. Capability matrix

### CAN — view (read-only)
- **Group board:** headline KPIs — headcount, portfolio compliance %, open/overdue/critical
  risk count, **leave liability (cost)**.
- **Company health:** each in-scope company with a Good/Watch/Risk score + key numbers.
- **Compliance & statutory:** below-full-compliance count (+ named, per decision), expiring/
  expired documents, statutory deadlines (BRELA/TIN/NSSF/etc.) with days-left.
- **People signals:** joiners, on-leave-today, probations ending, birthdays (named per decision).
- **Key risks:** overdue/critical task **titles + company** (NOT the conversations).
- **Recommended actions:** the existing `directorActions` (task/compliance items needing
  director attention, with urgency).
- **Period filter:** this month / last month / quarter / year (reuses Brief periods).
- **Org chart:** read-only group/company structure (phase 7d).
- **Own account:** change password, sign out.

### CAN — light, safe actions (the "what they can DO")
- **Issue a directive / note:** a short instruction or comment → stored via the existing
  `brief_notes` (tagged `director:<Name>`). The **owner sees it on `/brief`**. This is the
  director's lever — guidance without editing operations.
- **Acknowledge / "Reviewed as at <date>":** a lightweight stamp recording the director has
  reviewed the board (reassures the owner; small audit record). Optional.
- **Export / print a board pack (PDF):** the board as a clean one-pager for their own meeting
  (reuses the Brief's print styles).
- **(Optional) Request a report:** one-tap "ask the office for X" → a note/task for the owner.

### CANNOT (hard guardrails)
- Create / edit / delete **any** operational data — tasks, people, documents, leave, assets.
- Approve leave, verify compliance, change statuses, or move anything.
- See **individual salaries / wages** (only the aggregate leave-liability cost).
- Open staff **task conversations, chat, messages, or document files**.
- Reach **admin** routes or any company **outside their scope**.
- See other staff's personal data beyond board-level signals.

## 5. Screens
1. **Board home `/portal/board`** — KPI tiles → company-health list → compliance & statutory →
   people signals → key risks → recommended actions → "Leave a directive" composer →
   period filter + "Export pack".
2. **Company view (drill-down)** — tap a company → its scorecard (compliance, statutory,
   risks, people signals) for that company only. (Phase 7b/d.)
3. **Org chart** — read-only (phase 7d).
4. **Account** — password + sign out.

## 6. Navigation & routing (role-based)
- Director role: portal nav shows **Board** (+ Account); the staff **Home/Activity/Profile/Chat**
  tabs are **hidden**.
- `(app)` layout + middleware: director role → allow `/portal/board`, `/portal/account`;
  **redirect** `/portal`, `/portal/task/*`, `/portal/chat`, etc. to the board.
- Twin/parity: build on `surface-kit` + `Reveal`; honour the portal accessibility/motion toggles.

## 7. Security & privacy (the important part)
- **Server-side scope + field stripping:** the board payload is built on the server, filtered to
  the director's companies, with **no wage/salary fields** ever included.
- **Read-only by construction:** no mutating server actions are exposed to the director routes
  except the two safe ones (directive note, acknowledge), each re-verifying `portal_role` +
  scope server-side.
- **Revocation:** every request re-checks the DB; revoke is instant.
- **No URL-guessing:** company drill-down re-checks the company is in scope on the server.

## 8. Data reuse (no new engines)
- `getBrief(now, period, companyScope)` — extend to a company-set for scope. Already provides
  headcount, compliance, statutory, HR signals, company risk, director actions, leave liability.
- `buildCompanyRequirementScores` / `buildPersonRequirementScores` — compliance.
- `portfolioLeaveLiability` — cost (built).
- `brief_notes` + `createBriefNoteAction` — directives.
- `/hrms/org` data — org chart.

## 9. Edge cases & failure modes
- Director with no associations → group scope (or friendly "no companies linked — ask admin").
- In-scope company with no data → calm empty states (not blank).
- Period with no activity → "Nothing this period" states.
- Session revoked mid-use → next action blocked + redirect to login.
- Mobile: board must read well on a phone (full-screen, like the staff portal).
- A director who is also operationally a manager: v1 picks one role; flag if needed.
- Printing: the pack must exclude interactive controls.

## 10. Phased delivery (with acceptance)
- **7a MVP:** `director` role + Settings grant + Board page (group scope) with KPIs + company
  health + compliance/statutory + risks + leave liability + recommended actions + role-based
  routing/nav. *Accept:* a director logs in, sees the board, **cannot** reach staff pages, sees
  **no** salaries, **cannot** edit anything.
- **7b Scope:** board limited to the director's companies. *Accept:* a director linked to 2
  companies sees only those; scope enforced server-side.
- **7c Directives + acknowledge:** leave-a-directive composer (→ owner's `/brief`) + "Reviewed
  as at" stamp. *Accept:* a director note shows on the owner's Brief; review recorded.
- **7d Org chart + period filter + print pack + mobile/parity polish.**
- **7e (optional):** director notifications / scheduled board digest.

## 11. Out of scope (v1)
Editing operations; per-director custom dashboards; salary visibility; two-way messaging;
email auto-send to directors (digest is 7e, optional).

## Decisions made (owner, this session)
- **Director = OPERATOR** (board + create tasks/events/meetings + send messages), not read-only.
- **Scope = group-wide (ALL 7 companies)** for director actions.
- **Email automation: YES.** WhatsApp automation: YES (needs a provider — see below).

## REALITY CHECK on "send" (verified in code)
- **Email send is ALREADY BUILT** (`src/lib/email.ts`): real dispatch via **Gmail SMTP**
  (`GMAIL_USER`+`GMAIL_APP_PASSWORD`) OR **Resend** (`RESEND_API_KEY` + DNS-verified domain),
  resolved by `getEmailConfig()`. Calendar **events already send invites** + draft reminders/
  follow-ups (`sendEventInviteAction`, `draftEventRemindersAction`). Outbox can **actually send**
  email drafts via the provider. → Email automation just needs (a) the env credentials switched
  on, and (b) a **rules/scheduler layer** + director access. NO new send engine required.
- **WhatsApp is NOT built** — only `wa.me` deep-links (a human taps send). Real WhatsApp needs a
  **Business Solution Provider** (Meta Cloud API direct, or Twilio/360dialog), a registered
  WhatsApp Business number, **pre-approved message templates**, and **per-message cost**. Owner
  must procure the account; then integrate it the same way as `email.ts`.

## Owner setup checklist (blocks the "real send" phases)
- **Email (to enable now):** set in Vercel env either `GMAIL_USER`+`GMAIL_APP_PASSWORD`
  (easiest — sends as admin@oracle.co.tz) OR `RESEND_API_KEY` + a DNS-verified sending domain.
- **WhatsApp (E4):** open a Meta WhatsApp Business / Twilio account, register a number, get API
  credentials, and approve message templates. Confirm budget for per-message fees.

## Executive-operator build phases (supersedes the read-only phasing above)
- **E1 — Operator role + scoped creation.** 🔶 role + board + task-create DONE; events/meetings next.
  - [x] `portal_role = "director"` (portal-auth.ts `PortalRole`; Settings role picker + setPortalAccess).
  - [x] **Director board** `/portal/board` (`board/page.tsx`): KPI tiles (headcount / overdue /
    at-risk companies / leave liability) + recommended actions + company health + compliance +
    key risks. Reuses `getBrief(month, null)` (group). Directors auto-redirect here from `/portal`;
    header reads "Director board".
  - [x] **Create & assign tasks group-wide** — `portalDirectorCreateTask` (any company, any active
    person; stamped `portal-dir:<Name>`; pinned instruction; notifies assignees + owner bell;
    audit-logged). `director-task-form.tsx` on the board. Verified: cross-company assignment works.
  - [x] **Create calendar events / meetings** — `portalDirectorCreateEvent` (director-gated
    wrapper over the proven `createEventAction`: attendees, `.ics` invites, reminders,
    recurrence, meet link). `director-event-form.tsx` on the board ("New event / meeting":
    title, all-day/start/end, company, location/meet link, attendee chips, 1-day reminder, notes).
  - [x] **Download the Director Brief as PDF** — "Download PDF" button on the board (`PrintButton`
    → `window.print()`). The full detailed brief is emitted via the shared
    `components/brief-print-report.tsx` (extracted print-only layout: cover + exec summary + stat
    cards + detailed report-body, identical to the admin `/brief` PDF). On the board it's wrapped so
    all live chrome is `print-hidden`; the shared portal `<header>` is now `print-hidden` too.
  - [ ] Role-based nav pill (hide staff Home/Activity/Profile for directors) — minor; deferred.
  - **E1 complete** for the core operator powers (board + assign tasks + schedule events + brief PDF).
- **E2 — Messages as drafts + governance.** ✅ DONE.
  - [x] `portalDirectorDraftMessage({personId, channel?, body, taskCode?})` — creates an **Outbox
    draft** (owner-visible, `source: portal-dir:<Name>`) + returns a **one-tap deep-link**
    (`wa.me`/`mailto:`/`sms:` via `outbox-links`). Channel auto-picks; logged to `system_events`
    (`portal.director.message`). Default recipient = a task's assignee (quick-reminders); the
    director can also pick any active person + channel.
  - [x] `director-message.tsx` on the board: "Send a message" composer + "Remind {assignee}" chips
    for each overdue task (board resolves overdue-task assignees server-side).
  - [x] **Governance kill switch:** Settings → "Director outreach · Pause/Resume" (`setDirectorOutreach`
    → settings key `director.outreachPaused`, checked in the action). Plus the hard kill switch =
    revoke portal access (instant). Verified: draft + deep-link + outbox tag.
- **E3 — Email automation (needs email env on).** Turn on the provider; auto-send low-risk
  emails on triggers (overdue task, doc expiry, probation, pending leave) + scheduled board/
  team digests, via a **rules + scheduler** layer on the existing cron. Hybrid: auto low-risk /
  draft the rest. Reuses `email.ts` + Outbox.
- **E4 — WhatsApp automation. ✅ NOW ON TWILIO (sandbox proven, 2026-06-16).** Switched off Meta's
  direct Cloud API to **Twilio** (Twilio still rides on Meta/WhatsApp but does the paperwork). Owner
  picked Twilio explicitly ("not Meta's route").
  - [x] `src/lib/whatsapp.ts` — **rewritten for Twilio** `sendWhatsApp({to, text?, template?})`,
    same interface so all callers unchanged. Env: **`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
    `TWILIO_WHATSAPP_FROM`** (E.164; [+ `TWILIO_DEFAULT_CONTENT_SID` / `TWILIO_DEFAULT_LANG`]).
    POSTs form-encoded to `api.twilio.com/.../Messages.json` (Basic auth). Free text → `Body`;
    template → `ContentSid` (the `template.name` arg = Twilio Content SID `HX...`) + numbered
    `ContentVariables`. Degrades to not-configured (callers fall back to wa.me). `whatsAppConfigured()`.
    **Proactive sends outside the 24h window MUST use an approved template; free text only in
    sandbox / inside an open 24h session** (Meta's rule, enforced via Twilio).
  - [x] **SANDBOX TESTED END-TO-END (2026-06-16):** creds in `.env.local`, `From=+14155238886`
    (shared sandbox), test to `+255686450999` returned status `read`. ✅
  - [x] Settings → Messaging = `WhatsAppStatus` component (`settings/whatsapp-test.tsx`) with a
    self-serve **Send test** box; action `sendTestWhatsApp` in `settings/actions.ts` (mirrors
    `sendTestEmail`). Shows on/off via Twilio.
  - [ ] **Owner GO-LIVE (blocks production proactive send):** Twilio business verification +
    register a WhatsApp sender (own number, e.g. `+15722294220` once approved) + approved
    **Content templates** (`HX...`). Then set the 3 Twilio env vars in **Vercel** (swap sandbox
    `From` for the real number; optionally `TWILIO_DEFAULT_CONTENT_SID`).
  - [ ] **E4b (after live creds+templates):** wire Outbox/director-message + automation to call
    `sendWhatsApp` with the right Content SID; variable mapping; delivery status.
  - Guide for the owner: **`TWILIO_WHATSAPP.md`** (repo root) — Stage 1 sandbox / Stage 2 live.
- **E5 — Director-defined "if-this-then-that" rules** on top of the engine.

## Governance (non-negotiable for an operator)
Scope enforced server-side; every task/message/automation stamped + audit-logged + owner-
visible; owner override + global kill switch (reuse AI-master-switch pattern); director can
create work & communicate but CANNOT delete people, change settings, or see individual salaries.
