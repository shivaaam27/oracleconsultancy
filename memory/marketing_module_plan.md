---
name: marketing-module-plan
description: "The Marketing module (social media + photography) — why it exists, what is built, every rule it enforces, and the phases still to come. Read before touching /marketing."
metadata:
  type: project
---

# Marketing — social media and photography

`/marketing`. Built 25 Aug 2026. **Phases 1–3 are BUILT, DEPLOYED and on
master** (migrations **0158 · 0159 · 0160**, each applied and proved by effect).
Phases 4–6 are not started and are the ones that wait on platform approvals.

---

## 1 · Why it exists, in the owner's own frame

Oracle Consultancy is launching as a **recruitment agency**; before placements
there is brand-awareness posting. **Pamoja Plus** becomes the advertising agency
and the parent for all the group's posts. **CocoZuri** needs its posts
redesigned. **Terra Green** he handles himself. Outside clients get
**three months free — design and posting free, and the ADVERTS RUN AT OUR
COST**.

Four questions get asked constantly and had no answer anywhere:

- **What went out?** Which post, which account, which day, which picture.
- **Who did it and who approved it?**
- **Did it work?** Reach, engagement, followers.
- **What did it cost us?** Ad spend, and what the free offer really costs.

Everything in the module exists to answer those four. It is **a record system
with a calendar attached** — not a design tool. Images are still made in Canva
or Photoshop.

## 2 · The owner's answers (25 Aug 2026) — these shaped the build

| Question | His answer | What it changed |
|---|---|---|
| Which accounts | **All four platforms, all run by him**, all **professional accounts** | Four connections to arrange eventually, all under his own control |
| Who posts | **Himself, alone** | **No approval gate.** Speed of logging became the whole design problem |
| The free offer | **Design and posting free; adverts at our cost for 3 months** | Spend records who bore it; the clock starts on the first post |
| Client logins | **No** | A whole permissions layer removed from every phase |

⚠️ **HE SET NO START DATE FOR THE FREE OFFER** because posting had not begun.
That is why the clock is DERIVED (see §5).

⚠️ **HE NAMED NO SPENDING CAP PER CLIENT.** The field is optional and an unset
cap is reported as "no limit agreed", never as zero.

## 3 · Why the platforms come LAST — the research that set the order

Checked 25 Aug 2026. This is the single most important decision in the plan.

| Platform | To read results | To post from COS | How long |
|---|---|---|---|
| Instagram + Facebook | Business/Creator account **linked to a Facebook Page** | separate publishing permission | **2–4 weeks** per review round |
| TikTok | app approval | approval **and an audit** — until it passes, posts stay private | **2–6 weeks** |
| LinkedIn | approved **partner** status — small agencies are often refused | same | unpredictable |

All three also need **business verification** (company documents), a **public
privacy policy**, and a **screencast of the app**. That is paperwork, not
programming, and it is the slow part.

⚠️ **INSTAGRAM TOKENS LAST 60 DAYS AND DO NOT RENEW THEMSELVES.** Every tool
that ever quietly stopped collecting numbers stopped for this reason. When
Phase 4 lands, the module must **say on screen** that a connection has gone
stale — never show older figures as if they were current.

**So: build the record now, connect later — first to read, much later to
publish.** Reading is far easier to get approved than posting, which is why it
comes first.

## 4 · What is built

### Phase 1 — the record and the calendar (migration 0158)

`mkt_clients` · `mkt_accounts` · `mkt_campaigns` · `mkt_posts` ·
`mkt_publications`

Screens: `/marketing` (Overview) · `/posts` · `/calendar` · `/accounts` ·
`/clients` · `/campaigns`

### Phase 2 — photography and the library (migration 0159)

`mkt_shoots` · `mkt_assets` · `mkt_post_assets`

Screens: `/shoots` · `/library` (labelled **Pictures**)

Private storage bucket **`marketing`**, created by `npm run mkt:bucket`.

### Phase 3 — results and money (migration 0160)

`mkt_results` · `mkt_spend`

Screen: `/results`

### Not built

- **Phase 4 — reading the numbers automatically.** Instagram/Facebook first.
  Adds rows with `source: "platform"` and changes nothing else.
- **Phase 5 — posting from COS.** Deliberately last: saves minutes a day, needs
  the strictest approval, and is the one thing that can fail publicly at 3am.
- **Phase 6 — letting other people in.** Dropped for now (he posts alone, no
  client logins). When he hires someone: staff-portal access, and approval
  switches on. **No table changes needed.**

## 5 · The rules — do not quietly undo any of these

### Enforced by the database

- **An account belongs to exactly one owner** — one of ours, or a client's.
  CHECK constraint. An account belonging to both or neither cannot be reported on.
- **A picture a post was made from cannot be deleted.** `mkt_post_assets` is
  ON DELETE RESTRICT. Deleting one would quietly rewrite what a post was.
- **Spend records who bore it** (`us` | `client`) and **cannot be negative**.
- **One reading per publication per source per moment** — a double-tap on Save
  must not become two readings that then average to nonsense.

### Enforced by the write door

- ⚠️ **A RESULT IS A READING ON A DATE, NEVER A COLUMN.** Reach on day one and
  reach a month later are different facts and both are true. The gap between
  them is the only thing showing whether a post kept working. Same rule as a
  CocoZuri price being a dated row.
- ⚠️ **TYPED AND PLATFORM FIGURES ARE NEVER BLENDED.** They count differently
  and revise for days. The module keeps both, says which is which, and never
  reconciles them into one blessed number.
- ⚠️ **A MISSING FIGURE IS NOT A ZERO.** `sumKnown` returns null when nothing is
  known, and `followerGrowth` SKIPS readings with no follower count — otherwise
  a reading typed in a hurry looks like every follower vanished and came back.
