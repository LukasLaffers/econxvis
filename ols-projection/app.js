/*
 * Regression as a Projection: interface and plotting.
 * All the linear algebra lives in model.js (window.ProjectionModel); this file only draws it.
 */
(function () {
  'use strict';

  const M = window.ProjectionModel, U = window.Econxvis;
  if (!U) {
    document.body.insertAdjacentHTML('afterbegin', '<p class="warn">Could not load shared/ui.js. Make sure the whole Econxvis folder is present.</p>');
    return;
  }
  const { $, fmt, num, tex, texStr, linspace, line2, dot2, guard } = U;

  // ---------- state ----------

  const PRESETS = {
    slide: { x: [1, 2, 3], y: [1, 3.5, 3] },       // beta_hat = (0.5, 1): ESS = 2, RSS = 1.5
    perfect: { x: [1, 2, 3], y: [1.5, 2.5, 3.5] },  // y in the plane: eps_hat = 0, R^2 = 1
    nofit: { x: [1, 2, 3], y: [2, 4, 2] },         // slope 0: y_hat = y_bar, R^2 = 0
    collinear: { x: [2, 2, 2], y: [1, 3.5, 3] }     // the columns 1 and x are parallel
  };

  const state = {
    x1: 1, x2: 2, x3: 3, y1: 1, y2: 3.5, y3: 3,
    intercept: true, mean: true, cols: true, right: true, cand: false, b0: 1.5, b1: 0.5,
    view: 'slide', camera: null, axes: false
  };

  const xs = () => [state.x1, state.x2, state.x3];
  const ys = () => [state.y1, state.y2, state.y3];
  const coef = () => state.intercept ? [state.b0, state.b1] : [state.b1];
  const tiny = (v, scale) => M.norm(v) <= 1e-9 * Math.max(1, scale);
  // Rounding noise (e.g. a residual of 1e-16 in a perfect fit) is shown as 0.
  const clean = a => Math.abs(a) < 1e-10 ? 0 : a;
  const f2 = (a, d = 2) => fmt(clean(a), d);
  const vecStr = (v, d = 2) => `(${v.map(a => f2(a, d)).join(', ')})`;
  const texVec = v => `\\begin{pmatrix}${v.map(num).join('\\\\')}\\end{pmatrix}`;
  const texMat = A => `\\begin{pmatrix}${A.map(r => r.map(a => f2(a).replace('−', '-')).join('&')).join('\\\\')}\\end{pmatrix}`;

  let ctrls = {};
  const schedule = U.scheduler(render);

  // ---------- 3D helpers ----------

  const line3 = (pts, color, width, extra = {}) => ({
    type: 'scatter3d', mode: 'lines',
    x: pts.map(p => p[0]), y: pts.map(p => p[1]), z: pts.map(p => p[2]),
    line: { color, width, dash: extra.dash || 'solid' }, hoverinfo: 'skip', showlegend: false,
    ...(extra.name ? { name: extra.name, hovertemplate: extra.hover || `${extra.name}<extra></extra>`, hoverinfo: undefined } : {})
  });

  // An arrow from a to b: a line and a cone at the tip.
  function arrow3(a, b, color, width, name, head) {
    const d = M.sub(b, a), L = M.norm(d);
    const out = [line3([a, b], color, width, { name, hover: `${name}<br>${vecStr(b)}<extra></extra>` })];
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

  const label3 = (p, text, color, size = 15) => ({
    type: 'scatter3d', mode: 'text', x: [p[0]], y: [p[1]], z: [p[2]], text: [text],
    textfont: { color, size, family: 'Georgia, "Times New Roman", serif' }, hoverinfo: 'skip', showlegend: false
  });

  const marker3 = (p, color, name, size = 5) => ({
    type: 'scatter3d', mode: 'markers', x: [p[0]], y: [p[1]], z: [p[2]],
    marker: { color, size, line: { color: '#ffffff', width: 1 } }, name,
    hovertemplate: `${name}<br>${vecStr(p)}<extra></extra>`, showlegend: false
  });

  // Unit normal of the plane, pointing to the side where y is (so that "up" shows y above the plane).
  function upNormal(f) {
    let n = f.normal;
    if (!n) return null;
    const side = tiny(f.resid, M.norm(f.y)) ? M.dot(n, [0.2, 0.3, 1]) : M.dot(n, f.resid);
    return side < 0 ? M.scale(n, -1) : n;
  }

  // The direction of y_hat (or of a basis vector when y_hat = 0): drawn from left to right, as in the notes.
  function inPlaneDir(f) {
    return tiny(f.yhat, M.norm(f.y)) ? f.basis[0] : M.unit(f.yhat);
  }

  const AXES_CAMERA = {
    eye: { x: 1.55, y: -1.45, z: 0.95 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.05 },
    projection: { type: 'perspective' }
  };
  const xyz = v => ({ x: v[0], y: v[1], z: v[2] });

  // Camera for the named view, computed from the current plane.
  function viewCamera(view, f) {
    const n = upNormal(f);
    if (view === 'axes' || !n) return JSON.parse(JSON.stringify(AXES_CAMERA));
    const u = inPlaneDir(f), w = M.cross(n, u); // screen right = u, screen up = n (or w when looking down)
    const center = { x: 0, y: 0, z: 0 };
    // Step back on a tall, narrow panel (a phone), so the figure is not cut off at the sides.
    const el = $('plot3d'), k = el && el.clientWidth ? Math.max(1, 1.2 * el.clientHeight / el.clientWidth) : 1;
    if (view === 'down') return { eye: xyz(M.scale(n, 1.6 * k)), up: xyz(w), center, projection: { type: 'orthographic' } };
    if (view === 'edge') return { eye: xyz(M.scale(w, -1.6 * k)), up: xyz(n), center, projection: { type: 'orthographic' } };
    // 'slide': in front of the plane and a little above it, like the figure in the notes
    const e = M.scale(M.unit(M.add(M.add(M.scale(w, -1), M.scale(n, 0.6)), M.scale(u, -0.15))), 1.35 * k);
    return { eye: xyz(e), up: xyz(n), center, projection: { type: 'perspective' } };
  }

  // ---------- 3D plot ----------

  function draw3d(th, f) {
    const y = f.y, b = coef(), Xb = M.fitted(f.cols, b);
    const ybarIn = state.mean;
    // Points the picture must contain.
    const pts = [[0, 0, 0], y, f.yhat];
    if (ybarIn) pts.push(f.ybar);
    if (state.cols) f.cols.forEach(c => pts.push(c));
    if (state.cand) pts.push(Xb);

    // The column space: a rectangle (rank 2) or a segment (rank 1) around the projected points.
    const B = f.basis, coords = pts.map(p => B.map(q => M.dot(p, q)));
    const lo = B.map((_, j) => Math.min(...coords.map(c => c[j]))), hi = B.map((_, j) => Math.max(...coords.map(c => c[j])));
    const span = Math.max(1, ...hi.map((h, j) => h - lo[j]));
    const pad = 0.3 * span;
    const at = c => c.reduce((s, cj, j) => M.add(s, M.scale(B[j], cj)), [0, 0, 0]);
    let corners = [];
    if (B.length === 2) {
      corners = [[lo[0] - pad, lo[1] - pad], [hi[0] + pad, lo[1] - pad], [hi[0] + pad, hi[1] + pad], [lo[0] - pad, hi[1] + pad]].map(at);
    } else if (B.length === 1) {
      corners = [[lo[0] - pad], [hi[0] + pad]].map(at);
    }

    // A cube that holds everything, so right angles look right.
    const all = pts.concat(corners);
    const mid = [0, 1, 2].map(k => (Math.min(...all.map(p => p[k])) + Math.max(...all.map(p => p[k]))) / 2);
    const half = 1.06 * Math.max(0.5, ...[0, 1, 2].map(k => (Math.max(...all.map(p => p[k])) - Math.min(...all.map(p => p[k]))) / 2));
    const R = 2 * half, head = 0.06 * R;

    const traces = [];
    if (B.length === 2) {
      traces.push({
        type: 'mesh3d', x: corners.map(p => p[0]), y: corners.map(p => p[1]), z: corners.map(p => p[2]),
        i: [0, 0], j: [1, 2], k: [2, 3], color: th.accent, opacity: th.dark ? 0.16 : 0.12,
        flatshading: true, lighting: { ambient: 1, diffuse: 0, specular: 0 }, hoverinfo: 'skip', showscale: false
      });
      traces.push(line3(corners.concat([corners[0]]), th.planeEdge, 3));
      const far = corners.reduce((a, c) => M.norm(M.sub(c, f.yhat)) > M.norm(M.sub(a, f.yhat)) ? c : a);
      const pc = M.scale(corners.reduce(M.add), 0.25);
      traces.push(label3(M.add(far, M.scale(M.sub(pc, far), 0.22)), 'subspace generated by the x\'s', th.muted, 13));
    } else if (B.length === 1) {
      traces.push(line3(corners, th.planeEdge, 5, { name: 'the column space is a line' }));
    }


    // Columns of X.
    if (state.cols) {
      f.cols.forEach((c, j) => {
        if (tiny(c, 1)) return;
        traces.push(...arrow3([0, 0, 0], c, th.muted, 3, `column ${f.names[j] === '1' ? '𝟏' : 'x'} of X`, head * 0.7));
        traces.push(label3(M.add(c, M.scale(M.unit(c), 0.05 * R)), f.names[j] === '1' ? '𝟏' : 'x', th.muted, 14));
      });
    }

    const centroid = M.scale(M.add(M.add(y, f.yhat), ybarIn ? f.ybar : [0, 0, 0]), 1 / (ybarIn ? 4 : 3));
    const out = (p, k = 0.07) => { const d = M.unit(M.sub(p, centroid)); return d ? M.add(p, M.scale(d, k * R)) : p; };
    const midpt = (a, c) => M.scale(M.add(a, c), 0.5);
    const s = M.norm(y);

    traces.push(label3(out([0, 0, 0], 0.05), '0', th.ink, 15));
    traces.push(marker3([0, 0, 0], th.ink, 'origin', 3));

    // The mean and the explained part.
    if (ybarIn) {
      if (!tiny(f.ybar, s)) {
        traces.push(...arrow3([0, 0, 0], f.ybar, th.fybar, 6, 'ȳ = ȳ·𝟏', head));
        traces.push(label3(out(midpt([0, 0, 0], f.ybar)), 'ȳ', th.fybar));
      }
      if (!tiny(f.ebar, s)) {
        traces.push(...arrow3(f.ybar, y, th.febar, 6, 'ε̄ = y − ȳ', head));
        traces.push(label3(out(midpt(f.ybar, y)), 'ε̄', th.febar));
      }
      if (!tiny(f.explained, s)) {
        traces.push(line3([f.ybar, f.yhat], th.fess, 7, { name: 'ŷ − ȳ', hover: `ŷ − ȳ<br>${vecStr(f.explained)}<extra></extra>` }));
      }
    }

    // y, its projection and the residual.
    traces.push(...arrow3([0, 0, 0], y, th.fy, 7, 'y', head));
    traces.push(label3(out(y, 0.06), 'y', th.fy, 17));
    if (!tiny(f.yhat, s)) {
      traces.push(...arrow3([0, 0, 0], f.yhat, th.fyhat, 7, 'ŷ = Py', head));
      traces.push(label3(out(midpt([0, 0, 0], f.yhat)), 'ŷ', th.fyhat, 17));
    }
    if (!tiny(f.resid, s)) {
      traces.push(...arrow3(f.yhat, y, th.fresid, 7, 'ε̂ = My', head));
      traces.push(label3(out(midpt(f.yhat, y)), 'ε̂', th.fresid, 17));
    }
    traces.push(marker3(f.yhat, th.fyhat, 'ŷ = Py', 4));

    // Right angle at y_hat between the residual and the plane.
    if (state.right && !tiny(f.resid, s)) {
      const a = M.unit(f.resid);
      let toward = null;
      if (ybarIn && f.onesIn && !tiny(f.explained, s)) toward = M.unit(M.scale(f.explained, -1));
      else if (!tiny(f.yhat, s)) toward = M.unit(M.scale(f.yhat, -1));
      else toward = f.basis[0];
      const legs = [M.norm(f.resid)];
      if (ybarIn && f.onesIn && !tiny(f.explained, s)) legs.push(M.norm(f.explained));
      else if (!tiny(f.yhat, s)) legs.push(M.norm(f.yhat));
      const k = Math.min(0.06 * R, 0.4 * Math.min(...legs));
      const p = f.yhat;
      traces.push(line3([M.add(p, M.scale(a, k)), M.add(M.add(p, M.scale(a, k)), M.scale(toward, k)), M.add(p, M.scale(toward, k))], th.ink, 3));
    }

    // A different fit Xb.
    if (state.cand) {
      traces.push(marker3(Xb, th.accent2, 'Xb', 5));
      traces.push(line3([y, Xb], th.accent2, 5, { dash: 'dash', name: 'y − Xb', hover: `y − Xb, length ${fmt(M.norm(M.sub(y, Xb)))}<extra></extra>` }));
      traces.push(line3([f.yhat, Xb], th.accent2, 3, { dash: 'dot', name: 'ŷ − Xb' }));
      traces.push(label3(out(Xb, 0.06), 'Xb', th.accent2, 15));
    }

    if (state.view !== 'free') state.axes = state.view === 'axes';
    const axis = (title, k) => ({
      title: { text: state.axes ? title : '' }, range: [mid[k] - half, mid[k] + half], color: th.muted, gridcolor: th.grid,
      zerolinecolor: th.line, showbackground: state.axes, backgroundcolor: th.panel, showspikes: false,
      showgrid: state.axes, zeroline: state.axes, showticklabels: state.axes, showline: false, ticks: ''
    });
    if (state.view !== 'free') state.camera = viewCamera(state.view, f);
    Plotly.react('plot3d', traces, {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      font: { color: th.ink, family: th.font, size: 12 },
      showlegend: false,
      uirevision: 'keep',
      hoverlabel: { font: { family: th.font } },
      scene: {
        uirevision: 'keep',
        camera: state.camera,
        aspectmode: 'cube',
        xaxis: axis('i = 1', 0),
        yaxis: axis('i = 2', 1),
        zaxis: axis('i = 3', 2)
      }
    }, U.PLOT_CONFIG);
  }

  const VIEW_NOTES = {
    slide: 'The plane lies flat and the residual points straight up, as in the figure of the notes.',
    down: 'Looking straight down onto the plane: y lands exactly on ŷ. That is what “projection” means.',
    edge: 'Looking along the plane: it shrinks to a line, and ε̂ stands on it at a right angle.',
    axes: 'The axes are the three observations: the point y has coordinates (y₁, y₂, y₃).',
    free: 'Rotated by hand. Pick a view above to return.'
  };

  function setView(view) {
    state.view = view;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    schedule();
  }

  // ---------- 2D panel A: scatter plot ----------

  const XR = [-2.5, 6.5], YR = [-2.5, 6.5];

  function drawA(th, f) {
    const x = xs(), y = f.y, traces = [], dx = 0.09;
    if (f.beta) {
      const b = f.beta, line = x => state.intercept ? b[0] + b[1] * x : b[0] * x;
      traces.push(line2(XR.map(t => [t, line(t)]), th.fyhat, 3, 'fitted line'));
    }
    if (state.cand) {
      const b = coef(), line = x => state.intercept ? b[0] + b[1] * x : b[0] * x;
      traces.push(line2(XR.map(t => [t, line(t)]), th.accent2, 2, 'line of b', 'dash'));
    }
    if (state.mean) traces.push(line2(XR.map(t => [t, f.ybarValue]), th.fybar, 2, 'ȳ', 'dash'));
    for (let i = 0; i < 3; i++) {
      if (state.mean) {
        traces.push(line2([[x[i] - dx, f.ybarValue], [x[i] - dx, y[i]]], th.febar, 3));
        traces.push(line2([[x[i] + dx, f.ybarValue], [x[i] + dx, f.yhat[i]]], th.fess, 3));
        traces.push(line2([[x[i] + dx, f.yhat[i]], [x[i] + dx, y[i]]], th.fresid, 3));
      } else {
        traces.push(line2([[x[i], f.yhat[i]], [x[i], y[i]]], th.fresid, 3));
      }
    }
    traces.push(dot2(x.map((xi, i) => [xi, f.yhat[i]]), th.fyhat, 'ŷᵢ', 7));
    traces.push(dot2(x.map((xi, i) => [xi, y[i]]), th.fy, 'yᵢ', 12, {
      mode: 'markers+text', text: ['1', '2', '3'], textposition: 'top left', textfont: { color: th.muted, size: 11 }
    }));
    Plotly.react('plotA', traces, U.base2d(th, {
      xt: 'x', yt: 'y',
      x: { range: XR, zeroline: true, zerolinecolor: th.line },
      y: { range: YR, zeroline: true, zerolinecolor: th.line }
    }), U.PLOT_CONFIG);
  }

  // Drag the data points of the scatter plot.
  function enableDrag() {
    const gd = $('plotA');
    let which = -1;
    const nearest = ev => {
      const p = U.eventToData(gd, ev), fl = gd._fullLayout;
      if (!p || !fl) return -1;
      const sx = fl.xaxis._length / (XR[1] - XR[0]), sy = fl.yaxis._length / (YR[1] - YR[0]);
      let best = -1, bd = 28;
      xs().forEach((xi, i) => {
        const d = Math.hypot((xi - p[0]) * sx, (ys()[i] - p[1]) * sy);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };
    const move = ev => {
      const p = U.eventToData(gd, ev);
      if (!p) return;
      ctrls['x' + (which + 1)].set(p[0]);
      ctrls['y' + (which + 1)].set(p[1]);
    };
    gd.addEventListener('pointerdown', ev => {
      which = nearest(ev);
      if (which < 0) return;
      gd.classList.add('dragging');
      if (gd.setPointerCapture) gd.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      move(ev);
    }, true);
    gd.addEventListener('pointermove', ev => { if (which >= 0) move(ev); }, true);
    const end = () => { which = -1; gd.classList.remove('dragging'); };
    gd.addEventListener('pointerup', end, true);
    gd.addEventListener('pointercancel', end, true);
  }

  // ---------- 2D panel B: the triangle y_bar, y_hat, y with squares on its sides ----------

  function drawB(th, f) {
    const e = Math.sqrt(f.ess), r = Math.sqrt(f.rss), t = Math.sqrt(f.tss);
    // Angle at y_hat between y_bar - y_hat and y - y_hat (90 degrees when 1 is in the column space).
    let theta = Math.PI / 2;
    if (e > 1e-9 && r > 1e-9) theta = M.angle(M.scale(f.explained, -1), f.resid) * Math.PI / 180;
    const A = [0, 0], Yb = [-e, 0], Yp = [-r * Math.cos(theta), r * Math.sin(theta)];
    const vtx = { yhat: A, ybar: Yb, y: Yp };
    const traces = [], annotations = [];
    const pts = [A, Yb, Yp];

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

    const side = (P, Q, color) => traces.push(line2([P, Q], color, 4));
    side(Yb, Yp, th.febar); side(Yb, A, th.fess); side(A, Yp, th.fresid);
    traces.push(dot2([Yb], th.fybar, 'ȳ', 9), dot2([A], th.fyhat, 'ŷ', 9), dot2([Yp], th.fy, 'y', 9));
    const lab = (p, text, color, ax, ay) => annotations.push({ x: p[0], y: p[1], text, showarrow: false, xshift: ax, yshift: ay, font: { color, size: 15, family: 'Georgia, serif' } });
    lab(vtx.ybar, 'ȳ', th.fybar, -10, 10); lab(vtx.yhat, 'ŷ', th.fyhat, 12, 10); lab(vtx.y, 'y', th.fy, 10, 10);

    // Right-angle mark at y_hat.
    if (Math.abs(theta - Math.PI / 2) < 1e-6 && e > 1e-9 && r > 1e-9) {
      const k = 0.12 * Math.min(e, r);
      traces.push(line2([[-k, 0], [-k, k], [0, k]], th.ink, 1.5));
    }

    const xsP = pts.map(p => p[0]), ysP = pts.map(p => p[1]);
    const pad = 0.08 * Math.max(1e-6, Math.max(...xsP) - Math.min(...xsP), Math.max(...ysP) - Math.min(...ysP));
    const layout = U.base2d(th, {
      margin: { l: 8, r: 8, t: 8, b: 8 },
      x: { range: [Math.min(...xsP) - pad, Math.max(...xsP) + pad], visible: false },
      y: { range: [Math.min(...ysP) - pad, Math.max(...ysP) + pad], visible: false, scaleanchor: 'x', scaleratio: 1 },
      annotations
    });
    Plotly.react('plotB', traces, layout, U.PLOT_CONFIG);

    const deg = theta * 180 / Math.PI;
    const coincide = Math.abs(f.tss - f.ess - f.rss) <= 1e-9 * Math.max(1, f.tss);
    $('triangle-caption').innerHTML = !f.onesIn && coincide
      ? `Without an intercept ${texStr('\\bar y')} is in general not in the plane. For these data the residuals happen to sum to zero, so the angle at ŷ is still 90° and TSS = ESS + RSS. Move a point to break it.`
      : f.onesIn
      ? `The triangle <span class="c-ybar">ȳ</span>, <span class="c-yhat">ŷ</span>, y from the 3D figure, drawn flat. Its angle at ŷ is a right angle, so the squares on its sides add up: ${f2(f.tss)} = ${f2(f.ess)} + ${f2(f.rss)}, and ${texStr('R^2=ESS/TSS')} = ${f.r2 === null ? '—' : f2(f.r2, 3)}.`
      : `Without an intercept ${texStr('\\bar y')} is not in the plane, the angle at ŷ is ${f2(deg, 1)}° rather than 90°, and the squares do not add up: TSS = ${f2(f.tss)} but ESS + RSS = ${f2(f.ess + f.rss)}.`;
  }

  // ---------- formulas and readouts ----------

  function renderFormulas(f) {
    tex($('formula-model'), state.intercept
      ? 'y_i=\\beta_0+\\beta_1x_i+\\varepsilon_i,\\quad y=X\\beta+\\varepsilon'
      : 'y_i=\\beta_1x_i+\\varepsilon_i,\\quad y=X\\beta+\\varepsilon', true);
    const X = state.intercept ? xs().map(xi => [1, xi]) : xs().map(xi => [xi]);
    const Xtex = `\\begin{pmatrix}${X.map(r => r.map(num).join('&')).join('\\\\')}\\end{pmatrix}`;
    const bh = f.beta ? `\\hat\\beta=(X^TX)^{-1}X^Ty=${texVec(f.beta)}` : '\\hat\\beta\\ \\text{not unique}';
    tex($('formula-numbers'), `y=${texVec(f.y)},\\quad X=${Xtex}`, true);
    tex($('formula-beta'), bh, true);
    tex($('formula-P'), `P=X(X^TX)^{-1}X^T=${texMat(f.P)}`, true);
    tex($('formula-M'), `M=I-P=${texMat(f.M)}`, true);
    const maxDiff = (A, B) => Math.max(...A.flatMap((r, i) => r.map((a, j) => Math.abs(a - B[i][j]))));
    const ok = v => v < 1e-9 ? '<span class="ok-mark">✓</span>' : '<span class="no-mark">✗</span>';
    const PP = M.matMul(f.P, f.P), MM = M.matMul(f.M, f.M);
    $('pm-checks').innerHTML =
      `Symmetric ${texStr('P^T=P')} ${ok(maxDiff(M.transpose(f.P), f.P))}, idempotent ${texStr('PP=P')} ${ok(maxDiff(PP, f.P))} and ${texStr('MM=M')} ${ok(maxDiff(MM, f.M))}. ` +
      `Trace of ${texStr('P')} = ${f2(f.P[0][0] + f.P[1][1] + f.P[2][2])} = dimension of the column space. Projecting twice changes nothing: ${texStr('P\\hat y=\\hat y')}.`;
  }

  const READOUTS = [
    ['beta', '\\hat\\beta'],
    ['yhat', '\\hat y=Py'],
    ['resid', '\\hat\\varepsilon=My'],
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
    set('beta', f.beta ? vecStr(f.beta) : 'not unique');
    set('yhat', vecStr(f.yhat));
    set('resid', vecStr(f.resid));
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
    } else if (tiny(f.resid, s)) {
      sentence = 'y lies in the plane: the fit is perfect, ε̂ = 0 and R² = 1.';
    } else if (f.onesIn && tiny(f.explained, s)) {
      sentence = 'ŷ = ȳ: the regressor explains nothing beyond the mean, ESS = 0 and R² = 0.';
    }
    if (!f.onesIn) sentence += ' Without an intercept, R² = 1 − RSS/TSS is no longer ESS/TSS and can even be negative.';
    $('sentence').textContent = sentence;

    if (f.rank < f.cols.length) {
      warn.push(f.rank === 0
        ? 'x = 0: the column space is just the origin.'
        : 'The columns of X are collinear: they span only a line, X^T X is not invertible and β̂ is not unique. The projection ŷ = Py is still unique.');
    }
    if (f.tss < 1e-12) warn.push('All y are equal: TSS = 0 and R² is undefined.');
    $('warning').hidden = !warn.length;
    $('warning').textContent = warn.join(' ');
  }

  // ---------- render loop ----------

  function render() {
    U.applyVisibility({ intercept: state.intercept, cand: state.cand, mean: state.mean });
    const f = M.fit(xs(), ys(), state.intercept);
    $('view-note').textContent = f.rank < 2 && state.view !== 'axes' && state.view !== 'free'
      ? 'Here the columns of X span only a line, so there is no plane to lay flat: the view falls back to the axes. ŷ is still the foot of the perpendicular from y.'
      : VIEW_NOTES[state.view];
    const th = U.theme();
    // Draw each panel on its own, so one failing plot does not blank the others.
    guard('formulas', () => renderFormulas(f));
    guard('3D plot', () => draw3d(th, f));
    guard('scatter plot', () => drawA(th, f));
    guard('triangle', () => drawB(th, f));
    guard('readouts', () => renderReadouts(f));
  }

  // ---------- init ----------

  function applyPreset(name) {
    const p = PRESETS[name];
    p.x.forEach((v, i) => { state['x' + (i + 1)] = v; });
    p.y.forEach((v, i) => { state['y' + (i + 1)] = v; });
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
    check('show-cols', 'cols');
    check('show-right', 'right');
    check('show-cand', 'cand');
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('to-ols').addEventListener('click', () => {
      const f = M.fit(xs(), ys(), state.intercept);
      if (!f.beta) { U.showError('β̂ is not unique here: the columns of X are collinear.'); return; }
      if (state.intercept) { ctrls.b0.setExact(f.beta[0]); ctrls.b1.setExact(f.beta[1]); }
      else ctrls.b1.setExact(f.beta[0]);
    });

    setView(state.view);
    render();
    enableDrag();

    // When the user rotates the figure, keep their camera.
    $('plot3d').on('plotly_relayout', ev => {
      const cam = ev['scene.camera'];
      if (!cam) return;
      state.camera = { ...state.camera, ...JSON.parse(JSON.stringify(cam)) };
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
