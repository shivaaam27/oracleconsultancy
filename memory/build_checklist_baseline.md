# Complete System Build Checklist — Baseline Audit (No-AI + Behind-the-Scenes)

> Owner-supplied checklist of 84 foundational items (data/storage/search/automation/
> security/etc.), scored against what the COS system actually has as of 2026-06-20.
> Status key: ✅ built · 🟡 partial / present but not complete · ❌ not built.

## A. DATA FOUNDATION
1. Central structured database — ✅ Supabase Postgres + Drizzle ORM (`schema.ts`, migrations to 0096).
2. Unique IDs on every record — 🟡 DB has serial/uuid PKs everywhere; **human-facing prefixed IDs are uneven**: tasks `DS-001` (real), staff IDs `CZ-E04` (computed, not stored), but **no DOC-/CMP-/USR- scheme** — documents/companies/people use raw numeric ids in the UI.
3. Fixed naming conventions for files/fields — 🟡 `buildDocTitle` ("Owner · Type · Ref/Year") + rename sweep for documents; field naming is consistent in schema. Not enforced globally across all entity types.
4. Metadata on every document — ✅ uploader/date/company/vendor/type/expiry/status/review_status all on `documents`.
5. Predefined category list — ✅ doc categories + task categories (Finance…Other), enums in domain rules.
6. Predefined status list — ✅ task statuses, doc review_status, leave/pipeline/letter lifecycles.
7. Predefined tag system — 🟡 categories/folders/shelves exist; no single freeform tag system.
8. Data validation rules on inputs — 🟡 form-level + some Zod/typing; **not systematic** across all forms.
9. Required-field enforcement — 🟡 per-form, not centralised.
10. Date/number format enforcement — ✅ timestamptz everywhere, `.toISOString()` UTC writes, money→numeric(14,2) (Phase 0).
11. Duplicate detection rules — ✅ content Jaccard ≥0.7 + hash + reference/title dedup; recency-aware "keep both/replace".

## B. STORAGE
12. Document file storage — ✅ Supabase storage (signed URLs).
13. Metadata storage — ✅ DB records.
14. Current vs archived separation — ✅ archive flags, `embeddings.lifecycle` active|history, supersede/renewal chains.
15. Backup storage location — ✅ `npm run db:backup` → `backups/` JSON + Supabase cloud backups (primary).

## C. RETRIEVAL / SEARCH
16. DB indexing — ✅ migration 0075 (~56 indexes).
17. Filter-by-metadata search — ✅ tasks/docs/people tables have filters.
18. Keyword search inside documents — ✅ FTS + semantic (ORI brain, `hybrid_search`).
19. Sorting — ✅ in list views.
20. Pagination for large sets — 🟡 present in some lists; **not universal** (no list virtualisation — deferred).

## D. RELATIONSHIPS / LINKING
21. Document ↔ Company — ✅
22. Document ↔ Uploader — ✅
23. Document ↔ Task — ✅ `document_links`.
24. Company ↔ Staff — ✅ `person_companies`.
25. Task ↔ Assignee — ✅ `task_assignees`.
26. Parent/child relationships — ✅ org reporting lines, doc compilation/page_range, renewal chains.

## E. VERSION CONTROL
27. Replace without deleting old — ✅ supersede + archive (never hard-delete on auto paths).
28. "Current version" flag — ✅ lifecycle active|history; facts ledger latest effective_date.
29. Version history log — ✅ task_updates, person_events, facts history, audit_log.
30. Restore previous version — 🟡 undo_tokens + db:restore; **no per-document "restore this version" button**.

## F. AUTOMATION (RULES ENGINE)
31. Trigger system (IFTTT) — ✅ `automation-reactions.ts`, index-hooks, reaction chains.
32. Expiry detection — ✅ doc expiry + commitments notice-by + renewal chaining.
33. Auto-task creation on trigger — ✅ recurring obligations auto-spawn (Tax & Legal).
34. Auto-assignment to correct person — 🟡 some paths assign; not a general assignment-rules engine.
35. Recurring task generator — ✅ `automation-time.ts`.
36. Deadline detection — ✅ notice-by, probation, anniversaries.
37. Escalation rules (overdue→notify) — 🟡 statuses include Escalated; **automatic overdue→manager escalation not fully wired**.
38. Status auto-update rules — ✅ reactions auto-advance pipeline/onboarding/compliance.

## G. SCHEDULED JOBS
39. Daily background job runner — ✅ morning-run + Vercel crons.
40. Expiry-check job — ✅ (nightly reindex/self-heal + obligations).
41. Deadline-check job — ✅ via morning-run/brief.
42. Recurring-task job — ✅.
43. Cleanup/archive job — ✅ orphan-vector sweep, auto-sort, self-heal.

