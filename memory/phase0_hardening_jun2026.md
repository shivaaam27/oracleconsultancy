# Phase 0 — ERP hardening (June 2026)

The first step of the ERP build: fix the audit blockers (`memory/audit_pre_erp_jun2026.md`)
so the codebase is safe to build a finance ledger on. Done as a multi-agent workflow
(run wf_ce916af7-c07: 2 foundation agents + 12 disjoint-file lanes + dead-code pass)
then a manual integration gate. **All on branch `phase0-erp-hardening` — NOT pushed,
live DB NOT migrated.** tsc clean, `npm run build` green, 48/48 vitest pass.

## What was fixed (by theme)

**The 3 ERP foundations**
- **Transactions (ERPREADY-01, DBSPINE-02):** new `src/lib/tx.ts` `withTx()` over Drizzle
  `db.transaction`. Hot multi-write paths converted: task create (ACTTASKS-04), stock
  transfer/write-off (ACTHRMS-01), leave booking (ACTHRMS-02), request→task convert
  (ACTCOMMS-05), person offboarding (active flag + manager reparent + role vacate atomic).
- **Money precision (DBSPINE-01, ERPREADY-02):** `assets.purchase_cost`,
  `stock_items.unit_cost`, `stock_purchases.unit_cost` → `numeric(14,2)`. JS readers handle
  the now-string columns (stock.ts/assets.ts use minor-units; stock-shared.ts wraps `Number()`).
- **Numbering (ACTCOMMS-01, ERPREADY-04):** `number_series` counters table + `UNIQUE(letters.ref)`;
  `letters.ts` allocates atomically via `withTx` instead of `COUNT(*)+1`.

**Security (P0 + auth)**
- **ACTPORTAL-01 (P0):** portal scope guard — a manager/staff can only read/act on themselves
  + direct reports (phone/tasks/reminders gated by `personCanSeePerson`/`directReportIds`).
- **ACTPORTAL-02:** reminder send path scope-guarded. **ACTPORTAL-03:** admin route auth.
- **COMPIP-01:** password reset preserves existing portal_role (no silent admin→staff demotion).
- **AUTHSEC-02:** portal session bound to password hash → password change logs out other devices;
  current device re-issued (wired in integration). **AUTHSEC-01:** login lookup escapes LIKE
  metacharacters (`findPortalPersonByIdentifier`, wired in integration). **DBSPINE-04 / APIROUTES-02/04:**
  same ILIKE escaping in identity resolver + AI-command entity matching.

**Functional bugs**
- ACTTASKS-01 archived tasks excluded from `getAllTasks` + KPIs/Brief/signals (LIBDERIVE-01 compliance
  count now over full set). ACTTASKS-02 task delete snapshots conversation + meeting links; undo
  restores them (wired in integration). ACTMEET-01/02 + COMPBIG-01/02 monthly recurrence day-clamp +
  .ics matches UI + long daily series. ACTHRMS-03 leave-year anchored to request start. ACTDOCS-01
  dup-sweep excludes compilation siblings; ACTDOCS-02 scorers pure-read. ACTPEOPLE-03 archive reparents
  reports. DUP-05 `src/lib/task-status.ts` computeClosedDate.

**Dead code:** 18 files deleted (attention-*, widget-card, stat-tiles, workload-pulse, company-jump,
companies-widget, governance-quick-edit, task-hover, prompt-box, timeline-filters, expiring-docs,
today-brief, filter-select, api/digest, api/digest-narrative, lib/digest, lib/forecast) + linkified-answer edit.

## Integration gate (done by hand after the lanes)
Wired 3 half-done items the lanes couldn't reach (cross-lane files): AUTHSEC-01 login call-site +
AUTHSEC-02 cookie re-issue in `portal/actions.ts`; undo restore of updates+meetingLinks in
`undo-handlers/tasks.ts`. Cleared stale `.next` (was failing typecheck on deleted digest routes).

## The migration — `drizzle/0086_even_stardust.sql` (NOT applied)
Generated only. Apply guide + **pre-flight data-cleanup SQL** in `PHASE0_MIGRATION.md` (orphaned
FK pointers + duplicate letter refs will abort the migration otherwise). Owner gates the apply:
backup → pre-flight clean → `db:migrate`.

## Tidy-up pass — DONE (run wf_4da8238c-d05, 7 lanes + integration)
All the Phase-0 deferred follow-ups folded in; build/tests green again. What landed:
- **ACTPEOPLE-01** manager-cycle guard (reused existing `primaryChainReaches`) in `updatePerson` +
  `bulkSetPeopleField`. **Offboarding atomicity**: new tx-variants `startJourneyTx`/`returnAssetsForPersonTx`/
  `clearCustodianForPersonTx` folded INTO the archive `withTx` (archive now rolls back if a side-effect fails).
- **ACTTASKS-01 consistency**: archived excluded in ai-context, Ask route, portal-auth task scoping;
  **"Show archived" toggle** in `_hub/tasks-section.tsx` wired through `page.tsx` (integration).
- **Dead exports** removed from live files (macos.tsx, weather-chip.tsx, documents-table dead dialog
  COMPBIG-03, saved-views-bar default basePath COMPQZ-06).
- **ACTTASKS-03 / ACTCOMMS-02**: update-delete + audit-delete now SOFT-delete (retained, hidden) — restore
  functions live; audit-menu has a conditional Restore button. Stale `/audit` revalidations removed.
- **ACTHRMS-05**: pipeline/commitments helpers now surface DB errors (`{ok,error}`) instead of false success.
- **AILAYER-01**: new `src/lib/prompt-safety.ts` (`wrapUntrusted`/`neutraliseInjection`) applied to
  company-summary + draft-email routes.

## Still genuinely optional (not blockers — feature work, raise before/with Phase 1)
- Restore UI surfaces: a "show deleted" toggle in `companies/[id]/_tabs/timeline-tab.tsx` (audit) and a
  restore affordance for soft-deleted task updates — data-layer restore exists, no self-service button yet.
- Retention/purge job for soft-deleted task_updates/audit rows before the table grows large.
- DBSPINE-05 durable DB-level cycle constraint (app-side guard is in; FK stops dangling only).
- Remove now-unused HTTP `returnAssetsForPerson`/`clearCustodianForPerson` (superseded by tx-variants).
- Broader prompt-safety coverage (Ask COS, meeting tools); stock-shared.ts exact minor-units (safe as-is).

## Next
Owner review → commit/push → apply migration (gated) → then Phase 1 (Finance core: chart of
accounts + general ledger + journals), built on `withTx` + `number_series` + numeric money.
