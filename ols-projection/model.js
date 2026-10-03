/*
 * Regression as a Projection: model.
 *
 * Linear regression y = X beta + eps with n = 3 observations, so that the vector y lives in R^3
 * and can be drawn. X has the columns 1 = (1,1,1) (if there is an intercept) and x = (x1,x2,x3).
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
 * Works in the browser (window.ProjectionModel) and in Node (module.exports) for tests.
 */
(function (root) {
  'use strict';

  const N = 3;
  const RANK_TOL = 1e-9; // a column shorter than this (relative) after Gram-Schmidt adds no dimension

  // ---------- vectors ----------

  const dot = (a, b) => a.reduce((s, ai, i) => s + ai * b[i], 0);
  const add = (a, b) => a.map((ai, i) => ai + b[i]);
  const sub = (a, b) => a.map((ai, i) => ai - b[i]);
  const scale = (a, c) => a.map(ai => ai * c);
  const norm = a => Math.sqrt(dot(a, a));
  const unit = a => { const l = norm(a); return l > 0 ? scale(a, 1 / l) : null; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ones = () => Array(N).fill(1);
  const mean = a => a.reduce((s, ai) => s + ai, 0) / a.length;

  // Angle between two vectors in degrees (null if one of them is zero).
  function angle(a, b) {
    const la = norm(a), lb = norm(b);
    if (!(la > 0 && lb > 0)) return null;
    return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (la * lb)))) * 180 / Math.PI;
  }

  // ---------- the design matrix, stored by columns ----------

  // Columns of X: [1, x] with an intercept, [x] without.
  const design = (x, intercept) => intercept ? [ones(), x.slice()] : [x.slice()];
  const colNames = intercept => intercept ? ['1', 'x'] : ['x'];

  // X b for coefficients b (one per column).
  const fitted = (cols, b) => cols.reduce((s, c, j) => add(s, scale(c, b[j])), Array(N).fill(0));

  // Residual sum of squares |y - X b|^2.
  const rss = (cols, y, b) => { const r = sub(y, fitted(cols, b)); return dot(r, r); };

  // Orthonormal basis of the column space (Gram-Schmidt); its length is the rank of X.
  function basis(cols) {
    const out = [];
    const big = Math.max(1, ...cols.map(norm));
    for (const c of cols) {
      let v = c.slice();
      for (const q of out) v = sub(v, scale(q, dot(v, q)));
      for (const q of out) v = sub(v, scale(q, dot(v, q))); // second pass for accuracy
      const l = norm(v);
      if (l > RANK_TOL * big) out.push(scale(v, 1 / l));
    }
    return out;
  }

  // Orthogonal projection of v onto the span of an orthonormal basis.
  const project = (v, B) => B.reduce((s, q) => add(s, scale(q, dot(v, q))), Array(N).fill(0));

  // P = sum_q q q'  (equals X (X'X)^{-1} X' when X has full column rank).
  function projectionMatrix(B) {
    const P = Array.from({ length: N }, () => Array(N).fill(0));
    for (const q of B) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) P[i][j] += q[i] * q[j];
    return P;
  }
  const residualMaker = P => P.map((row, i) => row.map((p, j) => (i === j ? 1 : 0) - p));
  const matVec = (A, v) => A.map(row => dot(row, v));
  const matMul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
  const transpose = A => A[0].map((_, j) => A.map(row => row[j]));

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

  // Unit normal of the column space when it is a plane in R^3 (rank 2), else null.
  function planeNormal(B) {
    return B.length === 2 ? unit(cross(B[0], B[1])) : null;
  }

  /*
   * Everything the figure needs. x, y: arrays of length 3; intercept: boolean.
   */
  function fit(x, y, intercept) {
    const cols = design(x, intercept), B = basis(cols), rank = B.length;
    const beta = rank === cols.length ? normalEquations(cols, y) : null;
    const yhat = project(y, B), resid = sub(y, yhat);
    const yb = mean(y), ybar = scale(ones(), yb), ebar = sub(y, ybar), explained = sub(yhat, ybar);
    const tss = dot(ebar, ebar), ess = dot(explained, explained), rssHat = dot(resid, resid);
    const P = projectionMatrix(B), M = residualMaker(P);
    const XtE = cols.map(c => dot(c, resid));
    // Does the column space contain 1? Then y_bar is in the plane and TSS = ESS + RSS.
    const onesIn = norm(sub(ones(), project(ones(), B))) <= 1e-9 * Math.sqrt(N);
    return {
      cols, names: colNames(intercept), basis: B, rank, beta,
      y: y.slice(), yhat, resid, ybarValue: yb, ybar, ebar, explained,
      tss, ess, rss: rssHat, onesIn,
      r2: tss > 0 ? 1 - rssHat / tss : null,           // 1 - RSS/TSS, as in the notes
      r2ess: tss > 0 ? ess / tss : null,                // ESS/TSS (equal to the above only if 1 is in the column space)
      r2cor: corr2(yhat, y),                            // cor(y_hat, y)^2
      P, M, XtE, normal: planeNormal(B),
      // 90 degrees: y_hat is orthogonal to eps_hat (null when either is numerically zero)
      angleResid: tiny(resid, y) || tiny(yhat, y) ? null : angle(resid, yhat)
    };
  }

  // Is v zero up to rounding, relative to the size of y?
  const tiny = (v, y) => norm(v) <= 1e-9 * Math.max(1, norm(y));

  // Squared sample correlation; null when one of the vectors is constant.
  function corr2(a, b) {
    const ca = sub(a, scale(ones(), mean(a))), cb = sub(b, scale(ones(), mean(b)));
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

  const api = {
    N, dot, add, sub, scale, norm, unit, cross, angle, mean, ones,
    design, colNames, fitted, rss, basis, project, projectionMatrix, residualMaker,
    matVec, matMul, transpose, gram, normalEquations, planeNormal, fit, corr2, simpleOLS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProjectionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