## H. NOTIFICATIONS
44. Email channel — 🟡 wired but send-as-director blocked on Gmail SMTP (Resend path planned, uncommitted).
45. WhatsApp channel — ❌ defined as a channel constant; **no integration built** (owner chose Telegram instead).
46. Telegram channel — ❌ planned (next_upgrades_plan B), not built.
47. In-app/portal notifications — ✅ `notifications` table + bell + chat deep-links.
48. Notification trigger rules — ✅ quiet hours + smart digest + actionable push.
49. Notification log — 🟡 outbox persists drafts; push has some logging; not a single unified send-log.

## I. ACCESS & SECURITY
50. Authentication — ✅ owner password + per-staff portal logins + passkeys (WebAuthn).
51. Password hashing — ✅ scrypt.
52. Session management — ✅ signed cookies (`cos_admin`/`cos_portal`).
53. Role-based access — 🟡 owner / portal roles (staff/manager/director); not fine-grained RBAC.
54. Per-module permissions — 🟡 portal scope guards; no general per-module matrix.
55. Per-document permissions — ❌ not built (owner sees all; portal scoped by ownership).
56. Login vault security — ✅ edge gate `proxy.ts`, secret derivation shared.
57. API key/secret protection — ✅ server-only Groq key, registry/server boundary rule (no secrets in browser bundle).

## J. AUDIT & LOGGING
58. Audit trail per record — 🟡 strong for tasks/people/facts/docs; **not every table** (audit_log + corrections + person_events).
59. Activity log per user — 🟡 system_events + person_events; not a unified per-user view.
60. Error logging — ✅ Sentry (errors-only).
61. Failed-action logging — 🟡 system_events doc-extraction diagnostics, self-repair; partial.
62. Login/access log — 🟡 some system_events on portal access changes; not a full login log.

## K. SYSTEM ARCHITECTURE (3 ZONES)
63. Frontend — ✅ Next.js App Router + portal.
64. Backend/server engine — ✅ server actions + API routes + crons.
65. Database layer (Supabase) — ✅.
66. Clean separation — 🟡 mostly; client/server boundary enforced for ORI registry (entity-meta split).
67. Modular design — ✅ lib modules per domain (assets/leave/letters/requirements/…).
68. Internal APIs connecting modules — ✅ shared lib + db-helpers + index-hooks.
69. Defined data flow between zones — ✅ documented in CLAUDE.md.

## L. RELIABILITY
70. Automatic scheduled backups — 🟡 Supabase cloud backups; **local db:backup is manual** (no scheduled cron).
71. Backup restore (tested) — ✅ db:restore + BACKUP.md.
72. Error handling (graceful) — ✅ error boundaries (portal hardening), AI-off degrades.
73. Data integrity checks — 🟡 coverage-audit, self-heal, FK reconciliation; not a full integrity suite.
74. Uptime/availability — ✅ Vercel + Supabase (managed).
75. Rate limiting / abuse protection — ❌ no app-level rate limiting (relies on platform).

## M. DASHBOARDS & REPORTING (NO AI)
76. Record counts/summaries — ✅ home + brief + system status card.
77. Expiry dashboard — 🟡 surfaced in brief/commitments; no single expiry dashboard.
78. Task status dashboard — ✅ hub Tasks + overview.
79. KPI tracking views — 🟡 Director Brief + Insights; partial.
80. Exportable reports (Excel/PDF) — 🟡 Director Brief print-to-PDF + letters PDF; **no Excel export**.

## N. INPUT/OUTPUT QUALITY
81. Clean data-entry forms — ✅ Aurora kit, combobox, bottom-sheet.
82. Bulk upload — ✅ "Add several" + inbox bundles.
83. Export capability — 🟡 PDF only (see 80); no CSV/Excel export.
84. Consistent output formatting — ✅ buildDocTitle, brief/letters formatting.

## Headline gaps (❌ / weakest 🟡)
- **Notifications channels**: no WhatsApp, no Telegram, email send-as-director blocked.
- **Human-facing unique IDs** (DOC-/CMP-/USR-) not implemented beyond tasks/staff.
- **Per-document & fine-grained permissions / RBAC** minimal.
- **Rate limiting / abuse protection** absent.
- **Excel/CSV export** absent (PDF only).
- **Scheduled local backups**, **per-version restore button**, **unified send/login logs** missing.
- Validation/required-field/tag systems exist per-form but **not centralised/systematic**.