- ⚠️ **AN EMPTY READING IS REFUSED**, and so is one dated in the FUTURE.
- ⚠️ **THE FREE THREE MONTHS STARTS ON THE FIRST POST**, not the handshake. It
  is derived from the earliest `published_at` on that client's own accounts. A
  stated `free_starts_on` beats it, and the screen says which it is.
- ⚠️ **NO CAP AGREED IS NOT A CAP OF ZERO.** `capCheck` reports the spend and
  says no limit was agreed rather than claiming an overrun.
- ⚠️ **CONSENT ON A SHOOT IS THREE-STATE.** A photograph of an identifiable
  person is their personal information under Tanzania's rules, and the
  recruitment side already carries a PDPC obligation. "Nobody has said" is not
  "no" and must NEVER default to "yes".
- ⚠️ **`professional` ON AN ACCOUNT IS THREE-STATE.** A personal account can
  never hand its numbers to an outside system however this is built — so
  "nobody has checked" (a five-minute job) and "it is personal" (a wall) must
  not collapse into one another.
- ⚠️ **A PUBLICATION IS NEVER DELETED.** A post taken down from Instagram still
  happened; it is marked `removed` **with a reason**, which is required.
- ⚠️ **"PARTLY OUT" IS A REAL STATE.** One design to three accounts where the
  third failed is not "published" — rounding it up hides the only thing anybody
  needed to know.
- ⚠️ **A REQUIRED TEXT COLUMN CANNOT BE BLANKED.** `requireText()` guards
  title/name: a form helper returning null for an empty field will happily write
  that null into a NOT NULL column, and a field simply MISSING from a form would
  silently wipe the record's name.

### Structural

- ⚠️ **THE BYTES NEVER PASS THROUGH THE SERVER.** The browser uploads straight
  to the private bucket on a one-shot signed URL; the server only ever sees the
  PATH. A serverless request body caps at 4.5 MB and a phone photo is bigger, so
  a route carrying the file would refuse exactly the pictures somebody just
  took — and the failure reads as "it did not save", not "too big".
- ⚠️ **THE PATH IS STORED, NEVER A URL.** Links are minted on read; the bucket
  is private, so a saved URL would either expire in the record or be a permanent
  address anybody could pass around.
- ⚠️ **`recordAsset` MOVES THE FILE OUT OF `uploads/` FIRST** and moves it back
  if the row fails. There is no transaction across storage and the database.
- ⚠️ **NOTHING DERIVED IS STORED.** No post status, no free-period end date, no
  counts, no totals. All worked out on read.
- **Client/server split**, as everywhere: `marketing-shared.ts` and
  `marketing-results-shared.ts` are what client components import;
  `marketing.ts`, `marketing-assets.ts` and `marketing-results.ts` are
  server-only and are the ONE DOOR for writes.

## 6 · Design decisions worth keeping

- ⚠️ **SPEED IS THE WHOLE DESIGN OF THE QUICK LOG.** One person posts; if
  writing it down takes more than a few seconds it stops happening in week
  three, and a half-filled record is worse than none because it still gets
  half-trusted. **Only a title is required.** Same reasoning that shaped
  CocoZuri's batch numbers: the danger was never being wrong, it was not being
  used.
- **The row shows the state; the sheet shows each destination.** Putting three
  publications and their controls in a list row is what made the screen
  unreadable the first time.
- **The rail follows the work**: Start · 1 Plan · 2 Shoot · 3 Post · 4 Measure ·
  5 Set up. The desk's tiles follow the same order — one map of the module, not
  two.
- **Naming**: the rail already says Marketing, so labels repeating it are noise
  (Overview, Calendar, Pictures, Clients). **A page heading matches the rail
  label exactly** — a heading that disagrees with the link that reached it reads
  as a different page.

## 7 · Traps found while building (they cost real time)

- ⚠️ **`FluidSelect`'s outer span is `inline-block`**, so the button's own
  `w-full` resolves against a shrink-wrapped parent — every dropdown came out
  the width of its longest option. **`src/components/select-field.tsx` is the
  reusable fix** and is how you get a FluidSelect into a server-action form
  (COS uses no native `<select>`, and a FluidSelect alone submits nothing).
- ⚠️ **THE LIST CARD IS 590px AT `lg`.** The desk sidebar appears AND every
  `hideBelow` column un-hides at the same breakpoint. **Add up your fixed
  widths.** The Posts title resolved to its 120px floor and truncated every row,
  because `gridFor()` FLATTENS AN fr MULTIPLIER — `1.6fr` competed with `0.9fr`
  as an equal. Fixed by moving the company onto the title's second line.
- ⚠️ **`Input` in `ui.tsx` is still the old `h-9 rounded-lg` shape** while every
  dropdown is `h-8 rounded-md`. Use **`FIELD`**, as that constant's own comment
  instructs.
- ⚠️ **A bucket `fileSizeLimit` above the PROJECT's global limit is refused**
  with "the object exceeded the maximum allowed size" — which reads like a file
  error, not a settings one.

## 8 · Still open

1. **Meta business verification has not been started.** It is the longest pole
   in Phases 4–5 and costs nothing to have running in the background.
2. **No spending cap per client has been agreed.** The field is optional and the
   screen says so rather than inventing one.
3. **No `EntityDef` and no MCP tool**, on purpose — the module is not searchable
   or reachable by Claude yet. Ask the forward-rule question when Phase 4 lands.
4. **The lists have no `ENTITY_VIEWS` entries.** Columns are defined locally,
   because an `ENTITY_VIEWS` key must be an `EntityType`, which implies an
   indexed entity. Do it together with making marketing searchable.
