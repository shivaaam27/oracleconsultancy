# How the Document Room decides things

This is the contract for document intake, in plain English. It exists so the owner
can tell the difference between *the system misbehaving* and *the system working as
designed* — without reading any code.

If you change how intake behaves, change this file in the same commit.

Modelled on the Dropbox `Companies` agent (`_CloudAgent/AGENT.md`), which has run
this way long enough to be trusted.

---

## The one rule that matters

**Never guess between two companies.** A document filed to the wrong company is far
more damaging than a document that waits for you. When the system is unsure, it is
supposed to stop and say why — that is correct behaviour, not a failure.

---

## Where a document can end up

Every document that arrives lands in exactly one of three places.

| Place | Meaning |
|---|---|
| **Filed** | The company was proved, the read was clean. It is in the library and counts toward compliance. |
| **To Sort** | Something needs a human. Each item says what. |
| **Trash** | A duplicate, or a copy superseded by a newer one. Nothing is ever deleted — Trash is recoverable. |

---

## When the system files on its own

It files only when **all** of these are true:

1. **The owner came from a hard signal** — one of:
   - an identifier read off the page (TIN, VRN, an email domain we know),
   - the folder you dropped it into,
   - the batch owner you declared when uploading.
2. **The read was clean** — the scan was legible and confidence was at least 95%.
3. **Nothing was ambiguous** — not a bundle of several documents, not a possible
   duplicate, and not matching two different companies.

Anything softer waits for you. In particular a **fuzzy name match is not enough**
("DSC Ltd" looking like Dar Spice Centre). Those are right often enough to suggest,
not often enough to act on unattended.

**You control this.** Settings → AI & Voice → *Filing documents automatically*:

- **File when certain** *(recommended, default)* — the rules above.
- **Never file** — everything waits, even perfect reads. This was the behaviour
  from 5 July 2026 until this contract was written; it is why the queue only grew.
- **Whenever an owner is found** — also acts on loose name matches. Faster, and it
  *will* file to the wrong company sometimes.

---

## Why something is in To Sort

**The reason is the deliverable.** A held document must say what could not be
settled, specifically enough to act on without opening the file. "Held for review"
is not a reason and should never appear.

Real examples:

- *No company or person matched — nothing in the text, the filename or the folder identified an owner*
- *Owner suggested, not proven — the name "DSC Ltd" matched Dar Spice Centre. Confirm it's Dar Spice Centre.*
- *Read at 82% confidence (below 95%) — check the name and category*
- *Looks like 3 documents bundled together — open it to split them*
- *Looks like a copy of #412 Oracle Business Licence — same content, different file*

If you see a vague reason, that is a bug worth reporting.

---

## Duplicates

Handled in a ladder, safest first:

1. **Byte-identical** to something on file → **Trash**, naming what it copies.
2. **A photo when a proper PDF exists** → the photo goes to **Trash**.
3. **Looks similar but not identical** → **held for you**. Never binned on a guess.

Rule 3 matters more than it looks. **A renewed licence shares almost all its words
with last year's copy.** Anything that binned documents on similarity alone would
quietly destroy your renewals. The system checks expiry dates before ever treating
two documents as the same, and when it cannot tell, it asks.

---

## Renewals and superseded copies

When a renewal is filed, the copy it replaces is retired to **Trash**, tagged `-EXP`,
with the reason *"Renewed by #<id>"*. The two are linked in the database.

This is deliberate: a retired copy must stop counting toward compliance and must stop
firing "expired" alerts. Leaving it active would generate a false overdue warning
forever.

If you tag a file `-OLD` or `-VOID` yourself before uploading, it is recognised and
retired straight away.

> **Known gap:** from the *current* document there is no on-screen link back to the
> version it replaced. The link exists in the data but is not shown. Worth adding.

---

## The shelves

Nine, mirroring the Dropbox folders. Do not invent variants.

| | Shelf | What belongs |
|---|---|---|
| 01 | Legal & Registration | Incorporation, MEMART, BRELA searches, TIN |
| 02 | Licences & Permits | Business licences, OSHA, fire, sector permits |
| 03 | Tax | TRA assessments, returns, withholding tax, clearances |
| 04 | Banking & Finance | Mandates, statements, invoices, receipts, insurance |
| 05 | People & HR | Contracts, offer letters, NIDA, CVs, payroll |
| 06 | Immigration | Passports, work/residence permits, visas, invitation letters |
| 07 | Contracts & Leases | Leases, service agreements, supplier contracts, NDAs |
| 08 | Operations & Branding | Logos, letterheads, profiles, operational reports |
| 09 | Travel | Business flights, hotels, itineraries |

**Travel vs Immigration:** a speculative "dummy" flight booking bought to satisfy a
visa application is *immigration paperwork* and belongs on shelf 06 with the rest of
that application — not on Travel. Travel is for trips actually being taken.

An unrecognised category is never lost; it falls to Operations & Branding.

---

## Things that must stay true

1. **Never delete.** Only move — Filed, To Sort, Trash.
2. **Never guess between two companies.** Ambiguity goes to a human.
3. **Every held document carries a specific reason.**
4. **Never bin on similarity alone** — a renewal looks like a duplicate.
5. **A retired copy must stop counting** toward compliance and alerts.
6. **Manual uploads are the owner's call** — "Add document" files directly, with
   whatever owner you chose. These rules govern *automatic* intake only.

---

## History

- **5 Jul 2026** — intake set to suggest-only (`AUTO_FILE = false`). Every read,
  however certain, was queued. The queue only grew.
- **26 Jul 2026** — replaced with the confidence ladder above and made owner-
  configurable. Travel shelf added. Reasons made specific.
