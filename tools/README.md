# Maintenance scripts (not part of the website)

The same scripts as in Microvis.

- `catalog.cjs`: the tools grouped by handout, with the title and one-sentence description of each tile.
- `glyphs.cjs`: the small drawing on each tile (64 x 64 SVG, one style for all).
- `build-site.cjs`: `node tools/build-site.cjs` writes `index.html` from the two files above and updates the
  "Econxvis /" header link and the previous / next links on every tool page. Run it after any change to them.
- `previews.cjs`: screenshots of each tool's main figure, saved as `<tool>/preview.webp` and `preview-dark.webp`
  (needs Playwright with Chromium): `node tools/previews.cjs "ols-projection:#plot3d"`. Re-run for a tool after changing it.
