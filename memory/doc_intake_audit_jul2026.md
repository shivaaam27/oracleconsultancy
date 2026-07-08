# Document intake audit + fixes — 8 Jul 2026

Audit (4 agents) → fixes IMPLEMENTED same session (tsc clean, 263 tests pass), adversarially verified (3 agents). NOT pushed. See "## IMPLEMENTED" at the bottom.

## Findings (verified)

### A. Upload can fail outright (owner rule: NO upload may ever fail — degrade to manual naming)
Losing paths (nothing stored):
1. Server-action transport failure / file > 25MB body cap (`next.config.ts:12`) → smart-add.tsx:102-104 shows "Upload failed", File discarded.
2. Double failure in catch-all `autoFileDocumentAction` actions.ts:591-605 — pipeline throw + fallback createDocument throw → ok:false, file lost. (Single throw already recovers to quarantine :597-601.)
3. Inbox bundle all-or-nothing: inbox/actions.ts:51,69.
4. Camera scan normalize failure (HEIC etc.): scan-capture.tsx:272-273 — errors before upload.
5. Manual form: `uploadDocumentFile` throw (lib/documents.ts:327-336) unhandled after row insert.
Note: mere read-failures (unreadable/heic/too-big extraction results) already degrade correctly to quarantine with fallbackTitle (actions.ts:280,438-440).

### B. Unsure-reads gate bypassed (why low-confidence docs stopped landing there)
- ⭐ `src/lib/agent-apply.ts:73` — ORI cloud-agent re-read (`applyExtract`) unconditionally writes `review_status:"ok"`, NO confidence check; files out of quarantine if owner resolved (:78-85). Every quarantined doc enqueued to ORI (actions.ts:539) bypasses "unsure".
- Three inconsistent thresholds: 0.75 write-time (`ai-json.ts:390`, isLowConfidence actions.ts:3592), 0.95 name confidence (actions.ts:436-438), 0.6 display-time (duplicated `sorting-desk.ts:35` + `verify-queue.ts:26`). Unify.
- Opposite gap: `confirmSortItemAction` wasQuarantined branch (actions.ts:1142-1144) + `fileFromQuarantineAction` (:1054-1063) never clear needs_review → confirmed docs reappear in unsure.

