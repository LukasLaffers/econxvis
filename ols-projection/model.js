/*
 * Regression as a Projection: model.
 *
 * Linear regression y = X beta + eps with n observations. y lives in R^n; X has the columns
 * 1 = (1,...,1) (if there is an intercept) and x = (x_1,...,x_n).
 *
 *   beta_hat = (X'X)^{-1} X'y                 OLS estimator (null when X'X is singular)
 *   y_hat    = X beta_hat = P y               fitted values,   P = X (X'X)^{-1} X'
 *   eps_hat  = y - y_hat  = M y               residuals,       M = I - P
 *   y_bar    = mean(y) * 1                     the vector of means
 *   eps_bar  = y - y_bar                        deviations from the mean
 *   TSS = |y - y_bar|^2,  ESS = |y_hat - y_bar|^2,  RSS = |y - y_hat|^2
 *
 * The projection is computed from an orthonormal basis of the column space (Gram-Schmidt), so
 * y_hat and eps_hat are defined even when the columns of X are collinear and beta_hat is not unique.
 *
 * Drawing R^n: 0, 1, x, y and every vector built from them (y_hat, y_bar, eps_hat, X b, ...) lie in the
 * subspace spanned by 1, x and y, which has dimension at most 3. frame(f) gives an orthonormal basis
 * e1, e2, e3 of it, with the column space spanned by e1, e2 (e1 along y_hat) and e3 along eps_hat.
 * Coordinates in this frame keep all lengths and angles exactly.
 *
 * Works in the browser (window.ProjectionModel) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  const RANK_TOL = 1e-9; // a column shorter than this (relative) after Gram-Schmidt adds no dimension

  // ---------- vectors (any length) ----------

  const dot = (a, b) => a.reduce((s, ai, i) => s + ai * b[i], 0);
  const add = (a, b) => a.map((ai, i) => ai + b[i]);
  const sub = (a, b) => a.map((ai, i) => ai - b[i]);
  const scale = (a, c) => a.map(ai => ai * c);
  const norm = a => Math.sqrt(dot(a, a));
  const unit = a => { const l = norm(a); return l > 0 ? scale(a, 1 / l) : null; };
  const zeros = n => Array(n).fill(0);
  const ones = n => Array(n).fill(1);
  const mean = a => a.reduce((s, ai) => s + ai, 0) / a.length;

  // Angle between two vectors in degrees (null if one of them is zero).
  function angle(a, b) {
    const la = norm(a), lb = norm(b);
    if (!(la > 0 && lb > 0)) return null;
    return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (la * lb)))) * 180 / Math.PI;
  }

  // Is v zero up to rounding, relative to the size s?
  const tiny = (v, s) => norm(v) <= 1e-9 * Math.max(1, s);

  // ---------- the design matrix, stored by columns ----------

  // Columns of X: [1, x] with an intercept, [x] without.
  const design = (x, intercept) => intercept ? [ones(x.length), x.slice()] : [x.slice()];
  const colNames = intercept => intercept ? ['1', 'x'] : ['x'];

  // X b for coefficients b (one per column).
  const fitted = (cols, b) => cols.reduce((s, c, j) => add(s, scale(c, b[j])), zeros(cols[0].length));

  // Residual sum of squares |y - X b|^2.
  const rss = (cols, y, b) => { const r = sub(y, fitted(cols, b)); return dot(r, r); };

  // Extend the orthonormal vectors B by the new directions in vs (Gram-Schmidt, two passes for accuracy).
  // A vector that adds nothing new (relative to max(big, its own length)) is skipped.
  function extendBasis(B, vs, big = 1) {
    const out = B.slice();
    for (const c of vs) {
      let v = c.slice();
      for (let pass = 0; pass < 2; pass++) for (const q of out) v = sub(v, scale(q, dot(v, q)));
      const l = norm(v);
      if (l > RANK_TOL * Math.max(big, norm(c))) out.push(scale(v, 1 / l));
    }
    return out;
  }

  // Orthonormal basis of the column space; its length is the rank of X.
  const basis = cols => extendBasis([], cols, Math.max(1, ...cols.map(norm)));

  // Orthogonal projection of v onto the span of an orthonormal basis.
  const project = (v, B) => B.reduce((s, q) => add(s, scale(q, dot(v, q))), zeros(v.length));

  // P = sum_q q q'  (equals X (X'X)^{-1} X' when X has full column rank).
  function projectionMatrix(B, n) {
    const P = Array.from({ length: n }, () => zeros(n));
    for (const q of B) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P[i][j] += q[i] * q[j];
    return P;
  }
  const residualMaker = P => P.map((row, i) => row.map((p, j) => (i === j ? 1 : 0) - p));
  const matVec = (A, v) => A.map(row => dot(row, v));
  const matMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
  const transpose = A => A[0].map((_, j) => A.map(row => row[j]));
  const trace = A => A.reduce((s, row, i) => s + row[i], 0);

  // X'X for the columns.
  const gram = cols => cols.map(a => cols.map(b => dot(a, b)));

  // Solve X'X beta = X'y (1x1 or 2x2); null when X'X is (numerically) singular.
  function normalEquations(cols, y) {
    const G = gram(cols), r = cols.map(c => dot(c, y));
    if (cols.length === 1) return G[0][0] > RANK_TOL ? [r[0] / G[0][0]] : null;
    const det = G[0][0] * G[1][1] - G[0][1] * G[1][0];
    if (Math.abs(det) <= RANK_TOL * Math.max(1, G[0][0] * G[1][1])) return null;
    return [(G[1][1] * r[0] - G[0][1] * r[1]) / det, (G[0][0] * r[1] - G[1][0] * r[0]) / det];
  }

  /*
   * Everything the figure needs. x, y: arrays of the same length n; intercept: boolean.
   * withMatrices: also return the n x n matrices P and M.
   */
  function fit(x, y, intercept, withMatrices = true) {
    const n = y.length, cols = design(x, intercept), B = basis(cols), rank = B.length;
    const beta = rank === cols.length ? normalEquations(cols, y) : null;
    const yhat = project(y, B), resid = sub(y, yhat);
    const yb = mean(y), ybar = scale(ones(n), yb), ebar = sub(y, ybar), explained = sub(yhat, ybar);
    const tss = dot(ebar, ebar), ess = dot(explained, explained), rssHat = dot(resid, resid);
    const XtE = cols.map(c => dot(c, resid));
    // Does the column space contain 1? Then y_bar is in it and TSS = ESS + RSS.
    const onesIn = norm(sub(ones(n), project(ones(n), B))) <= 1e-9 * Math.sqrt(n);
    const s = norm(y);
    const out = {
      n, cols, names: colNames(intercept), basis: B, rank, beta,
      y: y.slice(), yhat, resid, ybarValue: yb, ybar, ebar, explained,
      tss, ess, rss: rssHat, onesIn,
      r2: tss > 0 ? 1 - rssHat / tss : null,           // 1 - RSS/TSS, as in the notes
      r2ess: tss > 0 ? ess / tss : null,                // ESS/TSS (equal to the above only if 1 is in the column space)
      r2cor: corr2(yhat, y),                            // cor(y_hat, y)^2
      XtE,
      // 90 degrees: y_hat is orthogonal to eps_hat (null when either is numerically zero)
      angleResid: tiny(resid, s) || tiny(yhat, s) ? null : angle(resid, yhat)
    };
    if (withMatrices) {
      out.P = projectionMatrix(B, n);
      out.M = residualMaker(out.P);
    }
    return out;
  }

  // Squared sample correlation; null when one of the vectors is constant.
  function corr2(a, b) {
    const ca = sub(a, scale(ones(a.length), mean(a))), cb = sub(b, scale(ones(b.length), mean(b)));
    const d = dot(ca, ca) * dot(cb, cb);
    if (!(d > 1e-18)) return null;
    return dot(ca, cb) * dot(ca, cb) / d;
  }

  // Simple-regression formulas (independent check): beta1 = Sxy/Sxx, beta0 = ybar - beta1 xbar.
  function simpleOLS(x, y, intercept) {
    if (!intercept) {
      const sxx = dot(x, x);
      return sxx > 0 ? [dot(x, y) / sxx] : null;
    }
    const xb = mean(x), yb = mean(y);
    const sxx = x.reduce((s, xi) => s + (xi - xb) ** 2, 0);
    if (!(sxx > 1e-12)) return null;
    const sxy = x.reduce((s, xi, i) => s + (xi - xb) * (y[i] - yb), 0);
    const b1 = sxy / sxx;
    return [yb - b1 * xb, b1];
  }

  /*
   * An orthonormal frame e1, e2, e3 of R^n for drawing a fit f:
   *   e1 along y_hat (or along the column space when y_hat = 0),
   *   e2 completes the column space when it is a plane (rank 2),
   *   e3 along eps_hat,
   * filled up, if needed, with the remaining directions of 1, x, y and then unit vectors.
   * planar: true when e1, e2 span the column space.
   * to3(v) = (v.e1, v.e2, v.e3) keeps lengths and angles exactly for every v in span(1, x, y).
   */
  function frame(f) {
    const n = f.n, s = norm(f.y), planar = f.rank === 2;
    let E = extendBasis([], tiny(f.yhat, s) ? f.basis : [f.yhat]);
    if (planar) E = extendBasis(E, f.basis);
    const hasResid = !tiny(f.resid, s);
    if (hasResid) E = extendBasis(E, [f.resid]);
    E = extendBasis(E, [ones(n), ...f.cols, f.y]);
    for (let i = 0; E.length < 3 && i < n; i++) E = extendBasis(E, [zeros(n).map((_, j) => j === i ? 1 : 0)]);
    E = E.slice(0, 3);
    // With a line as column space (rank 1) the residual came second: move it to e3 ("up").
    if (!planar && hasResid && E.length === 3) E = [E[0], E[2], E[1]];
    // Orientation: y_hat along +e1, y on the +e3 side.
    if (dot(f.yhat, E[0]) < 0) E[0] = scale(E[0], -1);
    if (E.length === 3 && dot(f.y, E[2]) < 0) E[2] = scale(E[2], -1);
    return { e: E, planar, to3: v => E.map(q => dot(v, q)) };
  }

  // ---------- simulated data ----------

  // Small seeded generator (mulberry32), so a sample can be reproduced from its seed.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /*
   * Raw draws for a sample: u_i uniform on [0, 1) (for x) and z_i standard normal (for the error).
   * The first draws do not depend on n, so changing n adds or removes observations at the end.
   */
  function draws(seed, n) {
    const r = rng(seed), u = [], z = [];
    for (let i = 0; i < n; i++) {
      u.push(r());
      const r1 = Math.max(r(), 1e-12), r2 = r();
      z.push(Math.sqrt(-2 * Math.log(r1)) * Math.cos(2 * Math.PI * r2)); // Box-Muller
    }
    return { u, z };
  }

  // y_i = beta0 + beta1 x_i + sigma z_i with x_i = xmin + (xmax - xmin) u_i.
  function sample(d, beta0, beta1, sigma, xmin = 0, xmax = 10) {
    const x = d.u.map(u => xmin + (xmax - xmin) * u);
    return { x, y: x.map((xi, i) => beta0 + beta1 * xi + sigma * d.z[i]) };
  }

  const api = {
    dot, add, sub, scale, norm, unit, angle, mean, ones, zeros, tiny,
    design, colNames, fitted, rss, extendBasis, basis, project, projectionMatrix, residualMaker,
    matVec, matMul, transpose, trace, gram, normalEquations, fit, corr2, simpleOLS, frame,
    rng, draws, sample
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProjectionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
