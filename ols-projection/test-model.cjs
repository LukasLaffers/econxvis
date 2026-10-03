// Checks the projection model against independent numerical calculations.
// Run with:  node ols-projection/test-model.cjs
const assert = require('node:assert/strict');
const M = require('./model.js');

const close = (a, b, tol = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} != ${b}`);
const closeVec = (a, b, tol, msg) => a.forEach((ai, i) => close(ai, b[i], tol, msg));

let checks = 0;

// Deterministic pseudo-random numbers, so failures are reproducible.
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const draw = (lo, hi) => lo + (hi - lo) * rand();

// Brute force: minimise RSS by coordinate search (independent of the normal equations).
function bruteForce(cols, y) {
  let b = cols.map(() => 0), step = 8;
  let best = M.rss(cols, y, b);
  while (step > 1e-11) {
    let improved = false;
    for (let j = 0; j < b.length; j++) {
      for (const d of [step, -step]) {
        const c = b.slice(); c[j] += d;
        const r = M.rss(cols, y, c);
        if (r < best) { best = r; b = c; improved = true; }
      }
    }
    if (!improved) step /= 2;
  }
  return { b, rss: best };
}

// Explicit P = X (X'X)^{-1} X' for full-rank X (independent of Gram-Schmidt).
function explicitP(cols) {
  const X = M.transpose(cols), G = M.gram(cols);
  let Ginv;
  if (cols.length === 1) Ginv = [[1 / G[0][0]]];
  else {
    const det = G[0][0] * G[1][1] - G[0][1] * G[1][0];
    Ginv = [[G[1][1] / det, -G[0][1] / det], [-G[1][0] / det, G[0][0] / det]];
  }
  return M.matMul(M.matMul(X, Ginv), cols);
}

const cases = [
  { x: [1, 2, 3], y: [1, 3.5, 3] },   // the default of the tool
  { x: [1, 2, 3], y: [1, 2, 3] },     // perfect fit
  { x: [1, 2, 3], y: [2, 4, 2] },     // slope zero: R^2 = 0
  { x: [-1, 0.5, 4], y: [3, -2, 0.7] }
];
for (let k = 0; k < 60; k++) cases.push({ x: [draw(-3, 5), draw(-3, 5), draw(-3, 5)], y: [draw(-3, 5), draw(-3, 5), draw(-3, 5)] });

for (const { x, y } of cases) {
  for (const intercept of [true, false]) {
    const label = JSON.stringify({ x, y, intercept });
    const f = M.fit(x, y, intercept);
    assert.equal(f.rank, intercept ? 2 : 1, label);

    // 1. beta_hat minimises the sum of squares (brute force) and matches the textbook formulas.
    const bf = bruteForce(f.cols, y);
    closeVec(f.beta, bf.b, 1e-3, 'brute force beta ' + label); // loose: the valley is long when x is nearly constant
    close(f.rss, bf.rss, 1e-8, 'brute force RSS ' + label);
    closeVec(f.beta, M.simpleOLS(x, y, intercept), 1e-9, 'Sxy/Sxx ' + label);
    checks += 3;

    // 2. y_hat = X beta_hat = P y with P = X (X'X)^{-1} X'; eps_hat = M y.
    const P = explicitP(f.cols);
    closeVec(f.yhat, M.fitted(f.cols, f.beta), 1e-9, 'yhat = X beta ' + label);
    closeVec(f.yhat, M.matVec(P, y), 1e-9, 'yhat = P y ' + label);
    closeVec(f.resid, M.matVec(M.residualMaker(P), y), 1e-9, 'eps = M y ' + label);
    P.forEach((row, i) => closeVec(f.P[i], row, 1e-9, 'P ' + label));
    checks += 4;

    // 3. P and M are symmetric and idempotent, PM = 0.
    const PP = M.matMul(f.P, f.P), MM = M.matMul(f.M, f.M), PM = M.matMul(f.P, f.M);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      close(f.P[i][j], f.P[j][i], 1e-12, 'P symmetric');
      close(f.M[i][j], f.M[j][i], 1e-12, 'M symmetric');
      close(PP[i][j], f.P[i][j], 1e-9, 'P idempotent');
      close(MM[i][j], f.M[i][j], 1e-9, 'M idempotent');
      close(PM[i][j], 0, 1e-9, 'PM = 0');
      checks += 5;
    }
    // trace P = rank
    close(f.P[0][0] + f.P[1][1] + f.P[2][2], f.rank, 1e-9, 'trace P');
    checks++;

    // 4. Residuals are orthogonal to every column of X and to y_hat; y = y_hat + eps_hat.
    f.XtE.forEach(v => close(v, 0, 1e-9, "X'eps " + label));
    close(M.dot(f.yhat, f.resid), 0, 1e-9, 'yhat . eps ' + label);
    if (f.angleResid !== null) close(f.angleResid, 90, 1e-6, 'angle ' + label);
    closeVec(M.add(f.yhat, f.resid), y, 1e-12, 'y = yhat + eps ' + label);
    checks += 4;

    // 5. Pythagoras: |y|^2 = |yhat|^2 + |eps|^2, and for any b: RSS(b) = RSS + |X(beta_hat - b)|^2.
    close(M.dot(y, y), M.dot(f.yhat, f.yhat) + f.rss, 1e-9, 'Pythagoras ' + label);
    for (let t = 0; t < 5; t++) {
      const b = f.cols.map(() => draw(-4, 4));
      const d = M.fitted(f.cols, M.sub(f.beta, b));
      close(M.rss(f.cols, y, b), f.rss + M.dot(d, d), 1e-9, 'RSS(b) ' + label);
      assert.ok(M.rss(f.cols, y, b) >= f.rss - 1e-12, 'OLS is the minimum ' + label);
      checks += 2;
    }

    // 6. With an intercept: TSS = ESS + RSS, R^2 = 1 - RSS/TSS = ESS/TSS = cor(yhat, y)^2,
    //    residuals sum to zero, and the mean of the fitted values is ybar.
    if (intercept) {
      assert.ok(f.onesIn, label);
      close(f.tss, f.ess + f.rss, 1e-9, 'TSS = ESS + RSS ' + label);
      close(f.r2, f.r2ess, 1e-9, 'R2 two ways ' + label);
      if (f.r2cor !== null) close(f.r2, f.r2cor, 1e-9, 'R2 = cor^2 ' + label);
      close(f.resid[0] + f.resid[1] + f.resid[2], 0, 1e-9, 'sum of residuals ' + label);
      close(M.mean(f.yhat), M.mean(y), 1e-9, 'mean of yhat ' + label);
      // ybar 1 is the projection of y on the intercept column alone.
      closeVec(f.ybar, M.project(y, M.basis([M.ones()])), 1e-9, 'ybar = projection on 1 ' + label);
      checks += 6;
    }
  }
}

// 7. Without an intercept the decomposition TSS = ESS + RSS fails in general.
{
  const f = M.fit([1, 2, 3], [1, 3.5, 3], false);
  assert.equal(f.onesIn, false);
  assert.ok(Math.abs(f.tss - (f.ess + f.rss)) > 0.1, 'no intercept: TSS != ESS + RSS');
  checks += 2;
}

// 8. Default of the tool: beta_hat = (0.5, 1), RSS = 1.5, ESS = 2, TSS = 3.5.
{
  const f = M.fit([1, 2, 3], [1, 3.5, 3], true);
  closeVec(f.beta, [0.5, 1], 1e-12, 'default beta');
  close(f.rss, 1.5, 1e-12); close(f.ess, 2, 1e-12); close(f.tss, 3.5, 1e-12);
  checks += 4;
}

// 9. Collinear columns (x constant): beta_hat is not unique, but the projection is: y_hat = ybar 1.
{
  const y = [1, 3.5, 3], f = M.fit([2, 2, 2], y, true);
  assert.equal(f.rank, 1);
  assert.equal(f.beta, null);
  assert.equal(f.normal, null);
  closeVec(f.yhat, f.ybar, 1e-12, 'collinear: yhat = ybar');
  close(f.ess, 0, 1e-12);
  // any b with b0 + 2 b1 = ybar attains the minimum
  const yb = M.mean(y);
  for (const b1 of [-1, 0, 2.5]) close(M.rss(f.cols, y, [yb - 2 * b1, b1]), f.rss, 1e-9, 'collinear minimum');
  checks += 7;
}

// 10. y in the column space: perfect fit, zero residual; y orthogonal to it: y_hat = 0.
{
  const f = M.fit([0, 1, 5], [2, 3, 7], true); // y = 2 + x
  closeVec(f.beta, [2, 1], 1e-12); close(f.rss, 0, 1e-12); close(f.r2, 1, 1e-12);
  const g = M.fit([1, -1, 0], [1, 1, 1], false); // y = 1 is orthogonal to x
  closeVec(g.yhat, [0, 0, 0], 1e-12); close(g.beta[0], 0, 1e-12);
  checks += 5;
}

// 11. The plane normal is orthogonal to both columns and is parallel to eps_hat.
for (const { x, y } of cases.slice(0, 20)) {
  const f = M.fit(x, y, true), n = f.normal;
  close(M.norm(n), 1, 1e-12);
  f.cols.forEach(c => close(M.dot(n, c), 0, 1e-9, 'normal'));
  close(Math.abs(M.dot(n, f.resid)), M.norm(f.resid), 1e-9, 'eps along normal');
  checks += 4;
}

console.log(`All ${checks} model checks passed.`);
