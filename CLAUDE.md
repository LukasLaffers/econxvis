# Econxvis — conventions

Interactive visualizations for the econometrics lectures by Lukáš Lafférs.
Sister project of [Microvis](https://github.com/LukasLaffers/microvis): same setup, same look, same rules.
Published with GitHub Pages; each tool gets a stable URL that can be linked from the lecture handouts (PDF).

## Layout

```
index.html              landing page: one card per tool (no lecture numbers)
shared/style.css        common look (colors, typography, layout, controls); copied from Microvis,
                        plus the colours of the regression figures (--fig-*)
shared/ui.js            small helpers every tool uses (controls, KaTeX, plot styling, error banner); no econometrics.
                        Exposes window.Econxvis with the same API as window.Microvis
shared/vendor/          bundled third-party libraries (Plotly, KaTeX) with their licenses
<tool-name>/            one folder per tool, kebab-case, e.g. ols-projection/
  index.html            the page
  model.js              pure math, no DOM; UMD so Node tests can require it
  app.js                interface and plotting
  style.css             tool-specific CSS (optional)
  test-model.cjs        `node <tool-name>/test-model.cjs` must pass
  SPEC.md               what the tool must show and why (optional but recommended)
```

## Rules

- Plain HTML, CSS and JavaScript. No framework, no bundler, no npm install. Pages must work when served as static files.
- Plotting: Plotly.js 2.35.2, formulas: KaTeX 0.16.9, both bundled in `shared/vendor/` (MIT, licenses included) and loaded with relative paths, e.g. `../shared/vendor/plotly/plotly-2.35.2.min.js`. No CDN: pages must work offline and when opened as local files.
- Keep math in `model.js` and test it numerically against independent calculations (brute-force minimisation, explicit matrix formulas, textbook special cases). Never change model math without updating the tests.
- Use the notation of the lecture handouts (table below).
- Tools load `../shared/ui.js` for controls, formatting and the error banner; tool-specific CSS goes in `<tool>/style.css`.
- Every tool: works on a phone (controls collapse above the plots), has a short "How to read this" text, labels axes, shows the key numbers live, and supports light and dark mode.
- Write all code ourselves. Do not copy code from other repositories without a compatible license. Microvis is ours (MIT) and is the reference for style.
- Add a card for each new tool to `index.html`.
- `.nojekyll` must stay in the root so GitHub Pages serves files as they are.
- No lecture numbers on the pages or the landing page (unlike Microvis). The page eyebrow is the title of the handout, e.g. "Regression basics"; no course code or university name.

## Notation (must match the handouts)

| Object | Symbol |
|---|---|
| model | $y = X\beta + \varepsilon$, $y_i = \beta_0 + \beta_1 x_i + \varepsilon_i$ |
| OLS estimator | $\hat\beta = (X^TX)^{-1}X^Ty$ |
| fitted values, projection matrix | $\hat y = X\hat\beta = Py$, $P = X(X^TX)^{-1}X^T$ |
| residuals, residual maker | $\hat\varepsilon = y - X\hat\beta = My$, $M = I - P$ |
| mean, deviation from the mean | $\bar y$ (the vector $\bar y\,\mathbf 1$), $\bar\varepsilon = y - \bar y$ |
| sums of squares | $TSS=\sum(y_i-\bar y)^2$, $ESS=\sum(\hat y_i-\bar y)^2$, $RSS=\sum(y_i-\hat y_i)^2$ |
| goodness of fit | $R^2 = 1 - RSS/TSS = ESS/TSS = \mathrm{cor}(\hat y, y)^2$ (with an intercept) |

Colours of the regression figures (lecture 1, slide "Geometry: It is a simple projection"), in `shared/style.css`:
$y$ black `--fig-y`; $\hat y$ blue `--fig-yhat`; $\hat\varepsilon$ / RSS red `--fig-resid`; $\bar y$ green `--fig-ybar`;
$\bar\varepsilon$ / TSS yellow `--fig-ebar`; $\hat y-\bar y$ / ESS purple `--fig-ess`; the column space `--fig-plane`.
