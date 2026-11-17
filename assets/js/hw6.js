/* Homework 6: statistical independence of protocol type and traffic class (NSL-KDD).
   The (X, F) counts are expanded into records, the contingency table is rebuilt from them,
   then marginal/conditional frequencies, expected frequencies and the chi-square test are computed. */
const $ = id => document.getElementById(id);

/* ---------- data: counts of protocol x label, expanded into (X, F) records ---------- */
const X_LEVELS = ['tcp', 'udp', 'icmp'], F_LEVELS = ['normal', 'attack'];
const COUNTS = [[53600, 49089], [12434, 2559], [1309, 6982]];
const records = [];
COUNTS.forEach((row, i) => row.forEach((n, j) => { for (let k = 0; k < n; k++) records.push([X_LEVELS[i], F_LEVELS[j]]); }));

/* ---------- the method (shown on the page through Function.prototype.toString) ---------- */
function contingency(pairs, xs, fs) {
  const O = xs.map(() => fs.map(() => 0));
  for (const [x, f] of pairs) O[xs.indexOf(x)][fs.indexOf(f)]++;
  return O;
}
function marginals(O) {
  const row = O.map(r => r.reduce((a, b) => a + b, 0));
  const col = O[0].map((_, j) => O.reduce((s, r) => s + r[j], 0));
  return { row, col, n: row.reduce((a, b) => a + b, 0) };
}
function expected(O) {
  const { row, col, n } = marginals(O);
  return row.map(r => col.map(c => r * c / n));
}
function chiSquare(O) {
  const E = expected(O);
  let s = 0;
  O.forEach((r, i) => r.forEach((o, j) => s += (o - E[i][j]) ** 2 / E[i][j]));
  return s;
}

