/* Homework 5: Riemann and Lebesgue integration, numerical computation of the normal CDF.
   Exercise 1: Riemann (midpoint) sums against Lebesgue sums with exact and sampled preimages, plus Dirichlet and Thomae.
   Exercise 2: trapezoid, Simpson, series, continued fraction, hybrid and A&S 26.2.17 against a 15-decimal reference. */
const $ = id => document.getElementById(id);

// tooltip (event delegation on [data-tip])
(function () {
  const tip = $('tip');
  document.addEventListener('pointermove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !t.getAttribute('data-tip')) { tip.style.display = 'none'; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.style.display = 'block';
    const w = tip.offsetWidth; let x = e.clientX + 14; if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  });
  document.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
})();

/* ================= chart primitives ================= */
let uid = 0;
const sup = k => String(k).replace(/-/g, '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]);
const fmt = v => { if (v === 0) return '0'; const a = Math.abs(v); if (a >= 1e4) return v.toLocaleString('en-US'); if (a >= 100) return String(Math.round(v)); return String(+v.toPrecision(3)); };
const decades = (lo, hi) => { const t = []; for (let k = Math.ceil(Math.log10(lo) - 1e-9); k <= Math.floor(Math.log10(hi) + 1e-9); k++) t.push(10 ** k); return t; };
const decFmt = v => { const k = Math.round(Math.log10(v)); return k === 0 ? '1' : '10' + sup(k); };
function niceTicks(lo, hi, n) {
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag, step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, t = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) t.push(+v.toPrecision(12));
  return t;
}
function chart(el, o) {
  const W = o.W || 520, H = o.H || 250, M = { l: o.ml || 46, r: 12, t: 10, b: o.xt ? 40 : 26 }, iw = W - M.l - M.r, ih = H - M.t - M.b, [x0, x1] = o.xr, [y0, y1] = o.yr, lg = Math.log10;
  const nx = v => o.xlog ? (lg(v) - lg(x0)) / (lg(x1) - lg(x0)) : (v - x0) / (x1 - x0), ny = v => o.ylog ? (lg(v) - lg(y0)) / (lg(y1) - lg(y0)) : (v - y0) / (y1 - y0);
  const X = v => M.l + iw * nx(v), Y = v => M.t + ih * (1 - ny(v)), id = 'c' + (++uid);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria}"><defs><clipPath id="${id}"><rect x="${M.l}" y="${M.t}" width="${iw}" height="${ih}"/></clipPath></defs>`;
  const yt = o.yticks || (o.ylog ? decades(y0, y1) : niceTicks(y0, y1, 4)), xt = o.xticks || (o.xlog ? decades(x0, x1) : niceTicks(x0, x1, 5));
  const yf = o.yfmt || (o.ylog ? decFmt : fmt), xf = o.xfmt || (o.xlog ? decFmt : fmt);
  yt.forEach(v => { const y = Y(v); s += `<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" class="gr"/><text class="lbl" x="${M.l - 6}" y="${y + 3.5}" text-anchor="end">${yf(v)}</text>`; });
  xt.forEach(v => { const x = X(v); s += `<line x1="${x}" x2="${x}" y1="${M.t + ih}" y2="${M.t + ih + 4}" class="ax"/><text class="lbl" x="${x}" y="${M.t + ih + 16}" text-anchor="middle">${xf(v)}</text>`; });
  s += `<line class="ax" x1="${M.l}" x2="${W - M.r}" y1="${M.t + ih}" y2="${M.t + ih}"/>`;
  if (o.xt) s += `<text x="${M.l + iw / 2}" y="${H - 4}" text-anchor="middle">${o.xt}</text>`;
  if (o.yt) s += `<text x="11" y="${M.t + ih / 2}" text-anchor="middle" transform="rotate(-90 11 ${M.t + ih / 2})">${o.yt}</text>`;
  s += `<g clip-path="url(#${id})">`; let tips = '';
  (o.series || []).forEach(se => {
    if (se.pts) {
      s += `<polyline points="${se.pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}" style="fill:none;stroke:${se.color};stroke-width:${se.w || 2};opacity:${se.op || 1};${se.dash ? 'stroke-dasharray:5 4;' : ''}stroke-linejoin:round"/>`;
      if (se.dots) se.pts.forEach(p => { tips += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.2" style="fill:${se.color};stroke:var(--panel);stroke-width:1.5"/><circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="8" fill="transparent" data-tip="${se.tip ? se.tip(p) : ''}"/>`; });
    }
  });
  s += `</g>${tips}</svg>`;
  if (o.legend) s += `<div class="legend">${o.legend.map(l => `<span><i class="ln${l.dash ? ' d' : ''}" style="border-color:${l.color}"></i>${l.name}</span>`).join('')}</div>`;
  el.innerHTML = s;
}

/* =============================== EXERCISE 1 =============================== */
const PI = Math.PI;
const FN = [
  { id: 'sin', lab: 'sin x, [0, π]', a: 0, b: PI, f: x => Math.sin(x), ex: 2, m: 0, M: 1, pieces: [{ a: 0, b: PI / 2, t: 'inc' }, { a: PI / 2, b: PI, t: 'dec' }] },
  { id: 'sq', lab: 'x², [0, 1]', a: 0, b: 1, f: x => x * x, ex: 1 / 3, m: 0, M: 1, pieces: [{ a: 0, b: 1, t: 'inc' }] },
  { id: 'st3', lab: '1 if x &lt; ½, 3 else, [0, 1]', a: 0, b: 1, f: x => x < 0.5 ? 1 : 3, ex: 2, m: 1, M: 3, pieces: [{ a: 0, b: .5, t: 'c', v: 1 }, { a: .5, b: 1, t: 'c', v: 3 }] },
  { id: 'abs', lab: '|x − ½|, [0, 1]', a: 0, b: 1, f: x => Math.abs(x - 0.5), ex: 0.25, m: 0, M: 0.5, pieces: [{ a: 0, b: .5, t: 'dec' }, { a: .5, b: 1, t: 'inc' }] },
  { id: 'inv', lab: '1/√x, (0, 1]', a: 0, b: 1, f: x => 1 / Math.sqrt(x), ex: 2, m: 1, M: null, pieces: [{ a: 0, b: 1, t: 'dec' }] },
  { id: 'st1', lab: '1 if x &lt; ½, 0 else, [0, 1]', a: 0, b: 1, f: x => x < 0.5 ? 1 : 0, ex: 0.5, m: 0, M: 1, pieces: [{ a: 0, b: .5, t: 'c', v: 1 }, { a: .5, b: 1, t: 'c', v: 0 }] },
  { id: 'sinc', lab: 'sin x / x, [0, π]', a: 0, b: PI, f: x => x === 0 ? 1 : Math.sin(x) / x, ex: 1.8519370519824662, m: 0, M: 1, pieces: [{ a: 0, b: PI, t: 'dec' }] },
];
const NS = [3, 7, 15, 31, 63, 127, 255, 511, 1023];
const topOf = (F, n) => F.M !== null ? F.M : Math.sqrt(n);

/* compensated (Neumaier) summation keeps rounding out of the error for large n */
function riemann(F, n) {
  const h = (F.b - F.a) / n; let s = 0, c = 0;
  for (let i = 0; i < n; i++) { const v = F.f(F.a + (i + .5) * h), u = s + v; c += Math.abs(s) >= Math.abs(v) ? (s - u) + v : (v - u) + s; s = u; }
  return (s + c) * h;
}
/* mu{f < t} by bisection on the monotone pieces; cnt counts evaluations of f */
function distG(F, t, cnt) {
  let g = 0;
  for (const p of F.pieces) {
    if (p.t === 'c') { if (p.v < t) g += p.b - p.a; continue; }
    let lo = p.a, hi = p.b;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi), v = mid === 0 ? Infinity : F.f(mid); cnt.n++;
      if (p.t === 'inc') { if (v < t) lo = mid; else hi = mid; } else { if (v < t) hi = mid; else lo = mid; }
    }
    const x = 0.5 * (lo + hi); g += (p.t === 'inc') ? x - p.a : p.b - x;
  }
  return g;
}
function lebExact(F, n) {
  const cnt = { n: F.pieces.filter(p => p.t === 'c').length }, T = topOf(F, n), h = (T - F.m) / n, D = F.b - F.a;
  let s = 0, prev = 0;
  for (let j = 0; j < n; j++) { const g = distG(F, F.m + (j + 1) * h, cnt); s += (F.m + j * h) * (g - prev); prev = g; }
  s += T * (D - prev);
  return { v: s, evals: cnt.n };
}
function lebGrid(F, n) {
  const N = n * n, T = topOf(F, n), h = (T - F.m) / n, w = (F.b - F.a) / N, c = new Float64Array(n + 1);
  for (let i = 0; i < N; i++) { const y = F.f(F.a + (i + .5) * w); let j = y >= T ? n : Math.floor((y - F.m) / h); if (j < 0) j = 0; if (j > n) j = n; c[j]++; }
  let s = 0; for (let j = 0; j <= n; j++) s += (j === n ? T : F.m + j * h) * c[j] * w;
  return { v: s, evals: N };
}

