# Files — the file management system (plan, 24 Sept 2026)

The owner: "I never made a proper file management system… everything was done by
AI and it was a pain." He wants Dropbox — fluid, easy — in the Studio design,
with the animated folder he supplied (a back panel, three papers and a frosted
flap that swings open on hover/click). `Documents` is renamed **Files**.

**Mockup (the spec once he approves it):** `design/studio-mockup/files/files.html`,
published privately at https://claude.ai/artifact/69JngBfh9F1L5cJMeHteN3 .
Run locally: `python -m http.server 8799 --directory design/studio-mockup/files`.

## What exists (measured 24 Sept 2026)
197 files, 193 MB, all with a stored file: 163 PDF, 20 JPG/JPEG, 6 PNG, 8 DOCX.
161 filed to a company (PES 65, DSC 20, OC 18, MES 18, Furaha 15, TG 13, V1 11,
VA 1), 33 to a person, 0 to a vendor. Categories: Legal 37, Licence 33,
Operations 23, Immigration 21, Banking 19, Contract 17, Tax 15, Passport 11,
Lease 8, Other 5, Attachment 3, Travel 3, Certificate 2. Nothing archived.
There are NO folders today — company + category is the only structure.

## Research — the Dropbox patterns worth copying
- A left rail: All files · Recent · Starred · (ours: Needs renewal) · Deleted,
  then the folder tree. A breadcrumb path at the top of the work area.
- Folders first, files under them; list OR grid; a file row shows its type
  icon, name, who added it, size, modified — actions appear on hover
  (preview · download · ⋯), everything also on right-click.
- Selection: click, Ctrl/⌘-click, Shift-click ranges, Ctrl+A; a floating bar
  with Download · Move · Star · Delete.
- Keyboard (Dropbox's own list): ↑/↓ move, Enter opens, / searches, ? shows the
  shortcuts. Ours adds Space = preview, F2 = rename, Delete = to Deleted.
- Drop files anywhere on the page → they upload INTO the folder you are in; an
  uploads tray bottom-right with progress. Drag a row onto a folder to move it.
- Preview is a full-screen viewer with ← → through the folder and a details
  panel; nothing downloads to look at it.
- Deleted files are kept (30 days) and restorable.
Sources: help.dropbox.com/organize/keyboard-shortcuts; Dropbox's 2023 web
redesign notes (left nav + folder tree, persistent action bar, redesigned
previews).

## The folder (from the owner's component)
321×270 base, scaled. Back panel radius 25 with an inset glow; three 164×214
papers with ruled lines; the flap path (tab on the LEFT, lower on the right),
backdrop-blur 6px, rotateX −15° rest / −45° hover / −55° open; papers rise and
fan on hover (delays 0.12 / 0.06 / 0 s) and fly up on open. Themes black /
white / blue. Build with **framer-motion** (installed; the prompt's
`motion/react` is the same API) and the prompt's spring numbers
(stiffness 120, damping 13–14). ⚠️ The black theme's flap opacity 0.25 read as
nearly white over the papers — the mockup uses 0.82 to match his reference.
Badges bottom-left of the flap = the company's prefix tile (his reference used
app logos). The hover tile behind a folder is a soft grey rounded square.

## Build plan (after his decisions)
1. **Folders.** `folders` table (id, name, parent_id, colour, company_id?,
   person_id?, created_at/by, deleted_at) + `documents.folder_id`,
   `documents.deleted_at`, `documents.starred`. File the 197 existing files
   into folders (his choice of structure). A company/person folder stamps its
   company/person on what lands in it, so expiry reminders keep working.
2. **The Files page** (Studio): rail, breadcrumb, summary cards (the "Taskello"
   dark-tab cards), animated folders, list + grid, search, sort.
3. **Doing things:** upload anywhere (direct to storage, the existing signed
   upload slot), rename in place, download one / many (.zip), move (drag or
   dialog), star, new folder (name · colour · company), delete to Deleted,
   restore. Every write owner-checked.
4. **Preview:** PDF and pictures full size in the viewer; Word as readable
   text; ← →; details panel with expiry, reminder, linked tasks, "Renew".
5. **Finish:** keyboard, phone layout, the old Documents page retired behind
   the Studio switch, MCP `create_document`/`list_documents` taught folders,
   the staff portal's "Your documents" unchanged.

## BUILT — 24 Sept 2026 (all five stages; the owner's answers: filing yes · Deleted 30 days · name "Files Management", no "Documents" anywhere)

- **Migration 0169** (`folders`; `documents.folder_id / deleted_at / starred / file_size`),
  RLS on, anon revoked (security check passes). Filed on apply: 8 company folders
  with 44 category folders, "Staff papers" with 12 person folders; 194 filed,
  3 loose at the top; sizes for all 197 from storage.objects.
