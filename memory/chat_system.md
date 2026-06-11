# Chat System (`/chat` + `/portal/chat`)

Free-standing messaging, separate from task `task_updates`. Built June 2026.

## Decisions (locked)
- **Participants**: everyone ↔ everyone (owner `"admin"` + every portal `"person:<id>"`). Same participant-string convention as `notifications` / `task_views`.
- **Threads**: `dm` (1:1, deduped by participant pair) and ad-hoc `group`.
  - **Group creation rights**: managers (`people.portal_role = 'manager'`) and the owner; PLUS auto-formed from a task's people (owner + assignees) on demand.
- **Transport**: Supabase **Realtime broadcast** (server broadcasts sanitised events to channel `thread:<id>`; clients subscribe). Broadcast — NOT `postgres_changes` — so **no Postgres RLS rework** needed.
  - Requires `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser Realtime socket auth). **Not yet in env** → realtime auto-activates once the key is set in `.env.local` + Vercel.
  - **Fallback**: `/api/chat/sync` stamp endpoint polled by `chat-realtime.tsx` (5–6 s), `router.refresh()` on change — mirrors `live-sync.tsx`/`/api/portal/sync`. Guarantees delivery even with no anon key / socket drop.
- **Content**: text + @mentions (reuse mention parser), file attachments (Supabase storage `chat/` prefix, `attachments` JSON like inbox bundles), task link (`task_code`), voice dictation (`voice-button.tsx`).
- **Retention**: keep messages forever (soft-delete only, like `task_updates.deletedAt`).

## Schema (migration 0047)
- `chat_threads` — id, kind, title (null for dm), companyId, dmKey (unique pair key for dm dedup), createdBy, createdAt, lastMessageAt, archivedAt.
- `chat_participants` — threadId + participant (PK both), role (member|owner), joinedAt, lastReadAt, mutedAt.
- `chat_messages` — id, threadId, sender, body, attachments(json), taskCode, createdAt, editedAt, originalBody, deletedAt.
- `chat_message_mentions` — messageId + personId (PK both).

## Messenger redesign (June 2026)

- **Mobile = full-screen app**: the surface is `fixed inset-0 z-50` under `md:` — page header AND nav pill hidden (pills add `hidden md:flex` on chat routes since an ancestor transform caps the overlay's z-index). Back button next to the avatar/name (thread → list → home). Safe-area padding top/bottom.
- **Desktop = two-pane glass card** (`md:` styles), nav pill stays.
- **Admin nav**: Chat is a primary pill tab (`top-pill.tsx`, also in `LENS_SLOTS`), removed from the HRMS launcher.
- WhatsApp/iMessage conventions: gradient per-name avatars, 5-min bubble grouping with tail on last-of-run, dotted wallpaper, date chips, single unified composer (auto-grow textarea, mic + send inside one bar, send button appears only when sendable).
- **Optimistic send** (pending bubble with clock icon, rollback to input on failure), **read receipts** (✓ sent / ✓✓ blue seen — from `chat_participants.last_read_at`, exposed on `ThreadDetail.participants[].lastReadAt`; `markRead` broadcasts a `read` event and `threadStamp` includes the latest read pointer), **typing indicator** (client→client `typing` broadcast on the thread channel, throttled 2s, 3.5s decay; socket-only, absent on polling), **inline image thumbnails** (signed-URL `<img>`, non-images stay file chips).
- `chat-realtime.tsx` is now a hook `useThreadChannel(threadId, {onChange, meName})` returning `{typing, sendTyping}`.
- New-chat/new-group dialog **portals to `<body>`** (the card's backdrop-blur is a containing block for `fixed` — would clip it) — bottom sheet on mobile, centred card on desktop; group flow has removable picked-avatar chips.
- **Realtime is ACTIVE**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sb_publishable_…) is set in `.env.local` — still needs adding to the Vercel project env.
- Type scale locked: 15px body/inputs, 13px previews, 12px meta, 11px ticks/badges.

## Layers
- `src/lib/chat.ts` — getOrCreateDm, createGroup, threadFromTask, listThreadsFor, getThread (hard `viewerInThread` gate), sendMessage, markRead, edit/softDelete, mute. Fires notifications + web-push (kind `chat`/`chat_mention`).
- Realtime broadcast: `src/lib/chat-broadcast.ts` (server → channel), `src/components/chat-realtime.tsx` (client subscribe + polling fallback).
- Admin: `/chat`, `/chat/[threadId]` + `src/app/chat/actions.ts`.
- Portal twin: `/portal/(app)/chat`, `/portal/(app)/chat/[threadId]` + actions; shared message-list/composer component so admin+portal don't drift (parity rule).
- Nav: Chat entry + unread badge on `top-pill.tsx` AND `portal-pill.tsx`.

## Parity / guardrails
- Honour portal accessibility toggles (reduced motion via `Reveal`, text-size/density).
- `HideOnPortal` already hides admin chrome; chat must not leak admin-only data to staff (only the task code they can already see).
- AI-off / realtime-off degrade gracefully (polling).
- See `memory/portal.md` twin map.