const E1 = {};
function runEx1() {
  FN.forEach(F => {
    E1[F.id] = NS.map(n => {
      const R = riemann(F, n), LE = lebExact(F, n), LG = lebGrid(F, n);
      return { n, R: R - F.ex, LE: LE.v - F.ex, LG: LG.v - F.ex, vR: R, vLE: LE.v, vLG: LG.v, eR: n, eLE: LE.evals, eLG: LG.evals };
    });
  });
}
const sgn = e => Math.abs(e) < 1e-13 ? '0' : (e > 0 ? '+' : '−') + Math.abs(e).toExponential(1);
function renderTable1() {
  const k = NS.indexOf(+$('n1Sel').value);
  $('tb1').innerHTML = FN.map(F => {
    const r = E1[F.id][k];
    const c = (v, e) => `<td class="num">${v.toFixed(6)} <small>(${sgn(e)})</small></td>`;
    return `<tr><td class="l">${F.lab}</td><td class="num">${F.ex.toFixed(6)}</td>${c(r.vR, r.R)}${c(r.vLE, r.LE)}${c(r.vLG, r.LG)}</tr>`;
  }).join('');
}
const order = (arr, key) => { const a = arr.slice(-2).map(r => Math.abs(r[key])); if (a[1] < 1e-13) return null; return Math.log(a[0] / a[1]) / Math.log(NS[NS.length - 1] / NS[NS.length - 2]); };
const reach = (arr, key, ev) => { for (const r of arr) if (Math.abs(r[key]) <= 1e-3) return r[ev]; return null; };
const nf = v => v === null ? '–' : v.toLocaleString('en-US');
function renderTable2() {
  $('tb2').innerHTML = FN.map(F => {
    const a = E1[F.id];
    const o = k => { const p = order(a, k); return `<td class="num">${p === null ? 'exact' : p.toFixed(2)}</td>`; };
    return `<tr><td class="l">${F.lab}</td>${o('R')}<td class="num">${nf(reach(a, 'R', 'eR'))}</td>${o('LE')}<td class="num">${nf(reach(a, 'LE', 'eLE'))}</td>${o('LG')}<td class="num">${nf(reach(a, 'LG', 'eLG'))}</td></tr>`;
  }).join('');
}
let curF = 'sin';
/* chart data: chart 1 uses n = 2^k - 1 up to 1023; chart 2 uses, for each method, the values of n whose cost is at most 1000 evaluations */
const BUDGET = 1000, CV = {};
const nPieces = F => F.pieces.filter(p => p.t !== 'c').length;
function curves(F) {
  if (CV[F.id]) return CV[F.id];
  const ex = F.ex, ev = (fn, ns) => ns.map(n => { const r = fn(F, n); return { n, e: r.v - ex, ev: r.evals }; });
  const lad = NS;                                            /* 3, 7, ..., 1023 */
  const c1 = { R: lad.map(n => ({ n, e: riemann(F, n) - ex, ev: n })), LE: ev(lebExact, lad), LG: ev(lebGrid, lad) };
  const nR = [3, 5, 7, 9, 13, 19, 27, 39, 55, 79, 113, 161, 229, 327, 467, 667, 953];
  const per = Math.max(1, 60 * nPieces(F)), nE = []; for (let n = 1; F.pieces.filter(p => p.t === 'c').length + per * n <= BUDGET; n++) nE.push(n);
  const nG = [3, 5, 7, 9, 11, 13, 15, 19, 23, 27, 31];   /* odd n, as for the Riemann sums */
  const c2 = { R: nR.map(n => ({ n, e: riemann(F, n) - ex, ev: n })), LE: ev(lebExact, nE), LG: ev(lebGrid, nG) };
  return CV[F.id] = { c1, c2 };
}
function renderCharts1() {
  const F = FN.find(f => f.id === curF), { c1, c2 } = curves(F), FL = 2e-17, y = e => Math.max(Math.abs(e), FL);
  const yt = [FL, 1e-15, 1e-12, 1e-9, 1e-6, 1e-3, 1], yf = v => v < 1e-16 ? '0' : decFmt(v);
  const msg = (nm, r) => `${nm}, n = ${r.n.toLocaleString('en-US')}: error ${Math.abs(r.e) < 1e-13 ? '0' : Math.abs(r.e).toExponential(2)}, ${r.ev.toLocaleString('en-US')} evaluations`;
  const mk = (arr, xf, color, nm) => ({ pts: arr.map(r => [xf(r), y(r.e), msg(nm, r)]), color, w: 2, dots: true, tip: p => p[2] });
  const leg = [{ name: 'Riemann', color: 'var(--s1)' }, { name: 'Lebesgue, exact μ', color: 'var(--s2)' }, { name: 'Lebesgue, sampled μ', color: 'var(--s3)' }];
  chart($('ch1'), { xlog: true, xr: [2, 1500], xticks: [3, 10, 100, 1000], xfmt: fmt, yr: [1e-17, 10], ylog: true, yticks: yt, yfmt: yf, xt: 'n (cells or levels)', yt: 'absolute error', ml: 50, aria: 'Absolute error against n',
    series: [mk(c1.R, r => r.n, 'var(--s1)', 'Riemann'), mk(c1.LE, r => r.n, 'var(--s2)', 'Lebesgue exact'), mk(c1.LG, r => r.n, 'var(--s3)', 'Lebesgue sampled')], legend: leg });
  /* exact method with constant cost: a single point at its cost, extended by a horizontal line */
  const exact = c2.LE.every(r => Math.abs(r.e) < 1e-13) && c2.LE.every(r => r.ev === c2.LE[0].ev);
  const s2 = [mk(c2.R, r => r.ev, 'var(--s1)', 'Riemann')];
  if (exact) {
    const e0 = c2.LE[0];
    s2.push({ pts: [[e0.ev, FL], [BUDGET, FL]], color: 'var(--s2)', w: 2, dash: true });
    s2.push({ pts: [[e0.ev, FL, `Lebesgue exact: error 0 for every n, ${e0.ev} evaluations`]], color: 'var(--s2)', w: 2, dots: true, tip: p => p[2] });
  } else s2.push(mk(c2.LE, r => r.ev, 'var(--s2)', 'Lebesgue exact'));
  s2.push(mk(c2.LG, r => r.ev, 'var(--s3)', 'Lebesgue sampled'));
  chart($('ch2'), { xlog: true, xr: [1, BUDGET * 1.5], xticks: [1, 10, 100, 1000], xfmt: fmt, yr: [1e-17, 10], ylog: true, yticks: yt, yfmt: yf, xt: 'evaluations of f', yt: 'absolute error', ml: 50, aria: 'Absolute error against evaluations', series: s2, legend: leg });
  $('ch2c').textContent = exact
    ? `Errors against the number of evaluations of f, up to 10³. Lebesgue with exact μ is exact for every n at a constant cost of ${c2.LE[0].ev} evaluations (dashed line).`
    : 'Errors against the number of evaluations of f, up to 10³ (Riemann n, exact μ about 60 per level and monotone piece, sampled μ n²).';
}