- **Deleted = archived + deleted_at.** Every other reader already skipped archived
  rows, so a deleted file vanishes from the company page, person page, search and
  reminders with no change to them. `setDocumentArchived` now stamps/clears
  `deleted_at`, so Claude's and ORI's "archive" land in Deleted on the same clock.
  `purgeExpiredDeleted` (lib/files.ts — NOT a server action) runs in the morning
  cron (step 1e) and removes rows + stored files after 30 days.
- **Page** `/files` (`components/files/*`): rail · path · summary cards · animated
  folders (`folder-icon.tsx`, framer-motion, the owner's springs; black flap 0.82
  not 0.25) · list/grid (grid shows real picture thumbnails) · sort · search ·
  selection (click / Ctrl / Shift / Ctrl+A) with a floating bar · right-click
  menus · drag rows onto folders or the path · drop files anywhere to upload
  (XHR to a signed URL, tray with progress) · F2 rename · Space preview · Delete ·
  New folder (name, colour, company) · Deleted with Restore / Delete for good.
  State lives in memory; the address carries `?f=`, `?view=`, and arrival links
  `?co=` / `?pe=` / `?open=`. ⚠️ **Not `?company=` / `?person=`** — those open the
  global company/person drawer on any page.
- **Preview** (`file-preview.tsx`): PDF in the browser's viewer via `/api/files/[id]`
  (302 to a 5-minute signed URL; `?dl=1` downloads under the owner's name);
  pictures; Word via mammoth → `srcDoc` (⚠️ not `src` — every COS page carries
  X-Frame-Options: DENY). Details panel edits expiry, reminder, type, reference,
  issuer, notes; **"Read it for me"** fills EMPTY boxes from the AI reader and saves
  nothing; "Make a renewal task". ⚠️ Colours are inline there — the global field
  rule and `.studio` colour are unlayered CSS and beat utilities.
- **.zip** `/api/files/zip` (jszip, STORE): several files or whole folders, the
  folder structure kept from the chosen folder down; ≤400 files.
- **Every other creator** (Claude, portal, chat/task attachments, event papers)
  goes through `createDocument`, which now files into the company's folder (and
  its category folder) or the person's folder — never loose.
- **"Documents" is gone from the UI**: nav label "Files Management" (id stays
  `documents` so pinned shortcuts survive), `/documents` and `/documents/[id]`
  redirect (company→`?co=`, person→`?pe=`, doc→`?open=`), ~37 files relinked,
  labels renamed (company/person pages, home, palette, portal "Your files",
  search labels). Retired: documents-workspace, documents-table,
  bulk-upload-dialog, and the UNAUTHENTICATED `read-actions.ts`.
- Footer "+" on /files is **Upload** (`files:upload` event).
- Tested live end to end with a throwaway folder + file (create, upload, rename,
  delete, restore, delete folder, delete for good) — then verified gone from the
  table AND storage.

**Open:** the storage bucket caps files at **20 MB** and only listed types
(PowerPoint isn't) — unlisted types are sent as octet-stream so they still upload;
raising the cap is the owner's call. `app/documents/actions.ts` exports have no
owner check — MCP and ORI call them without an admin session, so they need a
caller-aware guard, not a blanket one.

## 24 Sept 2026 (evening) — the two cards, spacing, "Check the details"
- **The two dark cards** (owner: every page opens with them, "there must be
  continuity") replace the Taskello trio: left = scope · size · files · expired /
  due soon / loose · PDF / pictures / Word / folders; right ("Needs renewal",
  rings) = the four soonest expired/due files, click → preview. **Inside a folder
  they speak for that folder** (PES Ltd: 65 files, 4 due). Kit pieces only
  (`StudioCardRow lg:h-[210px]`, `StudioCard tone="dark"`, `CardHead`, `BigNumber`).
- ⚠️ **The big gap the owner saw was `html body:has([data-studio-frame]) main
  { padding: 40px… }` hitting the work area, which was a SECOND `<main>`.** It is a
  `div` now. **Never put a `<main>` inside a Studio page** — the rule pads it 40px
  on every side, and a nested main is invalid HTML anyway. The path row now sits
  level with the rail's first item (both at the same top, 34px).
- **"Check the details"** — the AI screening step. After an upload the tray offers
  it (spinner until the new rows arrive); the preview opens over just those files
  in `review` mode: each is read as it comes up, boxes fill (only empty ones),
  **nothing saves until Save & next**; Skip / Finish move on. The details panel
  shows on a phone in this mode. Tested live with throwaway .txt files: only the
  one saved was written; all four then removed from the table and storage.
  ⚠️ Two traps found doing it: compute the fill from a **ref of the current
  values, not inside a setState updater** (the updater runs later — count came out
  0 and the boxes were never marked unsaved); and guard the auto-read with a ref,
  because dev runs effects twice and each run is a paid AI call.
