// Checks the projection model against independent numerical calculations.
// Run with:  node ols-projection/test-model.cjs
const assert = require('node:assert/strict');
const M = require('./model.js');

const close = (a, b, tol = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} ${a} != ${b}`);
const closeVec = (a, b, tol, msg) => { assert.equal(a.length, b.length, msg); a.forEach((ai, i) => close(ai, b[i], tol, msg)); };

let checks = 0;

// Deterministic pseudo-random numbers for the test cases (independent of the model's generator).
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const draw = (lo, hi) => lo + (hi - lo) * rand();
const vec = (n, lo, hi) => Array.from({ length: n }, () => draw(lo, hi));

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
  { x: [1, 2, 3], y: [1, 3.5, 3] },
  { x: [1, 2, 3], y: [1, 2, 3] },     // perfect fit
  { x: [1, 2, 3], y: [2, 4, 2] },     // slope zero: R^2 = 0
  { x: [-1, 0.5, 4], y: [3, -2, 0.7] }
];
for (let k = 0; k < 40; k++) cases.push({ x: vec(3, -3, 5), y: vec(3, -3, 5) });
for (const n of [2, 5, 20, 50]) for (let k = 0; k < 6; k++) cases.push({ x: vec(n, 0, 10), y: vec(n, -3, 12) });

for (const { x, y } of cases) {
  for (const intercept of [true, false]) {
    const n = y.length, label = JSON.stringify({ n, intercept, x: x.slice(0, 3) });
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

    // 3. P and M are symmetric and idempotent, PM = 0, trace P = rank.
    const PP = M.matMul(f.P, f.P), MM = M.matMul(f.M, f.M), PM = M.matMul(f.P, f.M);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      close(f.P[i][j], f.P[j][i], 1e-12, 'P symmetric');
      close(f.M[i][j], f.M[j][i], 1e-12, 'M symmetric');
      close(PP[i][j], f.P[i][j], 1e-9, 'P idempotent');
      close(MM[i][j], f.M[i][j], 1e-9, 'M idempotent');
      close(PM[i][j], 0, 1e-9, 'PM = 0');
      checks += 5;
    }
    close(M.trace(f.P), f.rank, 1e-9, 'trace P');
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
    //    residuals sum to zero, the mean of the fitted values is ybar, ybar 1 = projection on 1.
    if (intercept) {
      assert.ok(f.onesIn, label);
      close(f.tss, f.ess + f.rss, 1e-9, 'TSS = ESS + RSS ' + label);
      close(f.r2, f.r2ess, 1e-9, 'R2 two ways ' + label);
      if (f.r2cor !== null) close(f.r2, f.r2cor, 1e-9, 'R2 = cor^2 ' + label);
      close(f.resid.reduce((s, e) => s + e, 0), 0, 1e-9, 'sum of residuals ' + label);
      close(M.mean(f.yhat), M.mean(y), 1e-9, 'mean of yhat ' + label);
      closeVec(f.ybar, M.project(y, M.basis([M.ones(n)])), 1e-9, 'ybar = projection on 1 ' + label);
      checks += 6;
    }

    // 7. The drawing frame: orthonormal, keeps every length and angle among 0, 1, x, y, yhat, ybar, eps, Xb;
    //    the column space is the (e1, e2) plane, eps_hat points along +e3, yhat along +e1.
    if (n >= 3) {
      const fr = M.frame(f), E = fr.e;
      assert.equal(E.length, 3, label);
      for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 3; b2++) close(M.dot(E[a], E[b2]), a === b2 ? 1 : 0, 1e-9, 'orthonormal ' + label);
      const b = f.cols.map(() => draw(-2, 2));
      const vs = [M.ones(n), x, y, f.yhat, f.ybar, f.resid, f.ebar, f.explained, M.fitted(f.cols, b)];
      for (const v of vs) close(M.norm(fr.to3(v)), M.norm(v), 1e-9, 'length kept ' + label);
      for (const v of vs) for (const w of vs) close(M.dot(fr.to3(v), fr.to3(w)), M.dot(v, w), 1e-8, 'angle kept ' + label);
      if (fr.planar) f.cols.forEach(c => close(fr.to3(c)[2], 0, 1e-9, 'columns in the plane ' + label));
      const r3 = fr.to3(f.resid);
      close(r3[0], 0, 1e-9); close(r3[1], 0, 1e-9); close(r3[2], M.norm(f.resid), 1e-9, 'eps along +e3 ' + label);
      const h3 = fr.to3(f.yhat);
      close(h3[0], M.norm(f.yhat), 1e-9, 'yhat along +e1 ' + label);
      checks += 9 + 2 * vs.length + vs.length * vs.length + 3;
    }
  }
}

// 8. Without an intercept the decomposition TSS = ESS + RSS fails in general.
{
  const f = M.fit([1, 2, 3], [1, 3.5, 3], false);
  assert.equal(f.onesIn, false);
  assert.ok(Math.abs(f.tss - (f.ess + f.rss)) > 0.1, 'no intercept: TSS != ESS + RSS');
  checks += 2;
}

// 9. Known numbers: beta_hat = (0.5, 1), RSS = 1.5, ESS = 2, TSS = 3.5.
{
  const f = M.fit([1, 2, 3], [1, 3.5, 3], true);
  closeVec(f.beta, [0.5, 1], 1e-12, 'known beta');
  close(f.rss, 1.5, 1e-12); close(f.ess, 2, 1e-12); close(f.tss, 3.5, 1e-12);
  checks += 4;
}

// 10. Collinear columns (x constant): beta_hat is not unique, but the projection is: y_hat = ybar 1.
{
  const y = [1, 3.5, 3, 2, 0.5], x = [2, 2, 2, 2, 2], f = M.fit(x, y, true);
  assert.equal(f.rank, 1);
  assert.equal(f.beta, null);
  closeVec(f.yhat, f.ybar, 1e-12, 'collinear: yhat = ybar');
  close(f.ess, 0, 1e-12);
  const yb = M.mean(y);
  for (const b1 of [-1, 0, 2.5]) close(M.rss(f.cols, y, [yb - 2 * b1, b1]), f.rss, 1e-9, 'collinear minimum');
  const fr = M.frame(f);
  assert.equal(fr.planar, false);
  for (const v of [y, f.yhat, f.resid, M.ones(5)]) close(M.norm(fr.to3(v)), M.norm(v), 1e-9, 'collinear frame');
  checks += 11;
}

// 11. Perfect fit: zero residual, and the frame still works.
{
  const x = [0, 1, 5, 2, 7, 3], y = x.map(v => 2 + v), f = M.fit(x, y, true);
  closeVec(f.beta, [2, 1], 1e-12); close(f.rss, 0, 1e-12); close(f.r2, 1, 1e-12);
  const fr = M.frame(f);
  close(M.norm(fr.to3(y)), M.norm(y), 1e-9, 'perfect fit frame');
  checks += 5;
}

// 12. Simulated data: reproducible, the first draws do not depend on n, sigma = 0 gives the exact line,
//     x in [0, 10), and the errors look standard normal on a large sample.
{
  const d1 = M.draws(7, 20), d2 = M.draws(7, 50), d3 = M.draws(8, 20);
  closeVec(d1.u, d2.u.slice(0, 20), 0, 'draws independent of n (u)');
  closeVec(d1.z, d2.z.slice(0, 20), 0, 'draws independent of n (z)');
  assert.notDeepEqual(d1.u, d3.u);
  const s0 = M.sample(d1, 1, 0.5, 0);
  s0.x.forEach((xi, i) => { assert.ok(xi >= 0 && xi < 10); close(s0.y[i], 1 + 0.5 * xi, 1e-12); });
  const s1 = M.sample(d1, 1, 0.5, 2);
  s1.y.forEach((yi, i) => close(yi, s0.y[i] + 2 * d1.z[i], 1e-12));
  const big = M.draws(3, 20000), mz = M.mean(big.z), vz = M.mean(big.z.map(z => (z - mz) ** 2));
  assert.ok(Math.abs(mz) < 0.03 && Math.abs(vz - 1) < 0.05, `normal draws: mean ${mz}, var ${vz}`);
  assert.ok(Math.abs(M.mean(big.u) - 0.5) < 0.01);
  checks += 2 + 1 + 40 + 20 + 2;
}

console.log(`All ${checks} model checks passed.`);