/* ---------- p-value: chi-square survival function ---------- */
function lgamma(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1; let x = 0.99999999999980993;
  for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
}
function lnGammaQ(a, x) {
  const lpre = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 1000; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return Math.log(1 - sum * Math.exp(lpre));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-16) break;
  }
  return lpre + Math.log(h);
}
/* natural log of the p-value: the p-value itself can be smaller than the smallest double */
const chi2LogSf = (x, k) => lnGammaQ(k / 2, x / 2);
function chi2Crit(alpha, k) {
  let lo = 0, hi = 500;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (chi2LogSf(m, k) > Math.log(alpha)) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/* ---------- rendering ---------- */
const sup = k => String(k).replace(/-/g, '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
const f0 = v => v.toLocaleString('en-US'), f2 = v => v.toFixed(2), f3 = v => v.toFixed(3);
function fp(lnp) {
  if (lnp >= Math.log(1e-3)) return Math.exp(lnp).toFixed(4);
  const l = lnp / Math.LN10, e = Math.floor(l), m = 10 ** (l - e);
  return m.toFixed(2) + '×10' + sup(e);
}
function table(id, head, rows, opts = {}) {
  $(id).innerHTML = `<thead><tr><th class="l">${head[0]}</th>${head.slice(1).map(h => `<th class="num">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${opts.tot && i >= rows.length - opts.tot ? 'tot' : ''}"><td class="l">${r[0]}</td>${r.slice(1).map(c => `<td class="num">${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

const O = contingency(records, X_LEVELS, F_LEVELS), M = marginals(O), n = M.n, E = expected(O);
const chi = chiSquare(O), df = (X_LEVELS.length - 1) * (F_LEVELS.length - 1), p = chi2LogSf(chi, df), crit = chi2Crit(0.05, df);
const contr = O.map((r, i) => r.map((o, j) => (o - E[i][j]) ** 2 / E[i][j]));

$('code').textContent = [contingency, marginals, expected, chiSquare].map(f => f.toString()).join('\n\n');

const H = ['X \\ F', ...F_LEVELS];
table('tObs', [...H, 'n<sub>i·</sub>'], [...X_LEVELS.map((x, i) => [x, ...O[i].map(f0), f0(M.row[i])]), ['n<sub>·j</sub>', ...M.col.map(f0), f0(n)]], { tot: 1 });
table('tJoint', [...H, 'f<sub>i·</sub>'], [...X_LEVELS.map((x, i) => [x, ...O[i].map(o => f3(o / n)), f3(M.row[i] / n)]), ['f<sub>·j</sub>', ...M.col.map(c => f3(c / n)), f3(1)]], { tot: 1 });
table('tCondF', [...H, 'sum'], [...X_LEVELS.map((x, i) => [x, ...O[i].map(o => f3(o / M.row[i])), f3(1)]), ['marginal f<sub>·j</sub>', ...M.col.map(c => f3(c / n)), f3(1)]], { tot: 1 });
table('tCondX', [...H, 'marginal f<sub>i·</sub>'], [...X_LEVELS.map((x, i) => [x, ...O[i].map((o, j) => f3(o / M.col[j])), f3(M.row[i] / n)]), ['sum', f3(1), f3(1), f3(1)]], { tot: 1 });
table('tExp', [...H, 'n<sub>i·</sub>'], [...X_LEVELS.map((x, i) => [x, ...E[i].map(f2), f0(M.row[i])]), ['n<sub>·j</sub>', ...M.col.map(f0), f0(n)]], { tot: 1 });
const mx = Math.max(...contr.flat());
$('tContr').innerHTML = `<thead><tr><th class="l">${H[0]}</th>${F_LEVELS.map(h => `<th class="num">${h}</th>`).join('')}<th class="num">row sum</th></tr></thead><tbody>${X_LEVELS.map((x, i) => `<tr><td class="l">${x}</td>${contr[i].map(c => `<td class="num ${c === mx ? 'hi' : ''}">${f2(c)}</td>`).join('')}<td class="num">${f2(contr[i][0] + contr[i][1])}</td></tr>`).join('')}<tr class="tot"><td class="l">χ²</td><td class="num">${f2(contr.reduce((s, r) => s + r[0], 0))}</td><td class="num">${f2(contr.reduce((s, r) => s + r[1], 0))}</td><td class="num">${f2(chi)}</td></tr></tbody>`;

const minE = Math.min(...E.flat());
$('kpi').innerHTML = [['χ²', f2(chi)], ['degrees of freedom', `(${X_LEVELS.length}−1)(${F_LEVELS.length}−1) = ${df}`], ['critical value, α = 0.05', f2(crit)], ['p-value', fp(p)]].map(([k, v]) => `<div class="tile"><div class="l">${k}</div><div class="v">${v}</div></div>`).join('');

/* ---------- summary tiles in the page header ---------- */
$('t-chi').textContent = f2(chi);
$('t-p').textContent = fp(p);
$('t-rate').textContent = X_LEVELS.map((x, i) => `${x} ${f3(O[i][1] / M.row[i])}`).join(' · ');
$('t-rate-n').textContent = `attack rate by protocol, against ${f3(M.col[1] / n)} overall`;

/* ---------- bar chart: P(attack | protocol) against the marginal P(attack) ---------- */
(function () {
  const W = 520, Hh = 250, ml = 40, mr = 12, mt = 14, mb = 34, pw = W - ml - mr, ph = Hh - mt - mb, Y = v => mt + ph * (1 - v), bw = pw / X_LEVELS.length * 0.55, marg = M.col[1] / n;
  let s = `<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Attack rate by protocol">`;
  [0, .25, .5, .75, 1].forEach(t => { s += `<line class="gr" x1="${ml}" x2="${W - mr}" y1="${Y(t)}" y2="${Y(t)}"/><text class="lbl" x="${ml - 6}" y="${Y(t) + 3.5}" text-anchor="end">${t.toFixed(2)}</text>`; });
  X_LEVELS.forEach((x, i) => {
    const v = O[i][1] / M.row[i], cx = ml + pw * (i + .5) / X_LEVELS.length;
    s += `<rect x="${cx - bw / 2}" y="${Y(v)}" width="${bw}" height="${Y(0) - Y(v)}" fill="var(--s1)" opacity=".85" data-tip="${x}: ${O[i][1].toLocaleString('en-US')} attacks out of ${M.row[i].toLocaleString('en-US')} (${f3(v)})"/><text x="${cx}" y="${Y(v) + 16}" text-anchor="middle" style="fill:var(--bg)">${f3(v)}</text><text class="lbl" x="${cx}" y="${Hh - mb + 16}" text-anchor="middle">${x}</text>`;
  });
  s += `<line class="ax" x1="${ml}" x2="${W - mr}" y1="${Y(0)}" y2="${Y(0)}"/><line x1="${ml}" x2="${W - mr}" y1="${Y(marg)}" y2="${Y(marg)}" stroke="var(--s2)" stroke-width="2" stroke-dasharray="5 4"/>`;
  $('chart').innerHTML = s + '</svg>';
})();

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

/* ---------- conclusions (numbers are taken from the computation above) ---------- */
(function () {
  const rate = i => O[i][1] / M.row[i], marg = M.col[1] / n, pc = v => (100 * v).toFixed(1) + '%';
  let bi = 0, bj = 0; contr.forEach((r, i) => r.forEach((c, j) => { if (c > contr[bi][bj]) { bi = i; bj = j; } }));
  $('concl').innerHTML = `
  <div class="callout"><p><b>Dependent.</b> χ² = ${f2(chi)} with ${df} degrees of freedom is far above the critical value ${f2(crit)}, and p = ${fp(p)}. The hypothesis of independence between protocol and traffic class is rejected at any usual significance level. All expected frequencies are at least ${f2(minE)}, so the chi-square approximation is valid.</p></div>
  <p>The conditional distributions differ from the marginal one (${pc(marg)} of all connections are attacks): ${X_LEVELS.map((x, i) => `${x} ${pc(rate(i))}`).join(', ')}. The largest contribution to χ² comes from the ${X_LEVELS[bi]} “${F_LEVELS[bj]}” cell, observed ${f0(O[bi][bj])} against ${f2(E[bi][bj])} expected under independence.</p>
  <p><b>Association is not causation.</b> The test shows that protocol and traffic class are statistically associated. It is symmetric in X and F, gives no direction, and with n = ${f0(n)} even a small departure from independence would give a tiny p-value, so p does not measure how strong the association is. It also does not mean that a protocol causes or defines an attack. The association comes from which attacks the dataset contains and how its traffic was generated, so it cannot be transferred to real networks, and a protocol alone would be a poor basis for deciding that a connection is malicious.</p>`;
})();
