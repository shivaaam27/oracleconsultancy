---
name: reminders-outbox-chat-push-jun2026
description: Live per-person Outbox, per-task reminders, chat system channels (Task reminders + Announcements), short push payloads, PWA logout fix, compact mouse-friendly pill — June 2026 sprint
metadata:
  type: project
---

# Reminders · Outbox · Chat · Push — June 2026 sprint

Multi-session rework of how reminders, the Outbox and notifications work, across
the staff portal AND the command centre. Shipped to master + deployed to prod
(Vercel **Hobby** plan — see cron note).

## Outbox — live, per-person (no stored draft clutter)
- The Outbox is **generated live per person** from current data each load; NOTHING
  is persisted as a draft. One card per person with their full open-task list +
  group-wise WhatsApp/Email send.
  - Portal: `src/app/portal/(app)/outbox/page.tsx` + `portal-outbox-list.tsx`
    (scoped via `managerTeamIds` for managers, group-wide for director/HR). Task
    rows link to `/portal/task/[code]`.
  - Command centre: `/outbox` already lived on `generateDrafts()` (`src/lib/outbox/gen.ts`).
- **Stopped persisting reminder drafts**: `portalSendTaskSummaryWhatsApp`,
  `portalRemindTask`, `adminRemindTask` no longer INSERT `outbox` rows — a send
  just opens WhatsApp / posts to chat. Killed the duplicate/"group-name" pile-up.
  One-off cleanup scripts: `scripts/clear-stale-reminder-drafts.ts`,
  `scripts/clear-test-reminders.ts`.

## Per-task vs all-tasks reminders
- Under a task: **This task / All tasks** toggle (portal task rows in
  `portal-tasks-command.tsx` `MemberActions`; the per-task page via `NotifyPerson`;
  command-centre `task-drawer.tsx` Remind button). 1 person → WhatsApp; the group
  ("Remind all") → posts to the task's group **chat** (`portalMessageTaskGroup`).
- Single-task reminders ALWAYS attach the signed per-person link (`waReminderLink`)
  so the WhatsApp preview card shows the recipient's whole open/overdue list.
- Names everywhere use `getGivenName` (no more "Hi Mr"): all builders in
  `outbox/gen.ts`, `NotifyPerson`, `MemberActions`, `task-quick-actions`,
  `director-message`, `wa-summary`, drawer toasts.

## Chat system channels (read-only, one-way, per person)
- Two `kind="system"` chat threads per person (NO migration — `kind` is free text,
  deduped via prefixed `dm_key` `sys:<kind>:person:<id>`). See `src/lib/chat.ts`:
  `getOrCreateSystemThread`, `postSystemMessage`, `SYSTEM_REMINDERS`/`SYSTEM_ANNOUNCE`.
  - **"Task reminders"** (bell icon) — daily reminders + auto pushes.
  - **"Announcements"** (megaphone) — published announcements mirror in (fan-out in
    `notifyAudience`, `src/app/announcements/actions.ts`), **silent** (the
    notification bell already pushed; don't double-buzz). Home feed unchanged.
- Pinned to top of chat, bot avatars, **read-only** (composer hidden +
  `isSystemThread` guard in the chat post actions). `chat-surface.tsx` widened to
  `ChatKind = "dm" | "group" | "system"`.
- **Chat sender bug fixed**: `threadFromTask` now adds the SENDER as a participant,
  so a director's group reminder also shows in the director's own chat list (was
  only visible to recipients).

## Daily task reminders cron
- `src/app/api/cron/task-reminders/route.ts`. Posts into each person's "Task
  reminders" channel; reuses the chat push pipeline (pushes to anyone subscribed).
- **Schedule = `0 6 * * *` (09:00 EAT, all open tasks)** — Vercel **Hobby allows
  only daily crons**; `0 6,11,16` (9am/2pm/7pm) is REJECTED and FAILS THE BUILD.
  The route's slot logic (`urgentOnly = hourUtc >= 9`) already adapts if moved to
  `0 6,11,16` on Pro (morning = all; later = overdue/due-today only).

## Push notifications
- **Short push payload separate from the full chat body**: `sendMessage` /
  `postSystemMessage` take a `push: {title, body}` override (used by the reminder
  cron) so OS notifications never truncate. Plumbed through `notifyParticipants`
  in `src/lib/chat.ts`. The chat message keeps the full rich list.
- **All chat messages already push WITH content** (`createChatNotification` →
  `sendToRecipient`, body sliced to 140). Push is **opt-in per device** (browser
  permission + a `push_subscriptions` row) — it CANNOT be silent/automatic. If
  someone only gets the in-app bell, their device isn't subscribed.
- VAPID is configured in prod (3 keys set on Vercel). New
  `src/components/portal-notify-prompt.tsx` (mounted in the portal layout)
  proactively nudges staff to enable notifications (was buried in Profile).

## Portal nav pill + bell polish
- Portal pill made compact like the command-centre pill: **icon tabs, only the
  active tab labelled** (`portal-pill.tsx`). The tab row is mouse-navigable on web
  (`useDragScroll`: vertical wheel → horizontal scroll; click-drag pans; a drag
  suppresses the click).
- Notification bell rows **rest half-swiped on touch** to reveal the Clear action
  (`notification-bell.tsx` NotifRow `peeked`/`PEEK`); first touch hands back to
  the normal swipe; desktop keeps hover-✕.

## PWA logout on app-kill
- Portal (and admin) session cookies now set an explicit **`Expires`** date, not
  just `Max-Age` — installed PWAs drop Max-Age-only cookies as "session" cookies
  when swiped from recents. `src/lib/portal-auth.ts setSessionCookie`,
  `src/lib/admin-auth.ts setAdminCookie`, both refresh paths in `src/proxy.ts`.
- If logout STILL happens post-deploy, the OS is wiping the PWA storage container
  entirely → next step would be a durable client re-auth token (not yet built).

## Deploy / Vercel ops
- **Account is Hobby** (not Pro — earlier assumption was wrong). Only daily crons.
- Auto-deploy had stalled because the 3×/day cron failed every build since the
  commit that added it; fixed by reverting to daily. `VERCEL_TOKEN` saved in
  `.env.local` (git-ignored) for direct `npx vercel deploy --prod --token …`.
- Project link: `team_8vukVLA1Z5jEB88kHvUvlkgU` / `prj_jkYjtAnKHIsQr0n2PrKqsEiwKukl`.
