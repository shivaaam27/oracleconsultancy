---
name: documents-redesign-plan-jul2026
description: Documents page redesign — SHIPPED to master. Merged page, suggest-only intake, compliance cards, category drill-down, editor redesign.
metadata:
  type: project
---

## ✅ SHIPPED — pushed to master, commit **1bd2e2f** (5 Jul 2026), Vercel deploys from master.
The ENTIRE Documents redesign below (rounds 1→5 + all phases) is DONE, tsc-clean,
verified desktop + 375px, and LIVE. No DB migration (statutory-tracking uses the
settings table `compliance.untrackedCompanies`). New chat: the page is finished and
deployed — this file is the "why/how" record. Owner TODOs still open (their side):
untrack the ~6 non-core companies (toggle works), clean the 2 mis-filed Cocozuri
insurance docs under PES (#542/#547).

**Open follow-ups / ideas (not built):** reframe intake-accuracy "auto-filed %" for
the suggest-only world (it's a legacy metric now); the AI READ itself (Groq OCR) can
still mis-read poor photos — only the evidence-snippet SELECTION was improved, not the
extraction; chat-message evidence can be noisy. `/hrms/pipeline` route still exists but
unlinked (calendar/entity-graph reference its DATA) — full deletion is a later cleanup.

## In-site camera scanner — SHIPPED 2026-07-06
Owner wanted to scan paper documents with their phone camera directly on the site
instead of a separate iOS-scanner app. Added `src/components/scan-capture.tsx`
(`ScanButton`) as a third tile in **Smart Add** (`smart-add.tsx`, To Sort tab) next
to "Choose files"/"Choose a folder": tapping it opens a nested dialog with a
`<input type="file" accept="image/*" capture="environment">` — the same
native-camera-launch mechanism every mobile browser already supports, so NO
`getUserMedia`/live-video-preview plumbing was needed (simpler + far more
reliable across iOS Safari/Android Chrome than a custom camera UI). One tap =
one photo = one page; photos build up as a thumbnail strip (reorder not built,
delete-per-page is); "Save N pages as PDF" stitches them into a single
multi-page PDF client-side via `pdf-lib` (new dep — no existing PDF-gen lib was
in the repo) using each photo's own pixel dimensions as the page size. Each
photo is downscaled first via the existing `downscaleImage()` helper (already
shared by `document-form.tsx`/`bulk-upload-dialog.tsx`) to keep the PDF a sane
size. The resulting `File` is pushed into Smart Add's existing `picked` array —
**zero server-side changes**: it flows through the unchanged "Sort now"
(`autoFileDocumentAction`) / "Save to inbox" (`createInboxBundle`) pipeline
exactly like any picked file. Admin-side only (Smart Add has no portal twin).

### Live-narration "Live view" mode — SHIPPED 2026-07-06
Owner wanted a Gemini-Live-style camera experience — ORI narrating what it sees
as you point the phone. **Real Gemini Live is the wrong tool**: it's a separate
WebSocket/session product with its OWN quota (session-count + time-capped, often
TIGHTER than plain request quota, not "unlimited" as the owner assumed) and needs
continuous audio+video streaming infra we don't have. Built the FEEL instead,
reusing everything already shipped: `ScanButton` got a second optional tile,
**"Live view"**, alongside the default "Take a photo" tile (which stays the
reliable default — Live view is opt-in, degrades to an inline error + "use Take
a photo instead" if `getUserMedia` fails/is denied, never blocks the core flow).
Live view opens a `getUserMedia({video:{facingMode:"environment"}})` preview;
every ~2.5s (`NARRATE_INTERVAL_MS`) a small/cheap downscaled frame (900px,
q0.55 — disposable, NOT the saved page) is sent to the new server action
`narrateScanFrameAction` (`src/app/documents/scan-narrate-actions.ts`), which
calls `callGroqText` with `providerVisionModels(activeProvider)` — the SAME
widened/reordered vision ladder as document extraction — `attempts:1` (a live
caption is disposable, skip the frame rather than retry/backoff). The caption
renders as a live overlay caption bar over the video. A "Capture this page"
button grabs the current frame at full quality into the same `pages` array as
the reliable path — both modes feed one PDF. All captions from the session are
kept in a ref and, on "Save as PDF", saved to ORI memory via
`saveScanNarrationAction` → `recordQA("admin", …)` (best-effort, fire-and-forget,
never blocks the save) — so "what did the camera see" becomes recallable through
Ask COS's existing memory recall, same mechanism as any other remembered Q&A.

### Scanner bugfixes — 2026-07-06 (owner-reported, same day as ship)
Three bugs surfaced immediately on real-device use:
1. **"First reading completely wrong"** — root cause: `pdf-lib`'s `embedJpg`
   does NOT read EXIF orientation tags, and the shared `downscaleImage()`
   helper only re-encodes (which bakes in correct rotation) above 3.5 MB — a
   smaller camera photo skipped that step and went into the PDF sideways/
   upside-down, so the AI read garbage. FIX: `normalizeCapturedPhoto()` in
   `scan-capture.tsx` — ALWAYS re-encodes through
   `createImageBitmap(file, {imageOrientation:"from-image"})` + canvas
   (unconditional, no size gate), used by the "Take a photo" path; the Live
   view "Capture this page" path already drew a fresh canvas frame (no EXIF to
   begin with) so it was already correct and is left alone.
2. **New scans didn't appear in "To Sort" until a manual refresh** — root
   cause: `createInboxBundle` (`src/app/inbox/actions.ts`, used by "Save to
   inbox") only called `revalidatePath("/inbox")`; the Documents/Inbox merge
   moved the "To Sort" queue onto `/documents`, and every OTHER document
   action already goes through a shared `revalidateDocs()` helper that
   invalidates `/documents` — this one call site was missed. FIX: added
   `revalidatePath("/documents")` alongside the existing `/inbox` call.
3. **Live view = black screen, unresponsive** — root cause: a classic React
   mount-order bug. The stream was attached to `videoRef.current` INSIDE
   `startLive()`, before `setLive(true)` had run — but the `<video>` element
   is only rendered when `live` is true, so at that point the ref was still
   `null` and the stream silently never got attached; the element then
   mounted with nothing wired to it. FIX: `startLive()` now only requests the
   stream and flips `live` on; a `useEffect` keyed on `live` attaches
   `streamRef.current` to `videoRef.current` (and starts the narration
   interval) once the element actually exists, tearing the interval back down
   on stop/unmount.
⚠️ **Verification caveat**: this dev sandbox has no physical camera, so bug 3's
fix is verified by code/logic (tsc clean, no console errors, the getUserMedia
error path itself was re-tested and still degrades gracefully) but NOT
confirmed on a real device — needs the owner to re-test Live view on their
phone.

### Auto-crop / straighten (iOS-Files-style) — Phase 1+2 SHIPPED, Phase 3+4 PENDING
Owner wants scanned photos auto-cropped to just the document (like iOS's Files
scanner), not the desk/background. Chose **Option A** (AI-detected corners +
a real perspective warp) over Option B (OpenCV.js — accurate + offline but an
~8MB WASM bundle and a much bigger build). Phased deliberately, given same-day
bugs on the simpler scan feature — each phase ships independently testable
before the next touches the live camera UI:
- **Phase 1 (done)**: `src/app/documents/scan-crop-actions.ts` →
  `detectDocumentCornersAction(imageDataUrl)` — one Gemini vision call (same
  ladder as everything else) asking for the 4 corner fractions + a confidence
  score. Returns `{ok:false}` on ANY failure (no key, bad JSON, wrong shape,
  low-effort single attempt) — deliberately never throws, so a bad read can
  only mean "skip the crop", never corrupt a page.
- **Phase 2 (done)**: `src/lib/perspective-warp.ts` → `warpToRectangle()` — a
  dependency-free projective (homography) transform: given an image + 4
  corners, produces a flattened top-down rectangle sized from the corners'
  own proportions (Gaussian-elimination 8-point DLT solve, inverse-mapped
  per-output-pixel so there are no holes). `computeInverseHomography` is
  exported and unit-tested in isolation (`perspective-warp.test.ts` — identity
  case, pure-scale case, and a genuine skewed-trapezoid case) since the DOM/
  canvas parts can't run in the node-environment Vitest config.
- **Phase 3 (pending)**: wire corner-detection → warp with a hard confidence
  gate — low confidence/failure = keep the original photo, never block or
  corrupt the page.
- **Phase 4 (pending)**: wire into `scan-capture.tsx`'s capture flow with a
  preview + "use this / use original instead" choice BEFORE making it fully
  automatic — so a bad warp is caught immediately, not after the PDF's built.
- **Phase 5 (pending)**: owner tests on real documents (mostly top-down/
  aligned per the owner, so the easy case; angled shots are the stress test).

## Round 5 — Document editor redesign — DONE + SHIPPED
Owner chose **E2 file-beside-fields on desktop, folding to E1 stacked sections on
mobile** (mockup was artifact "cc-doc-editor"). Built by RESTRUCTURING document-form.tsx
LAYOUT ONLY (all intake logic untouched): a `lg:grid lg:grid-cols-[minmax(0,320px)_1fr]`
wraps the capture/file panel (LEFT) + the fields (RIGHT); folds to stacked <lg; fields
grid `grid-cols-1 sm:grid-cols-2` (single-col mobile); a live **clean-name bar**
(`displayDocName(doc)`) on top; DocDialog widened to 860. ⚠️ GOTCHA: mid-edit Turbopack
cached a broken chunk → persistent STALE "document-form parse error line 847" in the dev
console even though the file is valid (46/46 divs, tsc clean, renders). Trust tsc.

---

Owner reviewed the first Documents build (merged page + Sorting Desk + collapsible
company housings) and rejected the **Library** half as unfinished: compliance panel
still the old long grey list, "Needs attention · 370" is nonsense, and the company
housings just hide a long flat list instead of using categories. Gave a phased-plan
request. See [[command_centre_unification]] for what's already built.

## Root causes found (in code)
- **"Needs attention · 370"** = `needs-attention-panel.tsx` conflates EXPIRY (8 expired
  + 7 expiring = 15 real) with **355 "missing" compliance items**. Every company is
  seeded ~15–19 TZ statutory requirements (`COMPANY_DEFAULT_ITEMS` in
  `company-requirements.ts`); 13 companies × ~13 unmet = ~355. Missing-docs is a
  COMPLETENESS measure, wrong to show as urgent to-dos.
- **0% everywhere** = 6 of the 13 companies are NOT the 7 portfolio cos (Akasaki
  Middle East, Rugantino, Tanam Advisory, Urban Trade Solutions, Pamoja Plus…) yet
  carry the full statutory checklist with no docs → 0% → inflates the 355 + tanks the
  14% portfolio score.
- Compliance score = mandatoryVerified / mandatoryTotal (`getCompanyChecklist` +
  `buildCompanyRequirementScores`). Categories per doc = 8 `DOC_SHELVES` /
  `shelfForCategory` in `documents-shared.ts` (owner wants these used in the list).

## Owner decisions (Jul 2026)
1. **Non-core companies → add a per-company "track statutory compliance" toggle**
   (new `companies.compliance_tracked` bool, default … decide). Off = no statutory
   checklist, no 0%, no missing flags; company just holds documents. On = tracked.
   → NEEDS A MIGRATION (take `npm run db:backup` first).
2. **Expiry-row actions = Renew · Replace · Open** (dropped Chase / Send-notice for
   own docs). Replace = upload the new copy → old auto-tagged ·EXP (kept in history).

## Phases
- **Phase 1 (quick win) — DONE + verified, tsc clean, NOT pushed:**
  `needs-attention-panel.tsx` now EXPIRY ONLY. Header "Expiry watch", Kind =
  expired|expiring (missing loop + Missing chip + companyScores/personScores usage
  removed), chips "All / Expired / Due soon", actions per row = **Open** (→
  `/documents?doc=ID`) + **Renew** (company docs). Panel reads "15" not "370".
  Replace deferred to Phase 2 (upload/supersede flow). Unused imports/handlers
  (doDraft/doSendNotice/addHrefFor) left in place (no noUnusedLocals).
- **Phase 2a — DONE + verified live, tsc clean (only .next generated noise), NOT
  pushed:** new `components/compliance-cards.tsx` (C1 grid) ABOVE Expiry watch —
  per-company card: CompanyAvatar + score Ring + 8 category pips (from new
  `ComplianceScore.shelves` via `rollUpShelves` in company-requirements.ts, both
  seeded + synth paths) + top missing labels + **Tracked toggle**. Untracked =
  settings key `compliance.untrackedCompanies` (NO migration) via
  `lib/compliance-tracking.ts` + `app/documents/compliance-actions.ts`
  `setCompanyComplianceTrackedAction`. page.tsx scores only trackedCompanies, passes
  untrackedCompanies (id/name/docCount) → "N not tracked" footer. Hero chip no longer
  toggles a panel (cards always shown). VERIFIED: toggling Rugantino off moved KPI
  14%·13-risk → 15%·12-risk. Old ComplianceScorePanel now unused (kept).
  **PES 0% INVESTIGATED (diag script, now deleted): NOT a linker bug — the score is
  CORRECT. PES (id 5) has 0 of its 17 statutory docs. Its 5 docs = 2 insurance
  policies MIS-FILED from Cocozuri (#542/#547, filenames literally "Cocozuri_
  Insurance-ARIS-...pdf", title renamed to "PES_Insurance-Policy") + 3 letters
  (#589/#590/#670, correctly Operations, don't count for statutory). deriveFiling
  returns companyReqKey=NULL for all 5 (an insurance policy / letter satisfies no
  statutory requirement — correct). Linker works fine for cos with real statutory
  docs (Dar Spices ~92%). TAKEAWAYS: (a) 0% is honest — owner just hasn't uploaded
  PES's incorporation/MEMARTS/TIN/licence/etc.; (b) REAL DATA BUG surfaced = 2
  Cocozuri insurance docs mis-owned to PES (legacy auto-file era; suggest-only stops
  NEW ones). Offered to reassign #542/#547 → Cocozuri (awaiting owner OK).**
- **Phase 2b — DONE + verified live, tsc clean, NOT pushed:** Replace action on
  Expiry-watch rows (Open · Replace · Renew). Replace opens Add-document pre-filled
  with the doc's owner (person/company) + category + a supersede marker; on save the
  NEW doc.supersedesId is set and the OLD is tagged -EXP + moved to Trash (kept in
  history) via new `retireSupersededDocumentAction`. DocumentForm gained
  `initialSupersedesId` prop + a warn banner; its existing duplicate "Replace" choice
  now also retires (·EXP) instead of plain-archive (unified to the owner's convention).
  **⚠️ TWO BUGS FOUND + FIXED en route:** (1) `?company=`/`?person=` URL params open
  the GLOBAL drawer (global-drawers.tsx CompanyDrawer/PersonDrawer listen to them) —
  so a `newdoc=1&company=X` Replace href opened the company drawer, NOT the form.
  (2) DocumentsTable's newdoc effect is MOUNT-ONLY (`[]` deps) so a same-page
  client nav to `?newdoc=1` never opens the create dialog. FIX for both: Replace now
  fires a **window `cos:new-document` CustomEvent** {companyId,personId,category,
  supersedeId} that DocumentsTable listens for → opens the dialog with prefills. No
  URL params, no drawer collision, works same-page. **FORWARD RULE: to open the doc
  create dialog from elsewhere on /documents, dispatch `cos:new-document`, don't use
  `?company=`/`?newdoc=` (drawer collision + mount-only effect).** Verified: opens
  pre-filled Rakesh Rathod·Immigration with the -EXP banner, no drawer.
- **Phase 3 — DONE + verified live, tsc clean, NOT pushed:** owner chose "Company →
  Category → Docs" (two-level drill-down). documents-table.tsx: inside an expanded
  company housing, `groupRowsByShelf` buckets the company's docs into the 8 filing
  shelves (shelfForCategory + SHELF_CODE, code order 01…08); each shelf renders as a
  slim collapsible sub-header (pl-8, mono code + name + expired/expiring dots + count)
  → docs (renderRow) under it. Shelf sub-sections default COLLAPSED (`isCollapsed`
  reused with `${companyKey}::${shelf}` key) so: page = company bars → expand company =
  8 category rows → expand category = its docs. Stays short at every level, kills the
  "flat dump" gimmick. VERIFIED: MES → 01 Legal(3)·02 Licences(●2●1·8)·03 Tax(5)·04
  Banking(●1·7)·06 Immigration(●1·1)·08 Ops(9); expanding Immigration showed just its
  doc. (Stale HMR console error "Upload is not defined" — import IS present line 8,
  panel renders fine, tsc clean; classic Turbopack stale-chunk noise.)
- **Phase 4 — DONE + verified desktop+375, tsc clean, NOT pushed:**
  (1) **Real logos** — page.tsx fetches `getCompanyLogoMap()` (lib/company-brand),
  adds `logoUrl` to each company obj; workspace Company type + DocumentsTable
  (companyLogo helper, housing avatar) + ComplianceCards (logoOf, card + footer
  avatars) now pass real logos (CompanyAvatar falls back to accent+initials).
  (2) **Slim filter** — removed the Category + Status FluidSelects from
  documents-table (categories are the housing sub-sections now, status is the chip
  row); kept search + Company + People + Select + List/Timeline + chips.
  (3) **British dates** — set `<html lang="en-GB">`. ⚠️ NOTE: Chrome renders native
  `<input type=date>` in the BROWSER's own language, NOT the page lang — so date
  INPUT widgets still show US m/d/y on a US-configured browser (unavoidable without a
  full custom date-picker). All READ/display dates already use fmtDate
  `toLocaleDateString("en-GB",…)` = unambiguous "17 May 2023" — so no misread risk.
  (4) **Mobile fixes** — search box `w-full sm:flex-1` (was squished to "Sear");
  Expiry-watch row `flex-wrap` + actions `w-full sm:w-auto` (title + "expired N days
  ago" no longer cram/wrap to 3 lines; Open/Replace/Renew drop to their own line).
  Owner TODOs still open: untrack the ~6 non-core cos (their call — toggle works),
  clean up the 2 mis-filed Cocozuri insurance docs under PES (#542/#547).
  **ALL PHASES 1–4 DONE, tsc clean, verified desktop+375, NOTHING PUSHED.**

## ⭐ DOCUMENT NAMING RULE (owner-mandated — remember this)
Every document DISPLAY name = the document itself, NOT its owner (owner is always
shown separately: a company/person line under the row, or the section/person header).
Format `Doc Type (Ref / Number)`, clean spaces (no `_`/`-` runs), drop the `_EXP-date`
suffix (expiry shown as its own chip). Examples the owner gave:
Indian Passport (U5515682) · National ID NIDA (19880402-11102-00001-28) · Business
Licence (BL…number) · Tax Clearance Certificate · Certificate of Incorporation (number)
· Contract (person shown by the owner line/section). Implemented once in
`displayDocName()` in documents-shared.ts — USE IT for every doc title render (expiry
watch, full list, sorting desk). Non-house titles fall back to docType→raw title.

## Round 2 — owner detailed polish pass (5 Jul 2026) — DONE + verified desktop+375, tsc clean, NOT pushed
Big batch of owner feedback on screenshots. All built:
- **Hero:** tabs (Library/To Sort/Trash) moved OUT of the hero card to their own row
  BELOW it; compliance chip removed from hero (KPI pill = docs/expired/due-soon/to-sort only).
- **Compliance cards → home-health-tile style** (compliance-cards.tsx): REMOVED the score
  Ring; the **missing count** (missing+expired) now sits top-right where the ring was
  ("17 missing" red / "expiring" amber / ✓ "on file" green); removed the top-missing
  TEXT line; kept the 8 category pips; moved the **Tracked toggle** to its own slim
  divider row at the card foot; wrapped the grid in a **scroll housing** (max-h-[23rem],
  scroll-fade-y) — ~4 desktop / ~2-3 mobile visible, rest scroll; **worst-first** order
  (interpreted "start at stop and go in order" = problems first, healthy last, matching
  home CompanyHeat). Real logos already plumbed.
- **Expiry watch** (needs-attention-panel.tsx): removed the warning-triangle icons (thin
  colour bar only); added **Company + People FluidSelects** (expiry hits both), on their
  OWN ROW below the chips (mobile-safe); names cleaned via `displayDocName`.
- **Clean naming** — new `displayDocName(doc)` in documents-shared.ts: turns the house
  title `Prefix_Doc-Type[_Ref][_EXP-date]` into `Doc Type (Ref)`, dropping the owner
  (shown separately) + EXP suffix; ref keeps its punctuation, bare year dropped. Verified:
  "Indian Passport (U5515682)", "Tax Clearance Certificate (131-0204-6038)", "National ID
  NIDA (19880402-11102-00001-28)", "Business Licence (BL01396912025-2600002441)". Used in
  Expiry watch + all doc rows. (Sorting Desk still shows the PROPOSED house filename on
  purpose — that's the name being assigned.)
- **Filters removed** (documents-table.tsx): dropped Company/People/Category/Status
  dropdowns, Select, List/Timeline toggle, status chips, Show-archived — kept ONLY search
  (the housings ARE the filter now). Dead state/imports left (no noUnusedLocals).
- **Doc list restructure:** new **Staff & personal files** section grouped **BY PERSON**
  (groupRowsByPerson, worst-first) moved to the **TOP** above companies (kindRank people=0,
  company=1, none=2). Companies still Company→Category(shelf)→Docs. renderRow gained
  `{hideCompany|hidePerson}` opts → inside a company sub-section the company line is hidden,
  inside a person sub-section the person line is hidden (kills the owner duplication the
  owner flagged). Sizing standardised: company header + category/person sub-header + doc
  row all py-2.5, doc rows pl-9 (nested indent).
  ⚠️ ORDERING interpretation flagged to owner (worst-first vs their "high compliance start
  at top"); trivially flippable (one sort line).

## Round 3 — To Sort tab polish (5 Jul 2026) — DONE + verified desktop+375, tsc clean, NOT pushed
- **Header:** removed the intro paragraph; ALL action buttons now grouped in one row
  below the tab — Read new files in · Smart Add · Re-scan · Find duplicates
  (to-sort-panel.tsx now owns SmartAdd; workspace no longer renders the intro/SmartAdd).
- **Intake accuracy** (intake-accuracy.tsx): redesigned from a big card to a SLIM one-line
  strip (glass, "✨ Intake accuracy · last 30d · 83% auto-filed · 39 needed you · 1 learned
  · 0 flagged"), moved into ToSortPanel right under the action buttons (glanceable, not
  buried). Old Stat/MiniTrend/headline helpers left defined-but-unused. WHAT IT MEASURES
  (told owner): over last 30d — % of processed docs auto-filed cleanly, how many needed
  review, corrections learned, cross-doc discrepancies. ⚠️ CAVEAT: "auto-filed %" is a
  LEGACY metric — under suggest-only nothing auto-files, so it'll trend toward 0 going
  forward; "corrections learned" stays meaningful. Consider reframing later.
- **Automations feed REMOVED** from To Sort (owner: gone with pipeline). **System status
  card KEPT** (background-job health monitor — snapshots/cleanup/reindex/morning-run + AI
  key + safety findings; told owner what it is).
- **Sorting Desk cards** (sorting-desk.tsx): clean names via `displayDocName`; ALL controls
  now on ONE line (company · type · date · Preview · Fix details · Confirm & file · Trash)
  with a shared `ctl` size class (h-8) so every pill/select/button lines up. **Preview**
  now opens the file directly (getDocumentFileLinkAction → window.open), not an inline
  toggle. **Fix details FIXED** (was dead on the To Sort tab — DocumentsTable's ?doc=
  editor isn't mounted there): now dispatches a `cos:edit-document` window event →
  workspace listener switches to the Library tab + sets ?doc=ID → the editor opens.
  Verified end-to-end. **FORWARD RULE: to open the doc editor from off-Library, dispatch
  `cos:edit-document` {id}.**

## Round 4 — To Sort/Trash polish + editor mockup (5 Jul 2026) — code DONE + tsc clean, NOT pushed; editor = MOCKUP only
- **Buttons:** "Read new files in" → **"New files"**; both New files + Smart Add now
  NEUTRAL (border/bg-elev) with only the **star icon blue** (smart-add.tsx swapped its
  `<Button>` for a plain neutral button; to-sort-panel button de-accented).
- **Sorting Desk card (sorting-desk.tsx):** controls now **FIXED-WIDTH columns**
  (company w-172 · type w-128 · date w-150 · Preview w-104 · Fix details w-116) so they
  align down the whole list; **File (green, renamed from "Confirm & file") sits ABOVE
  Trash** in a right-hand stack. Evidence line dropped the "read from:" prefix (just the
  quoted sentence).
- **Evidence extraction improved** (`evidenceFor` in sorting-desk.ts): now scores
  sentence-chunks and returns the MOST RELEVANT one (expiry year +5, key term +3, a date
  +2, a ref number +1); returns **null when nothing relevant** so we never show noise like
  "…a summary of those duties…". Capitalised, ellipsised. NOTE: the underlying AI READ
  itself is Groq-limited (can't fully fix bad OCR here — only the snippet SELECTION).
- **5-row scroll:** each desk section (Ready to confirm / Unsure reads) caps at ~5 cards
  (max-h-[38rem] + scroll-fade-y) then scrolls.
- **Trash (intake-shell.tsx + restoreFromTrashAction):** added a **Preview** button per
  trashed item (opens the file); **Restore now sends the doc to "To Sort" (quarantine),
  NOT straight to filed** — a wrongly-trashed doc lands where you re-check + confirm it;
  restore also strips the "-EXP" suffix. Delete-forever confirm reworded to nudge a preview.
- **Fix details:** owner asked it open the editor "right there" — currently jumps to
  Library + opens the ?doc= editor (works). The EDITOR ITSELF = redesign is a MOCKUP for
  approval (artifact "cc-doc-editor", 2 dirs: E1 sectioned sheet, E2 file-beside-fields;
  recommended E2 desktop / E1-stacked mobile; both show live clean name + "read" badges).
  NOT built yet — awaiting owner pick.
- **Phase 2 (compliance cards):** replace `ComplianceScorePanel` list with a CARD grid
  — one card/company, worst-first: logo + score ring + 8 category pips (complete/
  missing/expiring) + top missing items → tap = full checklist. Add the
  compliance_tracked toggle (migration) so untracked cos drop out of scoring. Missing
  lives here now. Build the **Replace** flow (upload new → supersede old ·EXP) here.
- **Phase 3 (Company → Category list):** expanding a company shows the 8 shelves as
  sub-sections (count + collapse), documents under each. Kills the "flat long list"
  gimmick. Collapsed company bars can show category pips.
- **Phase 4 (polish):** real company logos in housings (currently accent+initials),
  British dd/mm/yyyy date inputs, slim the 2-row doc filter to 1, stray bug fixes.

## Bugs / rough edges logged
1. 370 conflation (Phase 1). 2. 0%-everywhere over-broad seeding (Phase 2 toggle).
3. Chase/Send-notice are third-party verbs, wrong for own docs (Phase 1). 4. Housings
show initials not logos (Phase 4). 5. Sorting Desk date input US format (Phase 4).
