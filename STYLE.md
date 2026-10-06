# The Microvis style kit

> Copied from the Microvis style kit the user sent. In this repository read `Microvis` as `Econxvis` (`window.Econxvis`),
> and keep the one deliberate difference: no lecture numbers. Project-specific rules are in `CLAUDE.md`.

The look, layout, writing style and technical safeguards of Microvis, packaged so that a new project can start from them.
This folder is laid out like a fresh project: copy it, add the libraries, and you have a working start page and one example page.

```
style-kit/
  README.md            this guide
  CLAUDE-template.md   conventions to paste into the new project's CLAUDE.md
  index.html           start page (generated: do not edit by hand)
  shared/style.css     the whole look: colours, type, panels, controls, tiles, layout
  shared/ui.js         helpers: sliders with number boxes, KaTeX, plot styling, error banner, Safari fixes
  shared/vendor/       Plotly 2.35.2 and KaTeX 0.16.9 (not in this folder: copy Microvis/shared/vendor)
  tools/catalog.cjs    the site title and the list of pages in reading order
  tools/glyphs.cjs     the small drawing on each tile
  tools/build-site.cjs writes index.html, the header link and the previous / next links
  example-tool/        the smallest page in this style: index.html + app.js
```

## Start a new project

1. Copy this folder to the new repository, and copy `shared/vendor/` from Microvis next to `shared/style.css` (or use the zip, which has it).
2. Add an empty file `.nojekyll` at the root, so GitHub Pages serves the files as they are.
3. Edit `tools/catalog.cjs`: site title, one-sentence lead, footer, sections and pages.
4. For each page: copy `example-tool/` to a new folder, add a drawing to `tools/glyphs.cjs`, then run `node tools/build-site.cjs`.
5. Rename what is Microvis-specific if you like: `window.Microvis` in `shared/ui.js`, the economics colours (`--accent*`, `--l2-*`) in `shared/style.css`.
6. Paste `CLAUDE-template.md` into the new project's `CLAUDE.md`, so Claude keeps to the same style.

Open `index.html` straight from disk: no server, no build step, no npm install.

## Principles

These come from the feedback that shaped Microvis.

- **Minimal, beautiful, functional.** Complexity is the enemy. Every element earns its place.
- **Sans-serif.** Helvetica Neue, Helvetica, Arial. No serif text (it looked old-fashioned); serif appears only in KaTeX formulas.
- **Not "AI-looking".** No rounded corners, no shadows, no coloured side stripes, no gradients, no badges everywhere. Flat white sheets on a light grey page, separated by hairlines.
- **Few colours.** Black and white, plus one blue (`--brand`) for what you can click, drag or move. Subject colours (blue/red/orange of the lecture figures) appear only inside figures and their captions.
- **The figure speaks.** Text is short. The student learns by moving things, not by reading paragraphs.
- **Works everywhere.** Phone, tablet, desktop; Safari, Chrome, Firefox; light and dark mode; offline and from a local file.

## Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f7f8` | `#0d0f12` | page background |
| `--panel` | `#ffffff` | `#14171c` | panels, tiles |
| `--ink` | `#111318` | `#e9ecf1` | text, main curves, chosen buttons |
| `--muted` | `#5d6370` | `#9aa1ad` | secondary text, captions, hints |
| `--line` | `#e1e3e8` | `#272b33` | hairlines, borders |
| `--grid` | `#eceef2` | `#20242b` | plot grid |
| `--brand` | `#1d5bd8` | `#7aa7ff` | links, sliders, focus, the accent of the tile drawings |

Dark mode follows the operating system (`prefers-color-scheme`), and `data-theme="light|dark"` on `<html>` can force either. Figures read their colours from these tokens (`Microvis.theme()`), so they switch too.

## Type

| Element | Size | Weight |
|---|---|---|
| body | 15px / 1.5 | 400 |
| page title (h1) | 28px (23px on phones), letter-spacing −0.02em | 700 |
| start-page title | 40px (32px on phones), −0.03em | 700 |
| start-page lead | 18px, muted | 400 |
| panel heading | 15px | 700 |
| control-group heading | 11px, uppercase, letter-spacing 0.08em, muted | 700 |
| tile title | 16.5px | 700 |
| tile text, captions | 14px / 13px, muted | 400 |

## Page anatomy

**Start page** (`body.home`, max 1240px wide): title, one-sentence lead, a small work-in-progress note, a row of section links, then one section per lecture: a small uppercase label ("LECTURE 1"), a heading, and a grid of tiles.

**Tiles**: a hairline grid (no gaps, no shadows). Each tile is a 64px drawing, a title and one sentence. On hover (mouse only) a screenshot of the page fades in over the tile (`preview.webp`, `preview-dark.webp`); touch devices never download it. On phones the drawing sits left of the text.

