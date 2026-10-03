/*
 * Regression as a Projection: interface and plotting.
 * All the linear algebra lives in model.js (window.ProjectionModel); this file only draws it.
 *
 * The 3D figure is drawn in the frame of M.frame(f): the column space of X is the floor (z = 0),
 * y_hat points along +x and the residual along +z. Lengths and angles are the true ones in R^n.
 */
(function () {
  'use strict';

  const M = window.ProjectionModel, U = window.Econxvis;
  if (!U) {
    document.body.insertAdjacentHTML('afterbegin', '<p class="warn">Could not load shared/ui.js. Make sure the whole Econxvis folder is present.</p>');
    return;
  }
  const { $, fmt, num, tex, texStr, line2, dot2, guard } = U;

  // ---------- state ----------

  const DEFAULTS = { n: 20, beta0: 1, beta1: 0.5, sigma: 1.5, seed: 4 }; // seed 4: a typical sample, R² about 0.6
  const PRESETS = {
    default: { ...DEFAULTS },
    perfect: { sigma: 0 },            // y in the plane: eps_hat = 0, R^2 = 1
    nofit: { beta1: 0, sigma: 1.5 }   // x explains nothing: R^2 close to 0
  };

  const state = {
    ...DEFAULTS,
    intercept: true, mean: true, grid: true, right: true, cols: false, cand: false, b0: 0, b1: 0.8,
    view: 'slide', camera: null
  };
  // Points moved by hand in the scatter plot: index -> [x, y]. Cleared by a new sample or a preset.
  const moved = new Map();
  const MAX_N = 60;
  let drawsCache = null;

  function data() {
    if (!drawsCache || drawsCache.seed !== state.seed) drawsCache = { seed: state.seed, d: M.draws(state.seed, MAX_N) };
    const d = { u: drawsCache.d.u.slice(0, state.n), z: drawsCache.d.z.slice(0, state.n) };
    const s = M.sample(d, state.beta0, state.beta1, state.sigma);
    for (const [i, p] of moved) if (i < state.n) { s.x[i] = p[0]; s.y[i] = p[1]; }
    return s;
  }

  const coef = () => state.intercept ? [state.b0, state.b1] : [state.b1];
  // Rounding noise (e.g. a residual of 1e-16 in a perfect fit) is shown as 0.
  const clean = a => Math.abs(a) < 1e-10 ? 0 : a;
  const f2 = (a, d = 2) => fmt(clean(a), d);
  const vecStr = (v, d = 2) => `(${v.map(a => f2(a, d)).join(', ')})`;

  let ctrls = {};
  const schedule = U.scheduler(render);

  // ---------- 3D helpers ----------

  const line3 = (pts, color, width, extra = {}) => ({
    type: 'scatter3d', mode: 'lines',
    x: pts.map(p => p && p[0]), y: pts.map(p => p && p[1]), z: pts.map(p => p && p[2]),
    line: { color, width, dash: extra.dash || 'solid' }, showlegend: false, connectgaps: false,
    ...(extra.name ? { name: extra.name, hovertemplate: extra.hover || `${extra.name}<extra></extra>` } : { hoverinfo: 'skip' })
  });

  // An arrow from a to b: a line and a cone at the tip.
  function arrow3(a, b, color, width, name, head, hover) {
    const d = M.sub(b, a), L = M.norm(d);
    const out = [line3([a, b], color, width, { name, hover: `${name}${hover ? '<br>' + hover : ''}<extra></extra>` })];
    if (L > head * 0.8) {
      const u = M.scale(d, 1 / L);
      out.push({
        type: 'cone', x: [b[0]], y: [b[1]], z: [b[2]], u: [u[0]], v: [u[1]], w: [u[2]],
        anchor: 'tip', sizemode: 'absolute', sizeref: head, showscale: false,
        colorscale: [[0, color], [1, color]], hoverinfo: 'skip',
        lighting: { ambient: 0.9, diffuse: 0.2, specular: 0 }
      });
    }
    return out;
  }

  const label3 = (p, text, color, size = 21) => ({
    type: 'scatter3d', mode: 'text', x: [p[0]], y: [p[1]], z: [p[2]], text: [text],
    textfont: { color, size, family: 'Georgia, "Times New Roman", serif' }, hoverinfo: 'skip', showlegend: false
  });

  const marker3 = (p, color, name, size = 5) => ({
    type: 'scatter3d', mode: 'markers', x: [p[0]], y: [p[1]], z: [p[2]],
    marker: { color, size, line: { color: '#ffffff', width: 1 } }, name,
    hovertemplate: `${name}<extra></extra>`, showlegend: false
  });

  // A round step for grid lines: 1, 2 or 5 times a power of ten, about `target` lines across `span`.
  function niceStep(span, target = 10) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  // Cameras in the frame of the figure: the plane is z = 0, y_hat points along +x.
  const CAMERAS = {
    slide: { eye: { x: -0.3, y: -1.08, z: 0.62 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.08 }, projection: { type: 'perspective' } },
    down: { eye: { x: 0, y: 0, z: 1.4 }, up: { x: 0, y: 1, z: 0 }, center: { x: 0, y: 0, z: 0 }, projection: { type: 'orthographic' } },
    edge: { eye: { x: 0, y: -1.4, z: 0 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 }, projection: { type: 'orthographic' } }
  };
  const clone = o => JSON.parse(JSON.stringify(o));

  // Step back on a tall, narrow panel (a phone), so the figure is not cut off at the sides.
  function fitToPanel(cam) {
    const el = $('plot3d'), k = el && el.clientWidth ? Math.max(1, 0.85 * el.clientHeight / el.clientWidth) : 1;
    const c = clone(cam);
    c.eye = { x: c.eye.x * k, y: c.eye.y * k, z: c.eye.z * k };
    return c;
  }

  // ---------- 3D plot ----------

  function draw3d(th, f, fr) {
    const T = fr.to3, s = M.norm(f.y);
    const O = [0, 0, 0], Y = T(f.y), H = T(f.yhat), Yb = T(f.ybar), b = coef(), XB = T(M.fitted(f.cols, b));
    const C = f.cols.map(T);

    // Points the picture must contain.
    const pts = [O, Y, H];
    if (state.mean) pts.push(Yb);
    if (state.cols) C.forEach(c => pts.push(c));
    if (state.cand) pts.push(XB);

    // The column space: a rectangle in the floor (z = 0), or a line along x when it is one-dimensional.
    const lo = [0, 1].map(k => Math.min(...pts.map(p => p[k]))), hi = [0, 1].map(k => Math.max(...pts.map(p => p[k])));
    const span = Math.max(1e-6, hi[0] - lo[0], hi[1] - lo[1]);
    const pad = 0.22 * span;
    const rx = [lo[0] - pad, hi[0] + pad];
    let ry = [lo[1] - pad, hi[1] + pad];
    if (ry[1] - ry[0] < 0.55 * (rx[1] - rx[0])) {   // keep the plane from being a thin strip
      const mid = (ry[0] + ry[1]) / 2, h = 0.275 * (rx[1] - rx[0]);
      ry = [mid - h, mid + h];
    }
    const zTop = Math.max(...pts.map(p => p[2]), 0), zBot = Math.min(...pts.map(p => p[2]), 0);
    const R = Math.max(rx[1] - rx[0], ry[1] - ry[0]), head = 0.035 * R;

    const traces = [];
    if (fr.planar) {
      const corners = [[rx[0], ry[0], 0], [rx[1], ry[0], 0], [rx[1], ry[1], 0], [rx[0], ry[1], 0]];
      traces.push({
        type: 'mesh3d', x: corners.map(p => p[0]), y: corners.map(p => p[1]), z: corners.map(p => p[2]),
        i: [0, 0], j: [1, 2], k: [2, 3], color: th.accent, opacity: th.dark ? 0.16 : 0.11,
        flatshading: true, lighting: { ambient: 1, diffuse: 0, specular: 0 }, hoverinfo: 'skip', showscale: false
      });
      if (state.grid) {
        const st = niceStep(R, 12), seg = [];
        for (let gx = Math.ceil(rx[0] / st) * st; gx <= rx[1] + 1e-9; gx += st) seg.push([gx, ry[0], 0], [gx, ry[1], 0], null);
        for (let gy = Math.ceil(ry[0] / st) * st; gy <= ry[1] + 1e-9; gy += st) seg.push([rx[0], gy, 0], [rx[1], gy, 0], null);
        traces.push(line3(seg, th.planeEdge, 1.5));
      }
      traces.push(line3(corners.concat([corners[0]]), th.planeEdge, 3));
      if (state.view !== 'edge') {
        traces.push({ ...label3([rx[0] + 0.02 * R, ry[1] - 0.04 * R, 0], 'subspace generated by the columns of X', th.muted, 15), textposition: 'middle right' });
      }
    } else {
      traces.push(line3([[rx[0], 0, 0], [rx[1], 0, 0]], th.planeEdge, 5, { name: 'the column space of X is a line' }));
      traces.push(label3([rx[0] + 0.15 * R, 0, 0.03 * R], 'column space of X (a line)', th.muted, 14));
    }

    traces.push(marker3(O, th.ink, 'origin', 3));
    traces.push(label3([-0.035 * R, -0.03 * R, 0], '0', th.ink, 16));

    // Columns of X.
    if (state.cols) {
      C.forEach((c, j) => {
        if (M.norm(c) < 1e-9) return;
        const nm = f.names[j] === '1' ? '𝟏' : 'x';
        traces.push(...arrow3(O, c, th.muted, 3, `column ${nm} of X`, head * 0.8, `length ${f2(M.norm(c))}`));
        traces.push(label3(M.add(c, M.scale(M.unit(c), 0.04 * R)), nm, th.muted, 15));
      });
    }

    // Labels sit a little outside the triangle 0, y_hat, y.
    const centroid = M.scale(M.add(M.add(Y, H), state.mean ? Yb : O), 1 / (state.mean ? 4 : 3));
    const out = (p, k = 0.045) => { const d = M.unit(M.sub(p, centroid)); return d ? M.add(p, M.scale(d, k * R)) : p; };
    const midpt = (a, c) => M.scale(M.add(a, c), 0.5);
    const len = v => `length ${f2(M.norm(v))}`;

    // The mean and the explained part.
    if (state.mean) {
      if (!M.tiny(f.ybar, s)) {
        traces.push(...arrow3(O, Yb, th.fybar, 6, 'ȳ = ȳ·𝟏', head, len(f.ybar)));
        traces.push(label3(out(midpt(O, Yb)), 'ȳ', th.fybar));
      }
      if (!M.tiny(f.ebar, s)) {
        traces.push(...arrow3(Yb, Y, th.febar, 6, 'ε̄ = y − ȳ', head, `${len(f.ebar)}, squared = TSS`));
        traces.push(label3(out(midpt(Yb, Y)), 'ε̄', th.febar));
      }
      if (!M.tiny(f.explained, s)) {
        traces.push(line3([Yb, H], th.fess, 7, { name: 'ŷ − ȳ', hover: `ŷ − ȳ<br>${len(f.explained)}, squared = ESS<extra></extra>` }));
      }
    }

    // y, its projection and the residual.
    traces.push(...arrow3(O, Y, th.fy, 7, 'y', head, len(f.y)));
    traces.push(label3(out(Y, 0.04), 'y', th.fy, 23));
    if (!M.tiny(f.yhat, s)) {
      traces.push(...arrow3(O, H, th.fyhat, 7, 'ŷ = Py', head, len(f.yhat)));
      traces.push(label3(out(midpt(O, H)), 'ŷ', th.fyhat, 23));
    }
    if (!M.tiny(f.resid, s)) {
      traces.push(...arrow3(H, Y, th.fresid, 7, 'ε̂ = My', head, `${len(f.resid)}, squared = RSS`));
      traces.push(label3(M.add(midpt(H, Y), [0.04 * R, 0, 0]), 'ε̂', th.fresid, 23));
    }
    traces.push(marker3(H, th.fyhat, 'ŷ = Py', 4));

    // Right angle at y_hat between the residual and the plane.
    if (state.right && !M.tiny(f.resid, s)) {
      const legs = [M.norm(f.resid)];
      let toward;
      if (state.mean && f.onesIn && !M.tiny(f.explained, s)) { toward = M.unit(M.sub(Yb, H)); legs.push(M.norm(f.explained)); }
      else if (!M.tiny(f.yhat, s)) { toward = [-1, 0, 0]; legs.push(M.norm(f.yhat)); }
      else toward = [1, 0, 0];
      const k = Math.min(0.045 * R, 0.35 * Math.min(...legs)), up = [0, 0, 1];
      traces.push(line3([M.add(H, M.scale(up, k)), M.add(M.add(H, M.scale(up, k)), M.scale(toward, k)), M.add(H, M.scale(toward, k))], th.ink, 3));
    }

    // A different fit Xb.
    if (state.cand) {
      traces.push(marker3(XB, th.accent2, 'Xb', 5));
      traces.push(line3([Y, XB], th.accent2, 5, { dash: 'dash', name: 'y − Xb', hover: `y − Xb<br>length ${f2(Math.sqrt(M.rss(f.cols, f.y, b)))}<extra></extra>` }));
      traces.push(line3([H, XB], th.accent2, 3, { dash: 'dot', name: 'ŷ − Xb' }));
      traces.push(label3(out(XB, 0.04), 'Xb', th.accent2, 16));
    }

    // Equal scales on all axes (so right angles look right); the box hugs the figure.
    const rz = [zBot - 0.05 * R, Math.max(zTop + 0.08 * R, 0.25 * R)];
    const L = [rx, ry, rz].map(r => r[1] - r[0]), Lmax = Math.max(...L);
    const axis = r => ({ range: r, visible: false, showspikes: false });
    if (!state.camera) state.camera = fitToPanel(CAMERAS[state.view]);
    Plotly.react('plot3d', traces, {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: th.ink, family: th.font, size: 12 },
      showlegend: false,
      uirevision: 'keep',
      hoverlabel: { font: { family: th.font } },
      scene: {
        uirevision: 'keep',
        dragmode: 'turntable',
        camera: state.camera,
        aspectmode: 'manual',
        aspectratio: { x: L[0] / Lmax, y: L[1] / Lmax, z: L[2] / Lmax },
        xaxis: axis(rx), yaxis: axis(ry), zaxis: axis(rz)
      }
    }, { ...U.PLOT_CONFIG, scrollZoom: false });
  }

  const VIEW_NOTES = {
    slide: 'The plane lies flat and the residual points straight up, as in the figure of the notes. Drag to turn the figure around.',
    down: 'Looking straight down onto the plane: y lands exactly on ŷ. That is what “projection” means.',
    edge: 'Looking along the plane: it shrinks to a line, and ε̂ stands on it at a right angle.',
    free: 'Turned by hand. Pick a view above to go back.'
  };

  function setView(view) {
    state.view = view;
    state.camera = fitToPanel(CAMERAS[view]);
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    schedule();
  }

  function zoom(factor) {
    const c = state.camera || fitToPanel(CAMERAS[state.view]);
    state.camera = { ...c, eye: { x: c.eye.x * factor, y: c.eye.y * factor, z: c.eye.z * factor } };
    schedule();
  }

  // ---------- 2D panel A: scatter plot ----------

  const XR = [-0.5, 10.5];
  let yRange = [-2, 8], dragging = -1;

  function drawA(th, f, x) {
    const y = f.y, traces = [];
    if (dragging < 0) {   // keep the axes still while a point is dragged
      const lo = Math.min(...y, f.ybarValue), hi = Math.max(...y, f.ybarValue), p = 0.12 * Math.max(1, hi - lo);
      yRange = [lo - p, hi + p];
    }
    const lineOf = b => t => state.intercept ? b[0] + b[1] * t : b[0] * t;
    if (f.beta) traces.push(line2(XR.map(t => [t, lineOf(f.beta)(t)]), th.fyhat, 3, 'fitted line'));
    if (state.cand) traces.push(line2(XR.map(t => [t, lineOf(coef())(t)]), th.accent2, 2, 'line of b', 'dash'));
    if (state.mean) traces.push(line2(XR.map(t => [t, f.ybarValue]), th.fybar, 2, 'ȳ', 'dash'));
    const seg = [];
    x.forEach((xi, i) => seg.push([xi, f.yhat[i]], [xi, y[i]], [null, null]));
    traces.push(line2(seg, th.fresid, 2.5, null, null, { connectgaps: false }));
    traces.push(dot2(x.map((xi, i) => [xi, y[i]]), th.fy, 'yᵢ', 9));
    Plotly.react('plotA', traces, U.base2d(th, {
      xt: 'x', yt: 'y', x: { range: XR }, y: { range: yRange, zeroline: true, zerolinecolor: th.line }
    }), U.PLOT_CONFIG);
  }

  // Drag the data points of the scatter plot.
  function enableDrag() {
    const gd = $('plotA');
    const nearest = ev => {
      const p = U.eventToData(gd, ev), fl = gd._fullLayout;
      if (!p || !fl) return -1;
      const { x, y } = data();
      const sx = fl.xaxis._length / (XR[1] - XR[0]), sy = fl.yaxis._length / (yRange[1] - yRange[0]);
      let best = -1, bd = 22;
      x.forEach((xi, i) => {
        const d = Math.hypot((xi - p[0]) * sx, (y[i] - p[1]) * sy);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };
    const move = ev => {
      const p = U.eventToData(gd, ev);
      if (!p) return;
      moved.set(dragging, [U.clampTo(p[0], 0, 10), U.clampTo(p[1], yRange[0], yRange[1])]);
      schedule();
    };
    gd.addEventListener('pointerdown', ev => {
      dragging = nearest(ev);
      if (dragging < 0) return;
      gd.classList.add('dragging');
      if (gd.setPointerCapture) gd.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      move(ev);
    }, true);
    gd.addEventListener('pointermove', ev => { if (dragging >= 0) move(ev); }, true);
    const end = () => { if (dragging >= 0) { dragging = -1; gd.classList.remove('dragging'); schedule(); } };
    gd.addEventListener('pointerup', end, true);
    gd.addEventListener('pointercancel', end, true);
  }

  // ---------- 2D panel B: the triangle y_bar, y_hat, y with squares on its sides ----------

  function drawB(th, f) {
    const e = Math.sqrt(f.ess), r = Math.sqrt(f.rss);
    // Angle at y_hat between y_bar - y_hat and y - y_hat (90 degrees when 1 is in the column space).
    let theta = Math.PI / 2;
    if (e > 1e-9 && r > 1e-9) theta = M.angle(M.scale(f.explained, -1), f.resid) * Math.PI / 180;
    const A = [0, 0], Yb = [-e, 0], Yp = [-r * Math.cos(theta), r * Math.sin(theta)];
    const traces = [], annotations = [], pts = [A, Yb, Yp];

    // Square on side P-Q, on the side away from the third vertex O.
    function square(P, Q, O, color, name, value) {
      const d = [Q[0] - P[0], Q[1] - P[1]], L = Math.hypot(d[0], d[1]);
      if (L < 1e-9) return;
      let h = [-d[1], d[0]];
      if ((O[0] - P[0]) * h[0] + (O[1] - P[1]) * h[1] > 0) h = [-h[0], -h[1]];
      const c = [P, Q, [Q[0] + h[0], Q[1] + h[1]], [P[0] + h[0], P[1] + h[1]], P];
      traces.push({
        type: 'scatter', mode: 'lines', x: c.map(p => p[0]), y: c.map(p => p[1]), fill: 'toself',
        fillcolor: color, opacity: 0.22, line: { color, width: 1 }, hoverinfo: 'skip'
      });
      c.forEach(p => pts.push(p));
      const cx = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4, cy = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
      annotations.push({ x: cx, y: cy, text: `${name}<br>${f2(value)}`, showarrow: false, font: { color, size: 13 } });
    }
    square(Yb, Yp, A, th.febar, 'TSS', f.tss);
    square(Yb, A, Yp, th.fess, 'ESS', f.ess);
    square(A, Yp, Yb, th.fresid, 'RSS', f.rss);

    traces.push(line2([Yb, Yp], th.febar, 4), line2([Yb, A], th.fess, 4), line2([A, Yp], th.fresid, 4));
    traces.push(dot2([Yb], th.fybar, 'ȳ', 9), dot2([A], th.fyhat, 'ŷ', 9), dot2([Yp], th.fy, 'y', 9));
    const lab = (p, text, color, ax, ay) => annotations.push({ x: p[0], y: p[1], text, showarrow: false, xshift: ax, yshift: ay, font: { color, size: 15, family: 'Georgia, serif' } });
    lab(Yb, 'ȳ', th.fybar, -10, 10); lab(A, 'ŷ', th.fyhat, 12, 10); lab(Yp, 'y', th.fy, 10, 10);

    if (Math.abs(theta - Math.PI / 2) < 1e-6 && e > 1e-9 && r > 1e-9) {
      const k = 0.12 * Math.min(e, r);
      traces.push(line2([[-k, 0], [-k, k], [0, k]], th.ink, 1.5));
    }

    const xsP = pts.map(p => p[0]), ysP = pts.map(p => p[1]);
    const pad = 0.08 * Math.max(1e-6, Math.max(...xsP) - Math.min(...xsP), Math.max(...ysP) - Math.min(...ysP));
    Plotly.react('plotB', traces, U.base2d(th, {
      margin: { l: 8, r: 8, t: 8, b: 8 },
      x: { range: [Math.min(...xsP) - pad, Math.max(...xsP) + pad], visible: false },
      y: { range: [Math.min(...ysP) - pad, Math.max(...ysP) + pad], visible: false, scaleanchor: 'x', scaleratio: 1 },
      annotations
    }), U.PLOT_CONFIG);

    const deg = theta * 180 / Math.PI;
    const coincide = Math.abs(f.tss - f.ess - f.rss) <= 1e-9 * Math.max(1, f.tss);
    $('triangle-caption').innerHTML = f.onesIn
      ? `The triangle <span class="c-ybar">ȳ</span>, <span class="c-yhat">ŷ</span>, y from the 3D figure, drawn flat. Its angle at ŷ is a right angle, so the squares on its sides add up: ${f2(f.tss)} = ${f2(f.ess)} + ${f2(f.rss)}, and ${texStr('R^2=ESS/TSS')} = ${f.r2 === null ? '—' : f2(f.r2, 3)}.`
      : coincide
        ? `Without an intercept ${texStr('\\bar y')} is in general not in the plane. For these data the residuals happen to sum to zero, so the angle at ŷ is still 90°.`
        : `Without an intercept ${texStr('\\bar y')} is not in the plane, the angle at ŷ is ${f2(deg, 1)}° rather than 90°, and the squares do not add up: TSS = ${f2(f.tss)} but ESS + RSS = ${f2(f.ess + f.rss)}.`;
  }

  // ---------- formulas and readouts ----------

  function renderFormulas(f) {
    tex($('formula-model'), state.intercept
      ? 'y_i=\\beta_0+\\beta_1x_i+\\varepsilon_i,\\quad y=X\\beta+\\varepsilon'
      : 'y_i=\\beta_1x_i+\\varepsilon_i,\\quad y=X\\beta+\\varepsilon', true);
    const truth = state.intercept ? [state.beta0, state.beta1] : [state.beta1];
    const row = v => `(${v.map(a => num(clean(a))).join(',\\ ')})^T`;
    tex($('formula-beta'), f.beta
      ? `\\begin{aligned}\\hat\\beta&=(X^TX)^{-1}X^Ty\\\\ &=${row(f.beta)}\\\\ \\text{true }\\beta&=${row(truth)}\\end{aligned}`
      : '\\hat\\beta\\ \\text{not unique}', true);

    const n = f.n, small = n <= 6;
    const texMat = A => `\\begin{pmatrix}${A.map(r => r.map(a => f2(a).replace('−', '-')).join('&')).join('\\\\')}\\end{pmatrix}`;
    tex($('formula-P'), small ? `P=X(X^TX)^{-1}X^T=${texMat(f.P)}` : `P=X(X^TX)^{-1}X^T\\ \\text{is}\\ ${n}\\times${n}`, true);
    tex($('formula-M'), small ? `M=I-P=${texMat(f.M)}` : `M=I-P\\ \\text{is}\\ ${n}\\times${n}`, true);
    const maxDiff = (A, B) => Math.max(...A.flatMap((r, i) => r.map((a, j) => Math.abs(a - B[i][j]))));
    const ok = v => v < 1e-9 ? '<span class="ok-mark">✓</span>' : '<span class="no-mark">✗</span>';
    $('pm-checks').innerHTML =
      `Symmetric ${texStr('P^T=P')} ${ok(maxDiff(M.transpose(f.P), f.P))}, idempotent ${texStr('PP=P')} ${ok(maxDiff(M.matMul(f.P, f.P), f.P))} and ${texStr('MM=M')} ${ok(maxDiff(M.matMul(f.M, f.M), f.M))}. ` +
      `Trace of ${texStr('P')} = ${f2(M.trace(f.P))} = dimension of the column space. Projecting twice changes nothing: ${texStr('P\\hat y=\\hat y')}.` +
      (small ? '' : ' Set n to 6 or less to see the matrices.');
  }

  const READOUTS = [
    ['n', 'n'],
    ['beta', '\\hat\\beta'],
    ['ny', '|y|'],
    ['nyhat', '|\\hat y|=|Py|'],
    ['nresid', '|\\hat\\varepsilon|=|My|'],
    ['xte', 'X^T\\hat\\varepsilon'],
    ['angle', '\\angle(\\hat y,\\hat\\varepsilon)'],
    ['tss', 'TSS=|y-\\bar y|^2'],
    ['ess', 'ESS=|\\hat y-\\bar y|^2'],
    ['rss', 'RSS=|\\hat\\varepsilon|^2'],
    ['r2', 'R^2=1-RSS/TSS'],
    ['cor', '\\mathrm{cor}(\\hat y,y)^2'],
    ['cand', '|y-Xb|^2']
  ];
  const out = {};

  function buildReadouts() {
    const dl = $('readouts');
    for (const [key, label] of READOUTS) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      tex(dt, label);
      dl.append(dt, dd);
      out[key] = { dt, dd };
    }
  }

  function renderReadouts(f) {
    const s = M.norm(f.y), warn = [];
    const set = (k, v) => { out[k].dd.innerHTML = v; };
    set('n', `${f.n} <span class="c-muted">(y is a vector in ${texStr(`\\mathbb{R}^{${f.n}}`)})</span>`);
    set('beta', f.beta ? vecStr(f.beta) : 'not unique');
    set('ny', f2(M.norm(f.y)));
    set('nyhat', f2(M.norm(f.yhat)));
    set('nresid', f2(M.norm(f.resid)));
    set('xte', vecStr(f.XtE) + ' <span class="c-muted">(orthogonal)</span>');
    set('angle', f.angleResid === null ? '—' : `${f2(f.angleResid, 1)}°`);
    set('tss', f2(f.tss));
    set('ess', f2(f.ess));
    set('rss', f2(f.rss));
    set('r2', f.r2 === null ? '—' : f2(f.r2, 3));
    set('cor', f.r2cor === null ? '—' : f2(f.r2cor, 3));

    const b = coef(), Xb = M.fitted(f.cols, b), d2 = M.rss(f.cols, f.y, b), g2 = M.dot(M.sub(f.yhat, Xb), M.sub(f.yhat, Xb));
    out.cand.dt.hidden = out.cand.dd.hidden = !state.cand;
    set('cand', `${f2(d2)} = ${f2(f.rss)} + ${f2(g2)}`);

    let sentence = `ŷ is the point of the plane closest to y: the distance is |ε̂| = ${f2(Math.sqrt(f.rss))}, and ε̂ is orthogonal to every column of X.`;
    if (state.cand) {
      sentence = `Xb is ${f2(Math.sqrt(d2))} away from y, ŷ only ${f2(Math.sqrt(f.rss))}. By Pythagoras |y − Xb|² = |ε̂|² + |ŷ − Xb|², so any b ≠ β̂ has a larger sum of squares.`;
    } else if (M.tiny(f.resid, s)) {
      sentence = 'y lies in the plane: the fit is perfect, ε̂ = 0 and R² = 1.';
    }
    if (!f.onesIn) sentence += ' Without an intercept, R² = 1 − RSS/TSS is no longer ESS/TSS and can even be negative.';
    $('sentence').textContent = sentence;

    if (f.rank < f.cols.length) warn.push('The columns of X are collinear: they span only a line, X^T X is not invertible and β̂ is not unique. The projection ŷ = Py is still unique.');
    if (f.tss < 1e-12) warn.push('All y are equal: TSS = 0 and R² is undefined.');
    $('warning').hidden = !warn.length;
    $('warning').textContent = warn.join(' ');

    const nm = [...moved.keys()].filter(i => i < f.n).length;
    $('drag-note').hidden = !nm;
    $('drag-note').textContent = nm ? `${nm} point${nm > 1 ? 's' : ''} moved by hand. “New sample” or a preset starts afresh.` : '';
  }

  // ---------- render loop ----------

  function render() {
    U.applyVisibility({ intercept: state.intercept, cand: state.cand, mean: state.mean });
    const { x, y } = data();
    const f = M.fit(x, y, state.intercept), fr = M.frame(f);
    $('view-note').textContent = VIEW_NOTES[state.view];
    const th = U.theme();
    // Draw each panel on its own, so one failing plot does not blank the others.
    guard('formulas', () => renderFormulas(f));
    guard('3D plot', () => draw3d(th, f, fr));
    guard('scatter plot', () => drawA(th, f, x));
    guard('triangle', () => drawB(th, f));
    guard('readouts', () => renderReadouts(f));
  }

  // ---------- init ----------

  function applyPreset(name) {
    moved.clear();
    Object.assign(state, PRESETS[name]);
    Object.values(ctrls).forEach(c => c.sync());
    schedule();
  }

  function init() {
    U.renderStaticTex();
    ctrls = U.controls(document, state, { onChange: schedule });
    buildReadouts();

    const check = (id, key) => {
      $(id).checked = state[key];
      $(id).addEventListener('change', e => { state[key] = e.target.checked; schedule(); });
    };
    check('intercept', 'intercept');
    check('show-mean', 'mean');
    check('show-grid', 'grid');
    check('show-right', 'right');
    check('show-cols', 'cols');
    check('show-cand', 'cand');
    $('resample').addEventListener('click', () => { state.seed += 1; moved.clear(); schedule(); });
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => zoom(Number(b.dataset.zoom))));
    $('to-ols').addEventListener('click', () => {
      const { x, y } = data(), f = M.fit(x, y, state.intercept, false);
      if (!f.beta) { U.showError('β̂ is not unique here: the columns of X are collinear.'); return; }
      if (state.intercept) { ctrls.b0.setExact(f.beta[0]); ctrls.b1.setExact(f.beta[1]); }
      else ctrls.b1.setExact(f.beta[0]);
    });

    setView(state.view);
    render();
    enableDrag();

    // When the user turns the figure, keep their camera.
    $('plot3d').on('plotly_relayout', ev => {
      const cam = ev['scene.camera'];
      if (!cam) return;
      state.camera = { ...state.camera, ...clone(cam) };
      if (state.view !== 'free') {
        state.view = 'free';
        document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false'));
        $('view-note').textContent = VIEW_NOTES.free;
      }
    });
    U.watchColorScheme(schedule);
  }

  if (U.librariesReady(M, 'ols-projection/model.js')) guard('page', init);
})();