/* --- pathological functions --- */
const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
function thomae(n) {
  let rs = 0; for (let i = 1; i <= n; i++) rs += gcd(i, n); rs /= n * n;
  let up = 0;
  for (let i = 0; i < n; i++) { let q = 1; for (; ; q++) { if (Math.floor((i * q + n - 1) / n) <= Math.floor(((i + 1) * q) / n)) break; } up += 1 / q; }
  return { rs, up: up / n };
}
const TH = {};
function renderTable3() {
  let h = `<tr><td class="l">Dirichlet</td><td class="num">any</td><td class="num">1</td><td class="num">0</td><td class="num">0</td><td class="num">1</td><td class="num"><b>0</b></td></tr>`;
  [10, 100, 1000, 10000].forEach((n, i) => {
    const t = TH[n] || (TH[n] = thomae(n));
    h += `<tr><td class="l">${i ? '' : 'Thomae'}</td><td class="num">${n.toLocaleString('en-US')}</td><td class="num">${t.rs.toPrecision(3)}</td><td class="num">0</td><td class="num">0</td><td class="num">${t.up.toPrecision(3)}</td><td class="num"><b>0</b></td></tr>`;
  });
  $('tb3').innerHTML = h;
}
function renderConcl1() {
  const g = (id, k) => order(E1[id], k), o = (id, k) => { const p = g(id, k); return p === null ? 'exact' : p.toFixed(1); };
  const t = TH[10000];
  $('concl1').innerHTML = `
  <p><b>Same limit.</b> For every Riemann-integrable function both sums converge to the same value (table of values). For bounded f the Lebesgue sum is the integral of a simple function φ<sub>n</sub> ≤ f with f − φ<sub>n</sub> ≤ h, so L<sub>n</sub> → ∫ f from below. For 1/√x, which is only improperly Riemann-integrable, both sums still approach 2, because f ≥ 0.</p>
  <p><b>Accuracy and convergence.</b> On smooth functions the midpoint rule is second order (p = ${o('sin', 'R')} for sin x, ${o('sq', 'R')} for x²) while the Lebesgue lower sum is first order (p = ${o('sin', 'LE')}, ${o('sq', 'LE')}), as the bound h(b − a) predicts. The kink of |x − ½| does not change this. A jump reverses the picture: the cell containing the jump is evaluated at one point, so the Riemann error is first order (p = ${o('st3', 'R')}), while the Lebesgue sum with exact preimages is exact, because the range has only two values. For 1/√x both methods converge slowly, with p = ${o('inv', 'R')} and ${o('inv', 'LE')}.</p>
  <p><b>Efficiency.</b> Per evaluation of f the Riemann rule wins on smooth functions: the target 10⁻³ costs ${nf(reach(E1.sin, 'R', 'eR'))} evaluations for sin x, against more than 10⁵ for the Lebesgue sums (not reached with n ≤ 1023). The cost is in the preimages: bisection spends about 60 evaluations per level and piece, and counting samples needs n² points. The Lebesgue approach pays off when the range is simple, as for the two step functions, where it needs a handful of evaluations and no error.</p>
  <p><b>Pathological functions.</b> Dirichlet is not Riemann-integrable: every cell contains rationals and irrationals, so the upper sum is 1 and the lower sum 0 for every n, and the Riemann sum takes either value according to the tags. Its range is {0, 1} and E<sub>1</sub> = ℚ ∩ [0, 1] is countable, so μ(E<sub>1</sub>) = 0 and the Lebesgue integral is 0. Thomae is continuous at every irrational and discontinuous only on ℚ, a null set, so it is Riemann-integrable (Lebesgue criterion) with integral 0. The Riemann sums and the upper sums tend to 0, the latter slowly (${t.up.toPrecision(2)} at n = 10,000), while every Lebesgue sum is exactly 0 because each set {f ≥ 1/k} is finite.</p>`;
}