### C. Ordering + no failed bucket
- Unsure list (`getSortingDeskItems` sorting-desk.ts:74-142) orders via listDocuments = expiry_date ASC (documents.ts:113), NOT newest-first. Owner wants updated_at DESC.
- NO "failed completely" bucket — hard failures folded into quarantine with free-text `intake_reason` only; `failKind` (unreadable/no-key/heic/too-big/low-confidence, actions.ts:3587,3819) is logged to system_events but NOT stored on the doc row.
- Owner wants: unsure reads newest-first + NEW "Failed to read" section BELOW it. Cleanest: add `hold_kind` enum col (no_owner|unreadable|duplicate|low_confidence|ready), values already computed at actions.ts:440-446; extend SortGroup (sorting-desk.ts:13) + sorting-desk.tsx sections [\"place\",\"unsure\",\"owner\"] (:21).

### D. Rescan — same modern pipeline BUT three divergences explain "old ways"/wrong suggestions
- Stack is modern: rescanDocumentAction (actions.ts:2509) → reExtractStored :2227 → cachedExtract :3728 → same extractDocumentFromFileInner as fresh; neutral AI layer, KNOWN RECORDS prompt, layered OCR (vision→OCR.space→Tesseract :2364), two-pass smart escalation.
- ⭐ CACHE REPLAY: cachedExtract keyed on file hash, model-aware but NOT prompt-version-aware (:3729-3731) → rescans re-serve OLD pre-improvement reads unless force=true. Root cause of wrong category suggestions on trials.
- Owner ladder steps 4-5 missing on rescan: no `learnedOwnerFor` (fresh :353), no `correlateOwnerByIdentifiers` (fresh :367). selfHealDocuments runs learned only (:1410), skips owned docs (:1399).
- No buildDocTitle re-run; owner/dates fill-blanks-only (:2556-2557) — wrong values never corrected; only category proposes differences (:2547).
- `ocr-empty` sticky: ensureDocumentText skips forever unless force (actions.ts:2428,2450).

### E. Other verified issues
- Smart Add status lie: AUTO_FILE=false (:482) quarantines everything but return says "filed" (:586) → green "Filed" rows for unconfirmed docs.
- Sequential unresumable bulk upload (smart-add.tsx:89-107); no retry queue for failures.
- Exact duplicates create new Trash rows sharing the storage object (:309-313) — Trash purge risky.
- Fallback OCR caps at 10 pages silently (:2407).
- Dead-but-reachable: retryQuarantineAction (:1318) + reviewFalseDuplicatesAction (:1203) have NO UI callers; the filed `else` branch :541-582 (renewal/compliance/suggestions) unreachable while AUTO_FILE=false — drift risk vs fileFromQuarantineAction; stale src/app/inbox/intake-shell.tsx (only TrashList consumed).
- ⚠️ Vision model Groq llama-4-scout dies 2026-07-17 — confirm providerVisionModels head live (Gemini covers if key active).

## Fix plan (ranked)
1. Never-fail upload: size pre-check + direct-to-storage (signed upload URL) for >25MB; client retry-once; keep failed Files + "Retry failed (N)"; last-resort store raw file w/ placeholder; per-file inbox bundles; camera raw-photo fallback; wrap manual-path storage throw ("file missing — re-attach" flag).
2. Unsure gate: confidence check in agent-apply.ts (needs_review <0.75); one shared threshold constant; clear flag on desk confirm.
3. hold_kind enum + unsure newest-first + "Failed to read" section below unsure in sorting-desk.
4. Rescan: prompt-version-aware cache key (or default force), full 5-step owner ladder, buildDocTitle + difference-proposals (suggest-only), ocr-empty auto-retry w/ recorded reason, "+N pages unread" flag.
5. Smart Add status fix (:586 one-liner) + bucket relabel.
6. Wire retryQuarantineAction/reviewFalseDuplicates buttons; reconcile/cut dead AUTO_FILE branch; cut intake-shell.tsx dead weight.

## IMPLEMENTED (8 Jul, unpushed) — tsc clean, 263 tests, adversarially verified

New file `src/components/doc-link-picker.tsx` — searchable typeahead "Link…"/"Attach" picker; replaces the native `<select>` in company-requirements-checklist.tsx, requirements-checklist.tsx, doc-link-control.tsx.

1. **Never-fail upload** (`smart-add.tsx`): files >22MB and any transport/read failure now fall back to `createInboxBundle` (raw bytes saved) instead of a dead "Upload failed" — nothing is lost. New result buckets: "Waiting in To Sort", "Saved to Inbox". `AutoFileResult.status` gained `"to_sort"`; the return no longer lies "filed" for quarantined docs (`actions.ts` return + status).
2. **Unsure gate restored** (`agent-apply.ts`): ORI re-read now writes `review_status` from a confidence gate (≥0.75 → ok, else needs_review) instead of hard-coded "ok". Made functional by adding `confidence` to the extract resultShape + instruction in `agent-context.ts` (was always absent → fail-safe to needs_review).
3. **Ordering + failed bucket** (`sorting-desk.ts` + `.tsx`): new `"failed"` SortGroup ("Couldn't read", below Unsure) via FAILED_READ_RE **OR no-usable-text**; unsure list sorted newest-first (id desc); unsure+failed default-expanded (only "owner" collapsed). Low-confidence surfacing now gated on `!vettedAt` so a confirmed doc can't permanently re-appear (the verify RISK). `confirmSortItemAction` (quarantine branch) + `fileFromQuarantineAction` now clear `reviewStatus:"ok"`.
4. **Rescan fixed** (`rescan-documents-dialog.tsx` + `actions.ts`): dialog now ALWAYS passes `force=true` (was `recheckVetted` → replayed stale cache = the wrong-suggestions bug). rescanDocumentAction gained the full owner ladder (learnedOwnerFor + correlateOwnerByIdentifiers) + a buildDocTitle rename proposal (guarded on a resolved owner). Toggle copy corrected (no longer says "free/cached").

## Compliance auto-verify — DECISION (kept hybrid, NOT widened in code)
Auto-verify already exists (`company-requirements.ts:340-353`) but fires only on an EXACT catalogue-type match (`docCatalogueReqKey`→`deriveFiling.companyReqKey`); fuzzy matches reach "received" (needs manual Verify). "received" already counts toward the score. Recommendation: KEEP manual verify for fuzzy/low-confidence (auto-verifying those risks false-green across Home/Brief/portfolio scores — high blast radius), make it ONE TAP via the searchable picker (done), and OPTIONALLY widen the catalogue map (`deriveFiling`) so more statutory types deterministically auto-verify — deferred as a separate, low-risk change with tests.
