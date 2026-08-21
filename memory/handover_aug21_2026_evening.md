---
description: "Handover — the evening of 21 Aug 2026: offline notes finished and DEPLOYED, the app split into modules, and CocoZuri Operations built through Phase 2. Read this first."
---

# Handover — 21 August 2026, evening

**Read this, then the plan file for whichever thread you are picking up.** The
earlier handover (`handover_aug21_2026.md`) covers the database lock, the Windows
app and offline Notes Stage 1; this covers everything after it.

---

## 1. The shortest version

| Thread | State |
|---|---|
| **Offline notes** | Finished — all three stages. **DEPLOYED to `master`** (commit `8d63280`). |
| **Navigation → modules** | Built, bug-swept and **DEPLOYED**. |
| **CocoZuri Operations** | Phases 1 and 2 built, bug-swept and **DEPLOYED**. |

Everything is on `master`. Migrations 0144, 0145 and 0146 are applied to the live
database and their code is deployed with them.

---

## 2. What the owner said, in his own words

- On the VAT question (7% in the spreadsheets vs 18% standard): *"just build it
  later since its not my business, and keep it flexible so anything can be edit
  easily."* → **every rate is a column or a setting, never a number in code.**
- On offline notes: *"when i am offline i want to have the same notes experience
  and not a different one. basically everything looks the same but if i am offline
  it informed me."*
- On the sidebar: a landing page of module icons, so COS *"starts behaving as a
  proper erp system"*, with Task Management holding everything except Projects,
  Ledger and Recruitment.
- Twice: **"dont push"**.

---

## 3. Offline notes — DONE and LIVE (`memory/notes_offline_plan.md`)

Stages 2 and 3 built, then rebuilt to the owner's correction: `/notes/offline` is
now **the real shelf and the real note page**, fed from IndexedDB, not a separate
plainer screen.

**Two bugs found only by running it with the server switched off** — it had never
been driven offline before:

1. **A cached page with no JavaScript is a white screen.** One visit cached the
   HTML and **zero chunks**, because the first visit's assets are fetched while
   the worker is still installing. "Visit it once" was never true. The worker
   (v15) now caches the page's own `/_next/static/…` out of its HTML. Measured:
   0 chunks before, 46 after, from one visit.
2. **It said "Connected" while nothing could be reached.** `navigator.onLine` is
   true whenever any network exists. Reachability is now what the last request
   actually did.

**Owner still owes:** open `/notes/offline` once on the LIVE site while signed in.
It is now genuinely once.

---

## 4. Navigation is modules now (`memory/erp_navigation_plan.md`)

`/apps` is a launcher of five tiles; the sidebar shows **only the module you are
in**, with a switcher under the brand and **System pinned to the foot of every
rail**. Task Management went from 23 items to 20.

⚠️ **`NAV_ROUTES` was not touched by the split, and that is the whole trick.**
Pins are stored as ids and silently drop unknown ones. A module only ARRANGES
routes. Ten sub-pages of Recruitment and Ledger were ADDED (they existed already
and were reachable only by clicking through the desk).

⚠️ **`src/lib/nav.test.ts` is the guard** — 15 tests: every route filed exactly
once, every module home real, System never inside a module, and the fallback
proven so a page belonging to nothing still gets a rail. **Add a route, file it in
a module, or the test fails.**

⌘K still lists every individual page plus a Modules section. That is what makes
the split safe: nothing became harder to reach.

**Open question for the owner:** *Orders & Imports* (`/ops`) is the whole PES
trading business and would make a sixth tile comfortably. It sits inside Task
Management because that is what he asked for.

---

## 5. CocoZuri Operations (`memory/cocozuri_ops_plan.md` — read it FIRST)

Rebuilt from 18 spreadsheets in `Documents/Cocozuri Operations`. Every one was read
sheet by sheet, formulas included; §1–§3 of the plan hold the measurements and the
**nine arithmetic faults found in the originals**, with figures.

**The four worth remembering:**

1. VAT is computed as a percentage OF the gross instead of the VAT contained in
   it — **overstated by TZS 532,296 across 129 of 140 invoices**.
2. The ageing has **no 61–90 day band**; two unpaid invoices worth TZS 1,567,000
   are mis-aged today.
3. Stock and sales disagree by a quarter (1,014 units vs 814) because the sales
   sheet matches items **by name**.
4. The master holds 140 invoices; the customer files hold **295 sheets**.

**Built:** Phase 1 (catalogue, customers, prices — migration 0145) and Phase 2
(invoices, credit notes, the merge tool — migration 0146). Loaded from the
workbooks: 127 products, 14 customers, 13 branches, 159 prices.

**Left to do:** Phase 3 (money in, ageing with all five bands, statements),
Phase 4 (the daily stock book), Phase 5 (posting to the ledger via `postVoucher()`).

⚠️ **The catalogue still has duplicates** — one bar is typed five ways in the
sheets and came across as five rows **on purpose**. The merge tool is built; only
a person can say which rows are one product. One pair was merged as a test.

⚠️ **`PISTACHIO KUNAFA MILK CHOCOLATE (220GM)` imported as a CATEGORY**, not a
product, because its unit cell is blank in the stock sheet. One row to fix.

**Questions the owner has NOT answered** (plan §4) — do not guess at any of them:
why 7% VAT; why the money is received "in DSC" when Cocozuri invoices; what
`DA/SA/TA` means on the kitchen sheet; whether the airport is billed in USD.

---

## 6. Habits that earned their keep again

- **Run the thing.** Both offline bugs and both invoice bugs were invisible in the
  code and obvious within a minute of actually using it.
- **Report what you skipped.** The seed script names every price it could not
  place rather than attaching it to the nearest-looking product.
- **A stated rule beats a fuzzy match.** Customer-name aliases are written out by
  hand with both spellings visible; product names match exactly, then with a
  trailing `(100 GM)` removed, and only when that is unambiguous.
- **Say it out loud.** 47 products have no price and the desk says so, because a
  product with no price cannot be invoiced and nothing will invent one.

---

## 7. Where things stand for the next session

- **839 tests pass**, type-check clean, production build clean,
  `npm run db:check-security` clean across 135 tables.
- The preview runs on `npm run dev` (`cos-dev` in `.claude/launch.json`).
  ⚠️ The service worker is **production-only** — to test anything offline you must
  `npm run build` then `npm start`, and stop the server to simulate the outage.
- **Still owed by the owner, from the earlier handover and still true:** rotate the
  leaked credentials (to-do #420), and set `CSP_ENFORCE=1` in Vercel (it is read at
  BUILD time, so it needs a redeploy).
