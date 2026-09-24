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
