/*
 * Econxvis: small helpers shared by all tools (no econometrics here).
 * Kept identical to shared/ui.js of Microvis, except the name (window.Econxvis) and the regression-figure
 * colours in theme().
 * Formatting, KaTeX, slider+number controls, plot styling, error banner.
 * Exposes window.Econxvis.
 */
(function (root) {
  'use strict';

  const $ = id => document.getElementById(id);

  // ---------- formatting ----------

  function fmt(x, d = 2) {
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    if (x === Infinity) return '∞';
    if (x === -Infinity) return '−∞';
    const a = Math.abs(x);
    if (a !== 0 && (a >= 1e4 || a < 1e-3)) {
      const [m, e] = x.toExponential(2).split('e');
      return `${m.replace('-', '−')}×10^${Number(e)}`;
    }
    return x.toFixed(d).replace('-', '−');
  }
  // Short number for formulas: 0.50 -> 0.5, 1.00 -> 1.
  const num = x => String(Number(x.toFixed(2)));
  const pt = (a, b, d = 2) => `(${fmt(a, d)}, ${fmt(b, d)})`;

  function tex(el, src, displayMode = false) {
    if (root.katex) root.katex.render(src, el, { throwOnError: false, displayMode });
    else el.textContent = src;
  }
  const texStr = src => root.katex ? root.katex.renderToString(src, { throwOnError: false }) : src;
  // In the page header, formulas separated by \qquad become separate pieces: each piece stays on one
  // line, and on a narrow screen the pieces wrap instead of the whole line scrolling.
  function renderStaticTex(scope = document) {
    scope.querySelectorAll('.tex[data-tex]').forEach(el => {
      const src = el.dataset.tex;
      if (!el.closest('.subtitle') || !src.includes('\\qquad')) { tex(el, src); return; }
      el.textContent = '';
      src.split('\\qquad').map(t => t.trim()).filter(Boolean).forEach(part => {
        const piece = document.createElement('span');
        piece.className = 'tex-piece';
        el.appendChild(piece);
        tex(piece, part);
      });
    });
  }

  // ---------- numbers ----------

  const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  const logspace = (a, b, n) => linspace(Math.log10(a), Math.log10(b), n).map(x => Math.pow(10, x));
  const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------- controls ----------

  /*
   * Turn <div class="ctrl" data-key data-label data-hint data-min data-max data-step [data-log="1"]>
   * into a slider with a number box bound to state[key].
   * opts.onChange() runs after every change; opts.adjust(key, v) may modify a new value (snapping).
   */
  function control(el, state, opts = {}) {
    const key = el.dataset.key, log = el.dataset.log === '1';
    const min = Number(el.dataset.min), max = Number(el.dataset.max);
    const step = log ? 0.005 : Number(el.dataset.step);
    el.innerHTML =
      `<div class="ctrl-label"><label for="${key}-range"><span class="lbl"></span></label>` +
      `<span class="hint">${el.dataset.hint || ''}</span></div>` +
      `<div class="ctrl-row">` +
      `<input type="range" id="${key}-range" min="${log ? Math.log10(min) : min}" max="${log ? Math.log10(max) : max}" step="${step}">` +
      `<input type="number" id="${key}-num" min="${min}" max="${max}" step="${log ? 0.01 : step}" aria-label="${key} value">` +
      `</div>`;
    tex(el.querySelector('.lbl'), el.dataset.label);
    const range = el.querySelector('input[type=range]'), box = el.querySelector('input[type=number]');
    const dec = log ? 2 : Math.max(0, (String(step).split('.')[1] || '').length);
    const round = v => log ? Number(v.toFixed(3)) : Number((Math.round(v / step) * step).toFixed(dec));

    const c = {
      el, range, box, min, max, hintEl: el.querySelector('.hint'),
      sync() {
        const v = state[key];
        range.value = log ? Math.log10(clampTo(v, c.min, c.max)) : clampTo(v, c.min, c.max);
        if (document.activeElement !== box) box.value = v.toFixed(dec);
      },
      // Set from the user: rounded to the step and kept inside [min, max].
      set(v) {
        if (!Number.isFinite(v)) return;
        v = round(clampTo(v, c.min, c.max));
        if (opts.adjust) v = opts.adjust(key, v);
        state[key] = v;
        c.sync();
        if (opts.onChange) opts.onChange(key);
      },
      // Change the slider range (e.g. a price range that depends on other parameters).
      setRange(lo, hi) {
        c.min = lo; c.max = hi;
        range.min = log ? Math.log10(lo) : lo; range.max = log ? Math.log10(hi) : hi;
        box.min = lo; box.max = hi;
        c.sync();
      },
      // Set exactly (e.g. "go to this point"), even outside the slider range.
      setExact(v) {
        if (!Number.isFinite(v)) return;
        state[key] = v;
        c.sync();
        if (opts.onChange) opts.onChange(key);
      }
    };
    range.addEventListener('input', () => c.set(log ? Math.pow(10, Number(range.value)) : Number(range.value)));
    box.addEventListener('change', () => { c.set(Number(box.value)); box.value = state[key].toFixed(dec); });
    c.sync();
    return c;
  }

  // Build every control inside scope; returns {key: control}.
  function controls(scope, state, opts) {
    const out = {};
    scope.querySelectorAll('.ctrl[data-key]').forEach(el => { out[el.dataset.key] = control(el, state, opts); });
    return out;
  }

  // Coalesce many changes into one redraw per animation frame.
  function scheduler(render) {
    let pending = false;
    return function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; render(); });
    };
  }

  /*
   * Show or hide [data-show] elements. data-show holds space-separated conditions that must
   * all hold; a condition "a|b" holds if either predicate holds. preds = {name: boolean}.
   */
  function applyVisibility(preds, scope = document) {
    scope.querySelectorAll('[data-show]').forEach(el => {
      el.hidden = !el.dataset.show.split(/\s+/).every(cond => cond.split('|').some(p => preds[p]));
    });
  }

  // ---------- plots ----------

  function theme() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    return {
      ink: v('--ink'), muted: v('--muted'), line: v('--line'), grid: v('--grid'), panel: v('--panel'),
      accent: v('--accent'), accentSoft: v('--accent-soft'), accent2: v('--accent-2'), accent3: v('--accent-3'), accent4: v('--accent-4'), dec: v('--dec'), inc: v('--inc'),
      blue: v('--l2-blue'), red: v('--l2-red'), orange: v('--l2-orange'), grey: v('--l2-grey'), profitFill: v('--l2-profit'),
      // colours of the regression figures in the handouts
      fy: v('--fig-y'), fyhat: v('--fig-yhat'), fresid: v('--fig-resid'), fybar: v('--fig-ybar'), febar: v('--fig-ebar'), fess: v('--fig-ess'),
      plane: v('--fig-plane'), planeEdge: v('--fig-plane-edge'),
      font: v('--font'),
      dark: v('color-scheme') === 'dark'
    };
  }

  const SURFACE_SCALE = [[0, '#f1e7c4'], [0.35, '#a9cfa0'], [0.7, '#4f9a9a'], [1, '#27577d']];

  const PLOT_CONFIG = {
    responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ['toImage', 'resetCameraLastSave3d', 'hoverClosest3d', 'orbitRotation', 'tableRotation', 'lasso2d', 'select2d', 'zoom2d', 'pan2d', 'autoScale2d', 'resetScale2d', 'zoomIn2d', 'zoomOut2d']
  };

  // Layout for a 2D panel with fixed axes. opts: {xt, yt, x, y, annotations, shapes, margin}.
  function base2d(th, opts = {}) {
    const ax = (title, more) => ({
      title: { text: title, standoff: 6, font: { color: th.ink } }, color: th.muted, gridcolor: th.grid, linecolor: th.line,
      zeroline: false, tickfont: { color: th.muted }, fixedrange: true, ...more
    });
    return {
      margin: opts.margin || { l: 52, r: 12, t: 8, b: 44 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: th.ink, family: th.font, size: 12 },
      showlegend: false,
      hoverlabel: { font: { family: th.font } },
      dragmode: false,
      xaxis: ax(opts.xt, opts.x), yaxis: ax(opts.yt, opts.y),
      annotations: opts.annotations || [],
      shapes: opts.shapes || []
    };
  }
  const line2 = (pts, color, width, name, dash, extra = {}) => ({
    type: 'scatter', mode: 'lines', x: pts.map(p => p[0]), y: pts.map(p => p[1]),
    line: { color, width, dash: dash || 'solid' }, name, hoverinfo: name ? 'name' : 'skip', ...extra
  });
  const dot2 = (pts, color, name, size = 10, extra = {}) => ({
    type: 'scatter', mode: 'markers', x: pts.map(p => p[0]), y: pts.map(p => p[1]),
    marker: { color, size, line: { color: '#ffffff', width: 1.5 } },
    name, hovertemplate: `${name}<br>(%{x:.2f}, %{y:.2f})<extra></extra>`, ...extra
  });

  // Convert a pointer event to data coordinates of a 2D plot with fixed linear axes (null if outside).
  function eventToData(gd, ev) {
    const fl = gd._fullLayout;
    if (!fl || !fl.xaxis || !fl.yaxis) return null;
    const box = gd.getBoundingClientRect(), xa = fl.xaxis, ya = fl.yaxis;
    const fx = (ev.clientX - box.left - xa._offset) / xa._length, fy = (ev.clientY - box.top - ya._offset) / ya._length;
    if (fx < -0.02 || fx > 1.02 || fy < -0.02 || fy > 1.02) return null;
    return [xa.range[0] + fx * (xa.range[1] - xa.range[0]), ya.range[1] - fy * (ya.range[1] - ya.range[0])];
  }

  // Redraw when the operating system switches between light and dark.
  function watchColorScheme(cb) {
    if (!root.matchMedia) return;
    const mq = root.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', cb);
  }

  /*
   * Keep every figure as large as its box. Plotly measures its box when it first draws; if the page
   * layout changes afterwards (fonts and formulas finish loading, a panel opens, the window or phone
   * turns), some browsers, Safari in particular, leave the figure at the old size. Watch each .plot
   * and resize the figure whenever its box changes.
   */
  function fitPlots() {
    if (!root.Plotly || !root.ResizeObserver) return;
    const pending = new Set();
    let frame = 0;
    const flush = () => {
      frame = 0;
      pending.forEach(gd => { if (gd._fullLayout && gd.offsetWidth > 0) root.Plotly.Plots.resize(gd); });
      pending.clear();
    };
    const ro = new root.ResizeObserver(entries => {
      entries.forEach(e => pending.add(e.target));
      if (!frame) frame = root.requestAnimationFrame(flush);
    });
    document.querySelectorAll('.plot').forEach(el => ro.observe(el));
    // and once more when everything (fonts included) has loaded
    const all = () => {
      document.querySelectorAll('.plot').forEach(el => pending.add(el));
      if (!frame) frame = root.requestAnimationFrame(flush);
    };
    if (document.readyState === 'complete') all(); else root.addEventListener('load', all);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fitPlots); else fitPlots();

  /*
   * Formula boxes scroll sideways only when their content really is too wide. KaTeX often draws a pixel
   * or two beyond its box; with plain overflow:auto, Safari (scroll bars always shown) then puts a
   * scrollbar under a formula that fits. Such boxes clip by default and get the class "scrolls"
   * (overflow-x: auto) only when the content is more than 3px wider than the box.
   */
  const SCROLL_BOXES = '.formula, .subtitle, .eqs, #marginal-box';
  function watchScrollBoxes() {
    const boxes = [...document.querySelectorAll(SCROLL_BOXES)];
    if (!boxes.length) return;
    const check = el => el.classList.toggle('scrolls', el.scrollWidth - el.clientWidth > 3);
    let frame = 0;
    const checkAll = () => { frame = 0; boxes.forEach(check); };
    const later = () => { if (!frame) frame = root.requestAnimationFrame(checkAll); };
    if (root.ResizeObserver) { const ro = new root.ResizeObserver(later); boxes.forEach(el => ro.observe(el)); }
    if (root.MutationObserver) { const mo = new root.MutationObserver(later); boxes.forEach(el => mo.observe(el, { childList: true, subtree: true, characterData: true })); }
    root.addEventListener('load', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
    later();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchScrollBoxes); else watchScrollBoxes();

  // On a phone the controls come before the figure: there "How to read this" starts closed (one tap opens it),
  // so the figure is not pushed far down the page.
  function foldHowtoOnPhones() {
    if (root.matchMedia && root.matchMedia('(max-width: 800px)').matches) document.querySelectorAll('details.howto').forEach(d => { d.open = false; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', foldHowtoOnPhones); else foldHowtoOnPhones();

  // ---------- errors: show them on the page, not only in the console ----------

  const reported = new Set();
  function showError(msg) {
    if (reported.has(msg)) return;
    reported.add(msg);
    const box = $('status');
    if (!box) return;
    box.hidden = false;
    box.insertAdjacentHTML('beforeend', '<p></p>');
    box.lastElementChild.textContent = msg;
  }
  function guard(what, fn) {
    try { fn(); } catch (err) { showError(`Could not draw the ${what}: ${err && err.message ? err.message : err}`); }
  }
  // A ResizeObserver notice is not an error of the page.
  root.addEventListener('error', ev => { if (ev.message && !/ResizeObserver/.test(ev.message)) showError(`Error: ${ev.message}`); });
  root.addEventListener('unhandledrejection', ev => {
    const r = ev.reason;
    showError(`Error: ${r && r.message ? r.message : r}`);
  });

  // Report missing libraries; returns true when the page can start.
  function librariesReady(model, modelName) {
    if (!root.Plotly) {
      showError('Could not load the plotting library (shared/vendor/plotly). Make sure the whole Econxvis folder is present, then reload.');
      return false;
    }
    if (!model) { showError(`Could not load ${modelName || 'model.js'}.`); return false; }
    if (!root.katex) showError('Could not load KaTeX (shared/vendor/katex): formulas are shown as plain TeX.');
    return true;
  }

  root.Econxvis = {
    $, fmt, num, pt, tex, texStr, renderStaticTex, linspace, logspace, clampTo,
    control, controls, scheduler, applyVisibility,
    theme, SURFACE_SCALE, PLOT_CONFIG, base2d, line2, dot2, eventToData, watchColorScheme,
    showError, guard, librariesReady
  };
})(window);
