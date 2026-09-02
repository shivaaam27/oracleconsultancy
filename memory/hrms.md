---
name: hrms
description: "HRMS hub and its registries (OECR stock, OCR cleaning) — structure, build status, and the agreed phase plans"
metadata:
  node_type: memory
  type: project
---

# HRMS — Registries hub

`/hrms` is a **hub of registry cards** (`src/components/hrms/registry-card.tsx`, live stats). Click a card to open that registry's full page. Built so adding another registry later = add a card + a page under `/hrms/<abbr>`. Reached via the nav pill "More" sheet (Package icon). Sub-pages use a back-link to `/hrms`.

```
HRMS (hub) ─┬─ [Card] OECR · Office Equipment Control Registry → /hrms/oecr
            ├─ [Card] Asset & Vendor Register                  → /hrms/assets  (V3)
            ├─ [Card] Leave & Attendance                       → /hrms/leave   (V3)
            ├─ [Card] OCR  · Office Cleaning Registry          → /hrms/ocr
            ├─ [Card] Companies → /companies   (moved into HRMS)
            ├─ [Card] People    → /people      (moved into HRMS)
            └─ [Card] Documents → /documents   (moved into HRMS)
```

**V3 registries added** (full plan + status in `memory/v3_plan.md`):
- **Asset & Vendor Register** (`/hrms/assets`): segmented Assets/Vendors toggle. Assets = durable equipment assigned to a person or shared to a company+custodian (auto-returned on offboarding), linked to its supplier vendor. Vendors = suppliers/contractors whose contracts reuse the Documents engine (`documents.vendor_id`). `src/lib/assets.ts` + `src/lib/vendors.ts`.
- **Leave & Attendance** (`/hrms/leave`): tabs Overview/Requests/Setup. Leave requests/approvals + public-holiday calendar, ELR-Act-2004-accurate (Mon–Sat working days; Annual 28/12mo, Sick 126/36mo = 63 full+63 half), derived balances. Attendance daily register = phase 4.2 (pending). `src/lib/leave.ts`.
- The **person record** gained HR profile fields (DOB, nationality, ID/passport no, address, emergency contact, probation), a per-person document-compliance checklist, and onboarding/offboarding journeys (todos tagged `kind`).
- Also in the launcher (not HRMS cards): **Letters** (`/letters`) + **Company Letterheads** (`/letterheads`) — system-wide branded PDF letters; see `memory/letters.md`.

**Nav move (owner decision):** Companies, People and Documents now live **only** under HRMS as cards (live stats). They were removed from the bottom nav pill — the dedicated **Companies tab** (and its long-press company switcher, `CompaniesNavTab`) was deleted from `top-pill.tsx`, and **People + Documents** were removed from the "More" sheet. The pages/routes themselves (`/companies`, `/people`, `/documents`) are unchanged — only the way in moved. `TopPillServer` no longer fetches companies.