/* =============================== EXERCISE 2 =============================== */
const SQ2PI = Math.sqrt(2 * Math.PI), phi = x => Math.exp(-.5 * x * x) / SQ2PI;
const REF = [[0.5, 0.382924922548026], [1, 0.682689492137086], [1.5, 0.866385597462284], [2, 0.954499736103642], [3, 0.997300203936740], [4, 0.999936657516334], [5, 0.999999426696856], [6, 0.999999998026825], [7, 0.999999999997440]];
const TAIL = [[5, 1744278], [6, 506797346], [6.5, 12450197393], [7, 390682215445]];
const REFP = Object.fromEntries(REF);
/* every function returns the central probability P(|Z| <= x) */
function trap(x, n) { const h = x / n; let s = .5 * (phi(0) + phi(x)); for (let i = 1; i < n; i++) s += phi(i * h); return 2 * s * h; }
function simp(x, n) { const h = x / n; let s = phi(0) + phi(x); for (let i = 1; i < n; i++) s += phi(i * h) * (i % 2 ? 4 : 2); return 2 * s * h / 3; }
function altSeries(x) { let a = x, s = x, k = 0; while (k < 1000) { k++; a *= -x * x / (2 * k); const t = a / (2 * k + 1); s += t; if (Math.abs(t) < 1e-18 && k > x * x) break; } return { v: 2 * s / SQ2PI, k: k + 1 }; }
function posSeries(x) { let t = x, s = x, k = 0; while (t > 1e-17 * s) { k++; t *= x * x / (2 * k + 1); s += t; } return { v: 2 * phi(x) * s, k: k + 1 }; }
const cfK = x => Math.ceil(160 / x);
function cfTail(x) { let f = 0; for (let k = cfK(x); k >= 1; k--) f = k / (x + f); return phi(x) / (x + f); }
const hybridP = x => x < 3 ? posSeries(x).v : 1 - 2 * cfTail(x);
function asTail(x) { const t = 1 / (1 + 0.2316419 * x); return phi(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); }
const asP = x => 1 - 2 * asTail(x);