**A page**:

```
Microvis / Lecture 1 · Theory of the firm        <- eyebrow: link to the start page section, then context
Building the MRTS                                <- h1
MRTS(z) = φ1/φ2                                  <- subtitle: the key formula (KaTeX); pieces split at \qquad
┌ controls (300px) ┐ ┌ main figure ───────┐ ┌ side (400px) ┐
│ How to read this │ │ panel-head + plot  │ │ small plots  │
│ GROUP HEADING    │ │ caption (legend)   │ │ key numbers  │
│ sliders, buttons │ └────────────────────┘ │ checks       │
└──────────────────┘                        └──────────────┘
← Previous            All pages                    Next →
footer
```

Breakpoints: below 1250px the side panels move under the figure; below 800px everything is one column (controls, figure, side) and "How to read this" starts closed; below 640px the pager and the tiles compact.

## Components (all in shared/style.css)

- `.panel` white sheet with a hairline; `.panel-head` heading row with buttons on the right.
- `.group` a block of controls, `.group > h2` its small uppercase heading.
- `.ctrl` slider plus number box, built by `Microvis.controls()` from `data-key data-label data-hint data-min data-max data-step` (`data-log="1"` for a log scale).
- `.seg` segmented switch (black when chosen); `.btn-row` small square buttons (presets, cameras).
- `select`, `input[type=number]` square, hairline border.
- `details.howto` "How to read this": `<p>` then `<ul>` of things to try.
- `.caption` the figure legend, with colour keys: `<span class="c-accent"><span class="key"></span>label</span>` (`.key.dash`, `.key.dot`).
- `.readouts dl` key numbers; `.checks` a list with ✓ / ✗ marks; `.badge` a small outlined label.
- `.formula` a KaTeX block in the controls; `.subtitle` the header formula.
- `.status-banner` the error box (filled by `Microvis.showError`).
- `[data-show="a|b c"]` shown when (a or b) and c hold: `Microvis.applyVisibility(preds)`.

## Writing

Engaging but academic. Precise, never boring. Short.

- **Tile**: one sentence, at most about 20 words, that makes you want to click.
  "Two marginal products make one slope: why MRTS₂₁ = φ₁/φ₂." / "Climb the profit hill directly, or minimise cost first: the same summit."
- **How to read this**: the idea in two or three sentences, then two or three things to try, each an action and what to notice.
  "Drag z̄ up the isoquant: φ₁ grows, φ₂ shrinks, the MRTS rises." / "Shrink Δz₁: the finite step and the tangent come together."
- **Captions** are legends: what each colour is. No repetition of the guide.
- Name buttons exactly as they are labelled, in bold. Avoid "below" or "on the right": the layout changes with the screen.
- Use the notation of the course notes, everywhere, consistently.
- No course code, no university name, no contact details on the pages.

## Tile drawings

64 × 64 SVG in `tools/glyphs.cjs`. Axes: a faint L (`AX`). Main curves: ink, 2px (`L`). Secondary: thin and faint (`S`). The one object the page is about: the accent (`A` line, `F` fill, `D` point). Draw only what the idea needs; check the drawings side by side on one sheet before publishing.

## Safeguards (learned the hard way)

- **Cache.** Our CSS and JS are linked with a version tag (`style.css?v=3`). Raise it in all pages whenever a shared file changes, or browsers combine a new page with an old stylesheet. The tile drawings carry `width`/`height` and the previews `style="display:none"`, so even without the stylesheet the start page stays tidy.
- **Safari scrollbars.** KaTeX often draws a pixel beyond its box; Safari then shows a scrollbar. Formula boxes clip by default and `ui.js` adds `.scrolls` only when the content is really more than 3px too wide. Header formulas are split at `\qquad` into pieces that wrap.
- **Safari figure size.** Plotly measures its box once; `ui.js` resizes every `.plot` with a ResizeObserver when its box changes.
- **Plotly.** With `scaleanchor`, use `Plotly.newPlot` when the axis range changes (`react` keeps the old domain).
- **Errors are visible.** `Microvis.guard('figure', fn)` and the global handlers show errors in the banner, not only in the console. A missing library is reported in plain words.
- **Offline.** Libraries are bundled in `shared/vendor/` and loaded with relative paths. No CDN.
- **Phone.** Controls come first, so the guide starts closed; figures get smaller fixed heights; no horizontal scrolling at 375px.

## Before publishing

- Every page loads without errors (a Playwright script that opens each page and collects console errors).
- No horizontal scroll at 375px; no unneeded scrollbars at 1440, 1280, 1024 and 768px.
- Look at screenshots: light and dark, desktop and phone.
- Math in `model.js`, tested in Node against independent calculations (finite differences, brute force).
