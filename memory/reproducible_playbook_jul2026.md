# Reproducible "Intelligent System" Playbook (8 Jul 2026)

A generalised, business-agnostic **how-to book** for reproducing this system's core capabilities
(document reading, OCR, AI, RAG, automation, safe autonomy) on ANY site/product — plus a
standalone "make me an AI for my work" API-first blueprint. Built so the owner has a reference
when the details fade, and so the work can be redone elsewhere or handed to someone else.

## Deliverables
- **PDF (the deliverable):** `docs/The-Intelligent-System-Playbook.pdf` — 53pp, book-quality.
- **Source HTML:** `docs/intelligent-system-playbook.html` (self-contained, inline CSS + SVG diagrams).
- **Companion future-work list:** [[future_roadmap_master_jul2026]].

## What's in it (5 parts, 13 chapters, 2 appendices)
- **I Foundations** — the reference architecture; data conventions + the production settings people miss.
- **II Making software read** — ingestion & OCR ladder; the self-learning document brain (5-step owner resolution, dedup, renewals, learning loop).
- **III The intelligence layer** — one model wrapper (key gate + ladders + retry harness); prompting that doesn't hallucinate (REAL prompts included); RAG + hybrid search (RRF); answering/tracing/acting (agent + tool-use).
- **IV Running it for real** — automation & safe autonomy (propose→auto-if-safe→log→undo, 3 tiers); auth + RBAC + data-scope + passkeys; running economics (the real egress/spend lessons).
- **V Do it yourself** — the API-first blueprint (the 5 calls: extract / embed / RAG-answer / tool-use / transcribe, with Anthropic/OpenAI/Groq/Gemini shapes); the phased build order (Phase 0→9).
- **Appendix A** — everything we built (~70 items, title + one-liner, grouped).
- **Appendix B** — the forward roadmap (also in [[future_roadmap_master_jul2026]]).

Callout system: **Recipe** (generalised steps) · **API** (provider-agnostic call shapes) ·
**Gotcha** (real pitfalls) · **Cost** (economics). Real prompts quoted: doc-extraction+KNOWN-RECORDS,
assistant persona, untrusted-data fence, agent planner, extraction system message.

## How it was built (to regenerate/update)
1. Grounded via a 10-agent Workflow (one per subsystem) reading the real code → structured briefs
   (real prompts/snippets/gotchas/reproduce-recipes). Raw output archived in the session tasks dir.
2. Hand-authored HTML with a print-CSS design system (serif display + sans body, aurora cover,
   part dividers, `@page` numbered footers, callout components, inline SVG diagrams).
3. **Rendered to PDF via headless Chrome** (poppler/weasyprint NOT installed on this machine):
   ```
   CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
   "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
     --user-data-dir="<tmp>/chrome-profile" \
     --print-to-pdf="docs/The-Intelligent-System-Playbook.pdf" \
     "file:///C:/Users/User/Documents/cos-system/docs/intelligent-system-playbook.html"
   ```
   GOTCHAS that made it work: use `--headless=new`; ABSOLUTE forward-slash paths + a temp
   `--user-data-dir` (else "Access is denied"); `file:///` URL for input. CSS `@page @bottom-right
   { content: counter(page) }` and named `@page cover { margin:0 }` DO render in this Chrome.
   Verify output pages with `unpdf` (installed): `getDocumentProxy(buf).numPages`.
4. To edit: change the HTML, re-run the Chrome command. Design tokens live in the `:root` block.

## Positioning note
The system itself is NOT for sale right now — the playbook is deliberately generalised (real-world
patterns, not this company's data) so it doubles as a personal reference and a client-facing
"how to build an AI for a business" guide.
