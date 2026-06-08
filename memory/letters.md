---
name: letters
description: "System-wide branded PDF letter generator — letterheads, the letter engine (Draft→Issue snapshot), and the template catalogue"
metadata:
  node_type: project
  type: project
---

# Letters — system-wide branded PDF generator

Generate formal letters (immigration, employment, verification, discipline…) on each company's branded letterhead, edit freely, then issue + PDF. Owner-designed letterheads supported. Routes: `/letters` (list + New), `/letters/[id]` (editor), `/letters/[id]/print` (branded A4 print route). `/letterheads` (per-company branding setup).

## Per-company letterhead (`/letterheads`, on `companies` table)
Three styles per company (`letterhead_mode`), dynamic:
- **typed** — composed header from fields (`legal_name`, `address`, `phone`, `email`, `registration_no`, `tin`) + `logo_path` + signatory.
- **images** — designed **header band** + **footer band** images (repeat on every printed page).
- **background** — a full-page A4 background image.
Plus `content_top_mm`/`content_bottom_mm` body margins so text never overlaps the design. Logo/header/footer/background stored in the `documents` bucket under `company-letterhead/`. `signatory_name`/`signatory_title` always typed. Owner decision: editing letterhead in the letter editor **updates the company everywhere**; issued letters still keep their own frozen snapshot. `src/app/letterheads`, `src/components/letterhead-editor.tsx`.

## The letter engine (`letters` table, migration 0029)
- **Lifecycle: Draft → Issue.** Draft is fully editable and renders the **live** company letterhead. **Issue** freezes a `letterhead_snapshot` (JSON) + stamps `ref` + `letter_date` and locks it. Reprints are identical; to change an issued letter → **Duplicate → revise → re-issue** (history kept).
- **Full body editing**: the whole body is an editable text field (`[bracketed]` placeholders for fill-ins); addressee/subject/ref/date editable; company switchable.
- **Ref numbers**: `PREFIX/TYPECODE/YYYY/NNN` (e.g. `DS/INV/2026/014`), editable.
- **Output**: Download PDF (in-place hidden-iframe `window.print()` of the print route — no new tab) + optional **Outbox draft** (email, attach PDF yourself). **No auto-send.**
- **Font**: matches the Director Brief (system sans-serif, `var(--font-sans)`), for consistency across the system's PDFs.
- `src/lib/letters.ts` (engine + templates), `src/lib/letters-shared.ts` (client types + `LETTER_TEMPLATES`), `src/components/letter-editor.tsx`, `src/components/letters-list.tsx`.

## Templates
Adding a type = add to `LETTER_TEMPLATES` (id/label/group/needsPerson) + a `buildBody(ctx)` fn in `lib/letters.ts`.
- **DONE: invitation** (someone coming from abroad to work) — auto-pulls invitee name/nationality/passport/DOB/role; addressee selectable (Embassy/Immigration/TWIMC/invitee); editable undertaking. **blank/custom.**
- **TODO catalogue** (owner wants, per-company): visa/permit support, sponsorship; employment offer/contract[needs wage 4.4]/confirmation/probation-ext/salary/promotion/transfer; employment & salary verification, reference, **certificate of service** (ELR s.44, needs final-pay 4.6); discipline (warning/show-cause/suspension), **termination/notice** (ELR s.41) + final pay; admin (authorization/demand/bank-opening).

Letters needing money data wait on ELR phases 4.4 (wage) / 4.6 (final-pay). See `memory/v3_plan.md`.
