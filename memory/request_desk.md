# Request Desk (staff service requests) — Phase 1

Built June 2026. A structured "ask" system so staff (and managers/HR/directors) raise
requests from their app instead of walking to the office. **Not chat** (it has a status
the owner can track + an on-record thread); **not a task** (it never clutters the task
register — when a request becomes real work it can later be converted to a task).

Owner's locked decisions (the four design choices):
1. **Decision flow** = Approve / Decline (with optional reason) + lighter Done / Needs info / Noted.
2. **Addressing** = ONE named person from the allowed list (or the owner). Not free-for-all.
3. **Categories** = suggested chips (Equipment, HR, Admin, Finance, Leave/Time, Feedback, Other) + free typing.
4. **Reach** = in-app only (notification bell + portal) for now; email/WhatsApp deferred.

## Data (migration 0081_foamy_penance — idempotent; had to guard todos drift with IF NOT EXISTS)
- **requests**: code (REQ-NNN), requester_id, addressee_id | to_owner, company_id, category,
  title, body, status, decision_reason/decided_by/decided_at, seen_at, **converted_task_id**
  (Phase-2 bridge), created/updated_at.
- **request_updates**: the thread. body, created_by (portal:/portal-mgr:/portal-hr:/portal-dir:/web-ui),
  kind (null = message, "event" = status/decision marker), deleted_at (soft-delete).
- **notifications.request_id** added; NotifKind gains `"request"`.
- Statuses: open → needs_info → approved/declined → in_progress → done; + noted (feedback) + cancelled.

## Who a staff member can address (`requestRecipientsFor` in src/lib/requests.ts)
Their manager (people.manager_id), any "also reports to" (reporting_lines), department head
(department_heads by dept+company), all HR (portal_role=hr), all directors (portal_role=director),
+ the owner option. Active only, self excluded, deduped. "Admin/HR" maps to HR role + owner.

## Files
- `src/lib/requests-shared.ts` — client-safe types + status labels/tones + REQUEST_CATEGORIES + requestAuthorName.
- `src/lib/requests.ts` (server-only) — recipients, raise/reply/decide/advance/cancel/seen, list (admin + portal), getRequestDetail, ownerPendingRequestCount. Authorisation lives in the action wrappers, not here.
- `src/app/portal/(app)/requests/actions.ts` — portal actions (re-verify session + participant).
- `src/app/requests/actions.ts` — owner actions (guarded by isAdminSession()).
- Components: `request-composer.tsx` (raise form), `request-list.tsx` (shared list, portal tabs To-me/I-raised/All + admin Awaiting-you), `request-conversation.tsx` (detail thread + Approve/Decline/Done/Needs-info + reply + withdraw; caps passed per surface, server actions injected as props).
- Pages: `/portal/requests` + `/portal/requests/[id]` (staff), `/requests` + `/requests/[id]` (owner inbox).
- Wired: nav.ts launcher entry (Requests, MessageSquareText), portal-pill Requests tab (all roles), notification-bell request routing + icon, notifications.ts createNotification/listNotifications request_id + push url `/requests/[id]` | `/portal/requests/[id]`.

## Notifications
Raise → addressee + owner (owner sees every new request). Reply → the other participant only
(no per-message spam to owner; owner has the inbox). Decision → requester.

## Auth / safety
- `/requests*` gated by the admin edge gate (src/proxy.ts — not in the matcher exclusions). `/portal/requests*` by the portal lock.
- Every portal action re-checks getPortalPerson() + that the signed-in person is the requester/addressee (loadParticipantRole). Owner actions re-check isAdminSession().
- Detail pages redirect non-participants. seen_at stamped when the addressee/owner first opens.
- Owner caps: reply always; decide only when to_owner; advance any (oversight); never cancel.
- Portal caps: requester can reply + withdraw; addressee can reply + decide + advance.

## Attachments (done)
- `request_updates.attachment_document_id` (migration 0082) → Document (category "Attachment").
- Opening photo/file: the composer has a file input; portalRaiseRequest uploads via createDocument+uploadDocumentFile, raiseRequest stores it as the first thread entry (`📎 <name>`).
- Served by `/api/portal/request-attachment?updateId=` (under api/portal so outside the admin gate; checks admin OR participant, signs the doc 300s). Rendered as a paperclip chip in request-conversation. (Reply attachments not wired yet — schema supports it.)

## Home signal (done)
`ownerPendingRequestCount()` → a command card in lib/signals.ts ("N requests awaiting you" → /requests, tone accent), shown on the command-centre Home alongside overdue/drafts/etc.

## Verified
tsc clean; full `next build` green; **live end-to-end tested** on the running dev server with a seeded request: admin inbox lists it ("Awaiting you 1", unseen dot), detail renders (body + thread + decision panel), **Approve** flips status→Approved, writes an "Approved" event, and notifies the requester (person:N). No console errors. Test data + temp scripts removed.

## ⚠️ Migration gotcha (important for future migrations)
The live DB's `drizzle.__drizzle_migrations` watermark (max created_at) is AHEAD of newly
generated migrations' `when` timestamps, so the Drizzle migrator **silently skips** new
migrations (`db:migrate` prints "Migrations applied" but does nothing). 0081+0082 had to be
applied by running their SQL directly against DATABASE_URL. Migrations were written
**idempotent** (CREATE TABLE/COLUMN/INDEX IF NOT EXISTS + DO-block guarded FKs) so direct
apply + any later migrator re-run are both safe. DATABASE_URL = the shared cloud Supabase
(port 5432), so applying directly fixed dev AND prod. After DDL, PostgREST schema cache
needed a reload (`NOTIFY pgrst, 'reload schema'` + ~a minute) before supabase-js saw the tables.

## Deferred (later)
- **Phase 2**: "turn this request into a task" button (converted_task_id column already exists); type-trend reporting; manager/director team roll-up; reply attachments.
- **Phase 3**: email/WhatsApp nudges + "still waiting" reminders (reuse Outbox + email-automation).

## Pushed to master June 2026 (owner asked to push online).
