// The small drawings on the start-page tiles: 64 x 64 SVG, one style for all of them.
// Axes: a faint L. Main curves: the text colour, 2 px. Secondary curves: thin and faint.
// The one object the page is about: the accent colour (class "a" for lines, "af" for fills; the CSS sets the
// colour, the inline colour is only a fallback if the stylesheet is missing). Used by tools/build-site.cjs.
// Draw in screen coordinates: x from 9 (left axis) to 59, y from 55 (bottom axis) up to 5.
const BRAND = '#1d5bd8';
const f = v => Math.round(v * 10) / 10;
const P = pts => 'M' + pts.map(p => `${f(p[0])} ${f(p[1])}`).join('L');
const fn = (g, a, b, n = 40) => Array.from({ length: n }, (_, i) => { const x = a + (b - a) * i / (n - 1); return [x, g(x)]; });
const inBox = pts => pts.filter(p => p[1] >= 5 && p[1] <= 55 && p[0] >= 9 && p[0] <= 59);

const AX = '<path d="M9 5V55H59" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"/>';
const L = (pts, w = 2, extra = '') => `<path d="${P(pts)}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
const S = (pts, extra = '') => L(pts, 1.3, 'opacity="0.45"' + (extra ? ' ' + extra : ''));
const A = (pts, w = 2.2, extra = '') => `<path class="a" d="${P(pts)}" fill="none" stroke="${BRAND}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra ? ' ' + extra : ''}/>`;
const F = (pts, op = 0.16) => `<path class="af" d="${P(pts)}Z" fill="${BRAND}" opacity="${op}"/>`;
const D = (x, y, acc = true, r = 2.8) => acc ? `<circle class="af" cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${BRAND}"/>` : `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="currentColor"/>`;
const DASH = 'stroke-dasharray="3 3"';
const svg = b => `<svg class="glyph" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${b}</svg>`;
const G = {};

const head = (from, to, acc = true) => {   // an arrowhead at "to" (as in Microvis)
  const dx = to[0] - from[0], dy = to[1] - from[1], n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, s = 4.2;
  const pts = [[to[0] - s * ux + s * 0.6 * uy, to[1] - s * uy - s * 0.6 * ux], to, [to[0] - s * ux - s * 0.6 * uy, to[1] - s * uy + s * 0.6 * ux]];
  return acc ? A(pts, 2) : L(pts, 1.6);
};

// Regression basics
{ // the plane of X seen at a slant, y above it, its projection y_hat in the plane (accent), the residual straight up
  const plane = [[4, 50], [38, 58], [60, 42], [26, 34]];
  const O = [14, 48], H = [47, 44], Y = [47, 12];
  G['ols-projection'] = svg(`<path d="${P(plane)}Z" fill="currentColor" opacity="0.07"/>` + S(plane.concat([plane[0]])) +
    L([O, Y]) + head(O, Y, false) + S([H, Y], DASH) + L([[47, 39.5], [42.6, 38.9], [42.6, 43.4]], 1.1, 'opacity="0.6"') +
    A([O, H]) + head(O, H) + D(O[0], O[1], false, 1.8));
}

module.exports = G;
module.exports.helpers = { AX, L, S, A, F, D, DASH, svg, fn, inBox };