function renderTable4() {
  const n = +$('n2Sel').value, E = (v, r) => { const e = Math.abs(v - r); return `<td class="num ${e <= 1.2e-15 ? 'good' : ''}">${e === 0 ? '0' : e.toExponential(1)}</td>`; };
  $('tb4').innerHTML = REF.map(([x, r]) => `<tr><td class="num">${x}</td><td class="num">${r.toFixed(15)}</td>${E(trap(x, n), r)}${E(simp(x, n), r)}${E(altSeries(x).v, r)}${E(posSeries(x).v, r)}${E(hybridP(x), r)}${E(asP(x), r)}</tr>`).join('');
}
function renderTable5() {
  $('tb5').innerHTML = TAIL.map(([x, N]) => {
    const direct = 1 / (2 * cfTail(x)), naive = 1 / (2 * (1 - (1 - cfTail(x)))), re = Math.abs(naive / direct - 1);
    return `<tr><td class="num">${x}</td><td class="num">${N.toLocaleString('en-US')}</td><td class="num">${Math.round(direct).toLocaleString('en-US')}</td><td class="num">${Math.round(naive).toLocaleString('en-US')}</td><td class="num">${re.toExponential(1)}</td></tr>`;
  }).join('');
}
let curX = 2;
function renderChart3() {
  const ns = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024], r = REFP[curX], FL = 1e-16, y = e => Math.max(Math.abs(e), FL);
  const T = ns.map(n => [n, y(trap(curX, n) - r)]), S = ns.map(n => [n, y(simp(curX, n) - r)]);
  const g2 = ns.map(n => [n, T[0][1] * (ns[0] / n) ** 2]), g4 = ns.map(n => [n, S[0][1] * (ns[0] / n) ** 4]);
  chart($('ch3'), { xlog: true, xr: [2, 1024], xticks: [2, 10, 100, 1000], xfmt: fmt, yr: [1e-16, 1], ylog: true, yticks: [1e-15, 1e-12, 1e-9, 1e-6, 1e-3, 1], xt: 'panels n', yt: 'absolute error', ml: 50, aria: 'Quadrature error against n',
    series: [{ pts: g2, color: 'var(--muted)', w: 1.2, dash: true }, { pts: g4, color: 'var(--muted)', w: 1.2, dash: true },
      { pts: T, color: 'var(--s1)', w: 2, dots: true, tip: p => `trapezoid, n = ${p[0]}: error ${p[1].toExponential(2)}` },
      { pts: S, color: 'var(--s2)', w: 2, dots: true, tip: p => `Simpson, n = ${p[0]}: error ${p[1].toExponential(2)}` }],
    legend: [{ name: 'trapezoid', color: 'var(--s1)' }, { name: 'Simpson', color: 'var(--s2)' }, { name: 'slopes −2 and −4', color: 'var(--muted)', dash: true }] });
  $('ch3c').textContent = `Error in P(|Z| ≤ ${curX}) against the number of panels (log-log). Below 10⁻¹⁵ the error is at the resolution of the reference.`;
}
function bench(fn) {
  let calls = 0, t0 = performance.now(), s = 0; const xs = [0.3, 1.1, 1.9, 2.6, 3.4, 4.2, 5.1, 6.0];
  do { for (let i = 0; i < 200; i++) s += fn(xs[i & 7]); calls += 200; } while (performance.now() - t0 < 30);
  return (performance.now() - t0) / calls * 1e6 + s * 0;
}
function renderTable6() {
  const n = +$('n2Sel').value;
  const rows = [
    ['trapezoid', `${n + 1} evaluations of φ`, x => trap(x, n)],
    ['Simpson', `${n + 1} evaluations of φ`, x => simp(x, n)],
    ['alternating series', `${altSeries(3).k} terms`, x => altSeries(x).v],
    ['positive series', `${posSeries(3).k} terms`, x => posSeries(x).v],
    ['hybrid (series + fraction)', `${posSeries(3).k} terms below 3, ${cfK(3)} levels from 3`, hybridP],
    ['A&amp;S 26.2.17', '1 exp, degree-5 polynomial', asP]];
  $('tb6').innerHTML = rows.map(([m, w, f]) => `<tr><td class="l">${m}</td><td class="l">${w}</td><td class="num">${Math.round(bench(f)).toLocaleString('en-US')}</td></tr>`).join('');
}
function renderConcl2() {
  const mx = f => Math.max(...REF.map(([x, r]) => Math.abs(f(x) - r)));
  $('concl2').innerHTML = `
  <p><b>Accuracy.</b> The hybrid agrees with the reference to ${mx(hybridP).toExponential(1)} over all nine points, which is the resolution of the 15-decimal table. The positive series alone does equally well up to x = 7 (${mx(x => posSeries(x).v).toExponential(1)}), at the cost of more terms. The alternating series, the one in the Hogg–McKean–Craig notes, is correct for small x but degrades with x because its terms grow to about e<sup>x²/2</sup> before shrinking (${Math.abs(altSeries(7).v - REFP[7]).toExponential(1)} at x = 7). The A&amp;S polynomial stays below ${mx(asP).toExponential(1)}, twice its 7.5·10⁻⁸ bound on the tail because P = 1 − 2Q. Simpson is far more accurate than the trapezoid rule for the same n, as the slopes −4 and −2 in the chart show, but neither is competitive per evaluation.</p>
  <p><b>Tails.</b> Computing 1 − Φ(x) subtracts two nearly equal numbers. At x = 7 the naive result has a relative error of ${(() => { const c = cfTail(7); return Math.abs(1 / (2 * (1 - (1 - c))) / (1 / (2 * c)) - 1).toExponential(0); })()}, while the continued fraction reproduces the reference N. Computing the tail directly is what erfc provides.</p>
  <p><b>Efficiency.</b> The quadrature rules need n + 1 exponentials, and n must grow as the accuracy requirement tightens. The hybrid needs one exponential and at most about fifty multiply-adds or divisions, whatever the accuracy. The A&amp;S formula is the cheapest but cannot go below about 10⁻⁸.</p>
  <p><b>Method.</b> Use Φ(x) = ½[1 + erf(x/√2)] with erf and erfc evaluated by the hybrid: positive series for |x| &lt; 3 and the continued fraction beyond, with symmetry for negative x. The impossibility of an elementary antiderivative (Liouville) is why such an evaluation must be built from series, fractions or approximations, even though erf gives Φ an exact name.</p>`;
}