**HRMS promoted to a primary nav tab** (briefcase icon) — main pill is now: Home · Task Management · Workbook · **HRMS** · More · Search (HRMS also a lens slot). HRMS removed from the More sheet. The nav-pill page "+" action icon is now **unified system-wide** (`navIcon()` always renders `Plus`, regardless of each page's own action icon); per-action icons still show in the multi-action dropdown.

**HRMS tab popup** (`HrmsNavTab` in `top-pill.tsx`, modelled on the old CompaniesNavTab): a **tap/click goes straight to the dashboard `/hrms`**; **press-and-hold (touch) or hover (desktop)** reveals a popup of the registries (Dashboard, OECR, OCR, Companies, People, Documents) — release-to-select on touch, or tap one. Mouse uses hover+click (no long-press); touch uses long-press.

### Surface "description/notes" across read views (DONE)
Owner wanted the standing description/notes (not just the latest update) visible everywhere, not buried in Edit. Display-only — `comments`/`notes` were already loaded.
- **Tasks** — `comments` is the Description: shown in popups (peek+drawer via `TaskContext`), a callout on `/task/[code]`, and a clamped line on cards (mobile `TaskCard` 2-line, desktop table 1-line, board 2-line, calendar day-list 1-line). Order: Description first, then Latest update.
- **People** — `notes` shown as a clamped line on person cards and in the long-press peek (drawer already had a Notes block).
- **Documents** — `notes` shown as a clamped line on list rows (peek already had it).
- **Placeholder filter** — `src/lib/notes-display.ts` `displayNote()` hides the auto-generated "Auto-captured from Accountable column…" note from people card/peek.
- To-dos and Companies have no notes/description field — nothing to surface.

### Improvements plan (in progress)
Agreed phased plan after the nav move: **1 (DONE)** HRMS nav tab + briefcase icon + unified "+". **2 (DONE)** Smart breadcrumbs — `src/components/hrms/hrms-crumbs.tsx` (`HrmsCrumbs from={searchParams.from}`): always "‹ HRMS", plus "‹ CODE" when `?from=task:CODE`. Added to `/people`, `/companies`, `/documents`, and `/companies/[id]` (replaced its hardcoded "Task Management" back-link). Task detail page **and** the task drawer link to the company with `?from=task:${code}`. **3 (DONE)** People deactivate — individual (Deactivate/Restore in the long-press peek, via `togglePersonActive`) **and bulk** (a "Select" mode in `people-table.tsx` with per-row checkboxes, Select-all, and a floating Restore/Deactivate bar; bulk action `setPeopleActive(ids, active)` in `people/actions.ts`). Soft only (`people.active`) — no hard delete. **3** People deactivate — individual + **bulk** (decision: deactivate only, no hard delete; built on `people.active`). **4 (DONE)** Documents capture unified — `document-form.tsx` now has one "Add the document" panel with a `Segmented` Upload · Link · Paste text. Upload (one `name="file"` input) both stores AND AI-reads (`runExtractFile`); Link is `fileUrl` (reference only); Paste text feeds `runExtract`. Inputs stay mounted across tabs (no data loss). Removed the old scattered "File link" + "Upload file" grid fields and the duplicate extract-only file input. **5 (DONE)** Documents smarter AI reading + overflow-to-Notes. `extractPrompt` (shared by text + vision paths in `documents/actions.ts`) now tells the model the input may be a scan, phone photo, faded/old/dirty page, handwritten/rough notes, angled or mixed-language (EN/SW) — transcribe uncertain text rather than dropping it. Added a `notes` key to the extraction JSON/`ExtractedFields` for "anything that doesn't fit a field"; `coerceFields` parses it; `document-form` `applyFields` **appends** it to the Notes box (no overwrite/dup). Still honours `getGroqKey()` (AI-off → rules path, no notes). Vision model is `llama-4-scout`. **Scanned/image-only PDFs are now handled**: `documents/actions.ts` `extractDocumentFromFile` falls back to `renderPdfPages` (unpdf `renderPageAsImage` + **`@napi-rs/canvas`**, width 1400, ≤2 pages, ~4MB/image cap) and reads the rendered images with the vision model (`groqVision` shared by images + scanned PDFs). `@napi-rs/canvas` added to deps and to `serverExternalPackages` in `next.config.ts`. Verified the renderer runs inside the Next runtime. Only falls back to "upload a photo" if rendering genuinely fails or AI is off.

Shared bits: `src/components/hrms/hrms-dialog.tsx` (drawer), design uses the standard `ui.tsx` primitives + tokens (no Excel styling). British English. Currency = **TZS** (`fmtMoney` in `stock-shared.ts`).

### Documents & Compliance — overview upgrade (DONE)
Owner asked to evolve `/documents` in place but apply the modern pop-up design language. `compliance-score-panel.tsx` rebuilt: a glass hero card with an SVG **portfolio ring** + soft accent glow + four stat tiles (Missing/Expired/Expiring/All clear); a glass **segmented Companies⇄People toggle** (with per-scope attention-count badges) showing the **full** owner list worst-first (not the old top-4), each row with a tone-coloured mini progress bar + gap preview, healthy owners tucked behind a collapsible "N all clear". The detail pop-up now uses the shared **`EntityDrawer`** shell (status-tinted hero glow + its own ring, single Detail tab, sticky action bar) so it matches the company/person drawers. Deep-link helpers (add-doc / prepare-pack) unchanged.

**Phased roadmap for `/documents` (agreed):** P1 compliance overview+detail drawer — **DONE**. P2 table & status polish — **DONE** (status summary now has 5 filter chips incl. **Valid** + **No expiry** with live counts; active chip toggles back to All; list/empty cards lifted to `rounded-3xl`). P3 needs-attention worklist — **DONE** (`needs-attention-panel.tsx`, placed between compliance panel and table): one prioritised portfolio-wide queue — expired (most-overdue first) → expiring → missing-required (from compliance gaps), with All/Expired/Expiring/Missing filter chips + count, inline **Renew** (company docs, `renewDocumentAction`) / **Add** (missing, deep-link) / **View** (person/company-less docs) actions, capped to 8 with "Show all N", calm empty state. P4 group + expiry-timeline table views — pending. P5 bulk actions (select-mode archive/restore/renew, mirror People) — pending. P6 refresh the two "Manage…" template dialogs onto the `EntityDrawer` shell — pending. P7 per-company compliance PDF/CSV export — pending.

Mobile fix (shared, app-wide): `PageHeader` in `ui.tsx` now stacks (`flex-col` → `sm:flex-row`) so wide page-action buttons drop below the title on phones instead of crushing the title/sub-line. Verified no horizontal overflow at 375px on `/documents`.

Note: open_issues "Documents AI can't read Word/Excel" is **stale** — `documents/actions.ts` `extractOfficeText` (mammoth + xlsx) already reads .docx/.xlsx/.xls/.csv.

---

## OECR — Office Equipment Control Registry (`/hrms/oecr`) — COMPLETE

Office equipment/stationery stock. Ported from a reference "stationery stock control" file. Mirrors the Excel rule: **current stock = opening + purchased − issued**, derived at read time (never stored). Tabs via `HrmsShell` (Segmented, URL-synced `?tab=`): Dashboard / Register / Purchases / Issues.

- Data: `stock_items`, `stock_purchases` (IN), `stock_issues` (OUT, tagged to one of the 7 companies). See `database_schema.md`.
- Logic: `src/lib/stock-shared.ts` (source of truth) + `src/lib/stock.ts` (Supabase) + `src/app/hrms/actions.ts`.
- UI: `stock-dashboard.tsx`, `stock-register.tsx`, `stock-movements.tsx`.
- Features: dashboard (health stat cards + value roll-up + "needs attention"), register (search, add/edit item drawer, expandable detail, archive **and** delete), purchases & issues (history + record drawers, **negative-stock guard** with "Issue anyway" override). Movements support **edit + delete** (simple, no reverse-entry trail — owner's call for stationery).

### Build phases (all done)
1. Data layer + maths. 2. Page shell + nav. 3. Dashboard. 4. Register + TZS. 5. Purchases & Issues. 6. Simple edit/delete + hub restructure (OECR rename, OCR card).

### Remaining OECR ideas (optional, not requested)
Per-company filtering; low-stock surfaced on Insights/Overview; voice capture / Ask COS awareness.

---

## OCR — Office Cleaning Registry (`/hrms/ocr`) — Phases 1–2 done

Digital version of the paper "Oracle Office Cleaning Register" (daily checklist). **One shared HQ register.** Decisions locked: sign-off = **tap-to-confirm + name** (from People); attendance = **picked from People**; **single shared register** (not per-company).

- Data: `cleaning_areas` (editable columns, seeded from the sheet), `cleaning_days` (one per date), `cleaning_checks` (per-area tick + time + comment). See `database_schema.md`.
- Logic: `src/lib/cleaning-shared.ts` (derived completion % + day status) + `src/lib/cleaning.ts` (`ensureDefaultAreas`, `ensureDay`, `setCheck`, `signDay`, …) + `src/app/hrms/ocr/actions.ts`.
- UI: `src/components/hrms/ocr-today.tsx`.

### Build phases
1. **DONE** — Data layer + areas; OCR card live; areas list page. 12 areas seeded (Reception … Outside Area, incl. "Daniel, Ashit and Jitesh Office").
2. **DONE** — "Today" checklist: tap-to-tick (auto-timestamped), progress ring + status, attendance picker, per-area comment dialog, day note, tap-to-confirm **sign-off** that locks the day (with unlock). Date nav (prev/next, back-to-today).
3. **TODO** — History + dashboard: past days list (completion %, signed status, month filter) + small dashboard (today's progress, days signed this month, most-missed areas).
4. **TODO** — Area management: add/rename/reorder/retire areas; optional daily-vs-weekly tagging.
5. **TODO (optional)** — Photo evidence per area; "not signed yet" reminders; monthly print/export; attendance already linked to People.

**Status: owner is happy and paused here (after OCR Phase 2). Resume at OCR Phase 3 when asked.**

---

## June 2026 build (Organogram, People, Departments/Sites/Roles, Attendance, Tax & Legal)

NOTE: the nav "More" sheet was removed long ago — the HRMS icon opens a single "Go to" launcher. Below supersedes older lines where they conflict.

### Tax & Legal (was "Administrator")
`/hrms/command-centre` is **labelled "Tax & Legal"** in the launcher + page header (route unchanged). Recurring tax/statutory/legal obligations engine (`recurring_obligations` + `obligation_company`), tick-habit, per-company applicable, create-task-from-obligation. `lib/recurring.ts`, `app/hrms/command-centre/`.

### Organogram (`/hrms/org`)
Portfolio view rebuilt as an **ELK layered multi-parent flowchart** (`elkjs`, `lib/org-flow.ts` + `components/org-flow.tsx`): role/seniority tiers (Leadership / Managers & shared services / Team via `personTier`), primary boss = solid line, extra bosses (`reporting_lines`) = dashed, company = card colour, pan/zoom/fit/fullscreen + hover-spotlight. Per-company trees + By-department + "Everyone" web view kept. **Rejected (don't rebuild):** dotted-line overlay on the HTML tree (spaghetti) and a separate "Group Shared Services" band + `people.group_service` column (built & fully reverted). See `memory/organogram.md`.

### People reporting surfaced (Phase 2)
Person cards show manager (`↳`) + `+N` secondary + N direct-reports; drawer has a **Direct reports** list (primary+dotted) + a "{N} reports" chip; **bulk "also reports to"** in the people select bar; form labels fixed (Director→Reports to, Non Company Person→Related to). `getPersonDetail.directReports`.

### Departments / Sites / Roles — on the Companies hub
Reference-data centre = Companies hub tabs (`companies-hub-tabs.tsx`): **Departments** (`departments-admin.tsx`), **Sites** + **Roles** (generic `reference-admin.tsx`). Add/rename/**merge**/delete with usage counts. Sites merge re-points people work/residence; Roles merge re-points `people.role` text. Actions: `app/hrms/departments/actions.ts`, `app/companies/reference-actions.ts`. Standalone `/hrms/departments` route removed.

### People locations (Phase 5)
`sites` table + `people.work_site_id`/`residence_site_id` (work site = where posted, residence = where they live; NOT company branches). Person form Work site + Residence (combobox), drawer display, **"All Locations" directory filter** (matches work OR residence). `lib/sites.ts`.

### Attendance — fully wired (Phase 4)
`/hrms/leave` → **Leave | Attendance** tabs. **Admin register** (`attendance-register.tsx`): month grid, brush-to-paint status, company filter, month nav, "mark all Present today"; On-leave/Holiday auto-filled & read-only. **Staff self-check-in**: portal profile "Your attendance" + a once-a-day **check-in pop-up** (`attendance-checkin.tsx`) on portal landing; managers get **Team attendance today** on portal home. Trusted self-marking (manager can override), status-per-day, no clock in/out. `lib/attendance.ts`, `portalMarkAttendance`, admin `recordAttendanceAction`/`bulkRecordAttendanceAction`.
