---
name: handover-aug25-2026
description: "The 25 Aug 2026 session — the Director Brief PDF fixed and restyled, the Windows app taught to update itself, the CocoZuri guide as a PDF, and the Marketing module built through Phase 3."
metadata:
  type: project
---

# Handover — 25 August 2026

Everything below is **committed and pushed to master** and deployed. Migrations
**0158 · 0159 · 0160** are applied to the live database.

---

## 1 · The Director Brief PDF — a cut-off update, then the ERP skin

**The bug the owner reported:** the "Latest update" column was clamped to 160
characters, so a director read *"…and forwarded"* where the paper should have
said what was forwarded and to whom.

Fixed in `src/lib/brief-pdf.tsx`: the update prints in full, the column went
22% → 30%, and typed line breaks survive.

⚠️ **THE TRAP UNDERNEATH IT.** Rows are `wrap={false}` so they move whole to the
next page rather than splitting mid-cell — but **react-pdf CLIPS an unbreakable
block taller than the page instead of moving it**. `rowMustBreak()` estimates
the height and lets a page-tall row split. The generic `Table` rows carry the
same guard, because the Delivered section already printed untruncated updates.

Then the **ERP skin**, at his ask: number cards first and dense panels under
them — ERPNext's organisation — kept modern rather than flat grey. Letterhead a
soft banded block, counts on tone-tinted cards, each company a rounded tinted
panel head with its risk as a pill, status a pill rather than a dot and a word,
initials on the accent where a company has no logo. **Content did not change.**

⚠️ **@react-pdf/renderer PRINTS NEITHER A SHADOW NOR A GRADIENT, SILENTLY.** All
depth is a flat fill plus a hairline.
⚠️ **A company's table flows UNDER its panel head, not inside a box** — a
bordered box that breaks across a page has its border redrawn on both halves.

## 2 · The Windows app — the 404, and self-updating

**The bug:** pressing Download PDF put the app's **offline screen** over a
working connection and a file that had just saved. That window has no back
button, so the only way out was closing the app.

⚠️ **A DOWNLOAD IS REPORTED AS A FAILED NAVIGATION.** WebView2 turns a
navigation to a `Content-Disposition: attachment` response into a download and
then reports the NAVIGATION as failed — correctly, since no page loaded.
`OnNavigationCompleted` read any failure as "the site could not be reached".
It now watches `DownloadStarting` and knows the difference, and the offline
screen gained a **"Go to the home page instead"** escape.

Fixed on the web side too so it did not wait on a reinstall: `BriefPdfButton`
detects the shell via **`window.chrome.webview`** and fetches the bytes instead
of navigating. ⚠️ **Browsers and the phone keep the same-tab navigation** — the
blob route is silently ignored by iOS Safari.

⚠️ **THE OWNER'S INSTALLED COPY PREDATED THE UPDATE CHECKER ENTIRELY** (built
20 Aug from `0ef0d6cc`; the checker landed 21 Aug). It had never asked COS
anything and never would. **Do not diagnose an app problem without checking
what is actually installed** — it was in `%LOCALAPPDATA%\Programs\Oracle
Consultancy` all along.

**Two releases shipped: 1.0.1 and 1.0.2.** The self-update machinery already
existed and was already live; it simply had no version newer than the one
everybody ran. 1.0.2 adds:

- **A version panel on the tray icon** (right-click → About and updates) with
  **Check for updates** and **Copy diagnostics**. ⚠️ "Could not ask" and "you
  are up to date" read DIFFERENTLY — a failed check never shows a reassuring
  version number.
- ⚠️ **The tray icon is created at start-up now**, not on the first
  notification — it carries the only menu the app has.
- The update bar follows dark mode; downloads show progress; the app reopens on
  the page you were last on; zoom persists with Ctrl+0 to reset.
- ⚠️ **The saved window-state file gained two NULLABLE fields with defaults.**
  That file is written by the version you are upgrading FROM; a required member
  would throw and every first launch after an update would lose its size.

