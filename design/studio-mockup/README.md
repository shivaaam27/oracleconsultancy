# Studio redesign — the mockup (the specification)

Published: https://claude.ai/artifact/KtgVP9gLJr4yAcceLwJtxt (private to the owner).
This folder is the source of that canvas, kept so the design survives the session.

- `boards/` — one `.dc.html` per screen + `canvas.json` (the canvas layout, 6 pages).
- `gen/` — Python that writes the boards. `kit.py` holds the shared look (colours,
  textures, rings, header, footer). Run `python gen/p_<page>.py`, then `python gen/check.py`
  (tag balance) — every board must print `ok`.
- `preview/` — a tiny local renderer. `python preview/build.py` writes `preview/index.html`;
  serve the folder (`python -m http.server --directory preview`) and open `#Main.dc.html`.

The build plan is `boards/Plan.dc.html`; which feature lands where is `boards/Coverage.dc.html`
and, for Tasks in detail, `boards/FeatureMap.dc.html`.
