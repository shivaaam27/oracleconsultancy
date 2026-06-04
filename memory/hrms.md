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
            ├─ [Card] OCR  · Office Cleaning Registry          → /hrms/ocr
            ├─ [Card] Companies → /companies   (moved into HRMS)
            ├─ [Card] People    → /people      (moved into HRMS)
            └─ [Card] Documents → /documents   (moved into HRMS)
```

**Nav move (owner decision):** Companies, People and Documents now live **only** under HRMS as cards (live stats). They were removed from the bottom nav pill — the dedicated **Companies tab** (and its long-press company switcher, `CompaniesNavTab`) was deleted from `top-pill.tsx`, and **People + Documents** were removed from the "More" sheet. The pages/routes themselves (`/companies`, `/people`, `/documents`) are unchanged — only the way in moved. `TopPillServer` no longer fetches companies.

**HRMS promoted to a primary nav tab** (briefcase icon) — main pill is now: Home · Task Management · Workbook · **HRMS** · More · Search (HRMS also a lens slot). HRMS removed from the More sheet. The nav-pill page "+" action icon is now **unified system-wide** (`navIcon()` always renders `Plus`, regardless of each page's own action icon); per-action icons still show in the multi-action dropdown.

### Improvements plan (in progress)
Agreed phased plan after the nav move: **1 (DONE)** HRMS nav tab + briefcase icon + unified "+". **2 (DONE)** Smart breadcrumbs — `src/components/hrms/hrms-crumbs.tsx` (`HrmsCrumbs from={searchParams.from}`): always "‹ HRMS", plus "‹ CODE" when `?from=task:CODE`. Added to `/people`, `/companies`, `/documents`, and `/companies/[id]` (replaced its hardcoded "Task Management" back-link). Task detail page **and** the task drawer link to the company with `?from=task:${code}`. **3 (DONE)** People deactivate — individual (Deactivate/Restore in the long-press peek, via `togglePersonActive`) **and bulk** (a "Select" mode in `people-table.tsx` with per-row checkboxes, Select-all, and a floating Restore/Deactivate bar; bulk action `setPeopleActive(ids, active)` in `people/actions.ts`). Soft only (`people.active`) — no hard delete. **3** People deactivate — individual + **bulk** (decision: deactivate only, no hard delete; built on `people.active`). **4** Documents capture unified into one panel keeping all three inputs (Upload · Link · Paste text). **5** Documents smarter AI reading (scanned/photographed PDFs, images, handwriting, dirty docs → vision model) + **overflow-to-Notes** (unmapped extracted info auto-appended to Notes). Honour `getGroqKey()`.

Shared bits: `src/components/hrms/hrms-dialog.tsx` (drawer), design uses the standard `ui.tsx` primitives + tokens (no Excel styling). British English. Currency = **TZS** (`fmtMoney` in `stock-shared.ts`).

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