**Releasing:** bump `<Version>` in the csproj AND `DESKTOP_VERSION` (a test
guards the drift), `build-installer.cmd`, **`npm run desktop:upload`** (new —
uploads, then downloads it back and hashes it before telling you the checksum),
paste the checksum, deploy. ⚠️ **Upload BEFORE deploying** — the deploy is what
announces the version.

## 3 · The Windows title bar in dark mode

The app ran a black page under a white Windows caption. ⚠️ **The title bar is
the one part of the window the website cannot paint.**

`ShellThemeScript` (`src/components/shell-theme.tsx`, mounted in the root
layout head) posts `theme:dark`/`theme:light` over `chrome.webview`; the shell
paints caption, text and border with `DwmSetWindowAttribute`. ⚠️ **A COLORREF is
0x00BBGGRR — blue first.** ⚠️ It is an **inline head script** because
next-themes writes the class before React hydrates; a `useEffect` would flash
the wrong colour on every cold start. Guarded on `chrome.webview`, so it does
nothing in a browser or the PWA.

## 4 · CocoZuri — the plain-English guide as a PDF

`npm run guide:cocozuri` → **`CocoZuri - how it works.pdf`** (17 pages, saved in
the cos-system folder). Every screen in working order, one batch of Amber Rabdi
followed from cocoa to the last bar thrown away, and **the money written in
plain words rather than debits and credits**.

The audit found six sections too thin in `memory/cocozuri_how_it_works.md` and
they are now covered: month end and the stock-take, statements, the act of
posting, credit notes as their own document, budget approval, paying people back.

⚠️ **`position: "absolute"` ON A `fixed` FOOTER PRODUCES A GARBAGE COORDINATE**
once the document runs long enough — the render dies with "unsupported number:
-2e+21". Use **`marginTop: "auto"`**, which pins it to the foot of every page
(measured: 58pt from the bottom on all 17). The Director Brief PDF still uses
the absolute form and is simply short enough not to have hit it yet.

## 5 · The Marketing module — Phases 1–3

**Read `memory/marketing_module_plan.md` before touching any of it.** It holds
the owner's answers, the platform-approval research with timescales, every rule
and every trap.

In one line: social media and photography for our companies and for the clients
Pamoja Plus advertises for — **built as a record system, because Instagram,
TikTok and LinkedIn each need an application that takes weeks and can be
refused.**

Ten tables, three migrations, nine screens, 34 tests on the arithmetic.

### The screens were rebuilt once, and the reason matters

They were first written as a permanent form card over a bullet list. The owner:
*"everything feels off and ugly"* — and he was right. **CLAUDE.md says every
list is `RecordList` and not to hand-build one.** Rebuilt on that shell with the
forms in `BottomSheet`.

⚠️ **TWO LAYOUT FAULTS FOUND BY MEASURING, NOT BY LOOKING** — both are general
and will bite the next module:

1. **`FluidSelect`'s outer span is `inline-block`**, so a button's `w-full`
   resolves against a shrink-wrapped parent. **`src/components/select-field.tsx`
   is the reusable fix.**
2. **The list card is 590px at `lg`** — the sidebar appears AND every
   `hideBelow` column un-hides at the same breakpoint. The Posts title resolved
   to its 120px floor because **`gridFor()` flattens an fr multiplier**.

## 6 · What is next

- **Marketing Phase 4** — read Instagram/Facebook numbers automatically. Needs
  Meta business verification, **which has not been started** and is the longest
  wait. Phase 5 (posting from COS) after that.
- **Marketing Phase 6** — portal access, only when somebody else starts posting.
- The **CocoZuri** and **ledger** open questions are unchanged: whether Furaha's
  books should open and from what date, why money is received "in DSC", and what
  date each set of catalogue prices came into force.
- Still owed by the owner from earlier sessions: **rotate the leaked
  credentials**, and **switch the CSP to enforcing** (`CSP_ENFORCE=1`, needs a
  redeploy — `next.config` is read at build time).