/* ================= summary tiles ================= */
function renderTiles() {
  const p = order(E1.sin, 'R'), p2 = order(E1.sin, 'LE');
  $('t-ord').textContent = `${p.toFixed(2)} vs ${p2.toFixed(2)}`;
  const st = E1.st3[E1.st3.length - 1];
  $('t-step').textContent = `${Math.abs(st.LE) < 1e-13 ? '0' : Math.abs(st.LE).toExponential(1)} vs ${Math.abs(st.R).toExponential(1)}`;
  $('t-hyb').textContent = Math.max(...REF.map(([x, r]) => Math.abs(hybridP(x) - r))).toExponential(1);
  const c = cfTail(7);
  $('t-tail').textContent = Math.abs(1 / (2 * (1 - (1 - c))) / (1 / (2 * c)) - 1).toExponential(0);
}

/* =============================== wiring =============================== */
$('n1Sel').innerHTML = NS.map(n => `<option${n === 255 ? ' selected' : ''}>${n}</option>`).join('');
$('fTabs').innerHTML = FN.map(F => `<button type="button" data-id="${F.id}" aria-pressed="${F.id === curF}">${F.lab}</button>`).join('');
$('xTabs').innerHTML = [1, 2, 3].map(x => `<button type="button" data-x="${x}" aria-pressed="${x === curX}">x = ${x}</button>`).join('');
$('n1Sel').onchange = renderTable1;
$('fTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; curF = b.dataset.id; [...$('fTabs').children].forEach(x => x.setAttribute('aria-pressed', x === b)); renderCharts1(); });
$('xTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; curX = +b.dataset.x; [...$('xTabs').children].forEach(x => x.setAttribute('aria-pressed', x === b)); renderChart3(); });
$('n2Sel').onchange = () => { renderTable4(); renderTable6(); renderConcl2(); };

renderTable4(); renderTable5(); renderChart3();
setTimeout(() => {
  runEx1(); $('st1').textContent = '';
  renderTable1(); renderTable2(); renderCharts1(); renderTable3(); renderConcl1();
  renderTable6(); renderConcl2(); renderTiles();
}, 20);
