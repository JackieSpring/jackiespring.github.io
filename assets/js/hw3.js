/* Homework 3: aggregate penetration score of n systems under m attackers.
   Law of large numbers and central limit theorem, Bernoulli and Rademacher increments. */
const CH = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000];
const K = CH.length, NT = 1000, TR = 25, NSEL = [10, 100, 1000, 10000], CLT_N = [3, 10, 100, 1000];
const EPS = [0.05, 0.1, 0.2];
const KS_COL = { 100: 'var(--s5)', 1000: 'var(--s4)', 10000: 'var(--s1)' };
const $ = id => document.getElementById(id);
const st = { model: 'bern', p: 0.3, m: 10000, seed: 2026, nsel: 1000, eps: 0.1, data: {}, cache: {} };

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

/* ================= random numbers ================= */
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return t >>> 0;
  };
}
function rng(seed) {
  let s = seed | 0;
  const sm = () => { s = (s + 0x9E3779B9) | 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
  const r = sfc32(sm(), sm(), sm(), sm());
  for (let i = 0; i < 20; i++) r();
  return r;
}
function params(md, p) {
  return md === 'bern'
    ? { mu: p, sig: Math.sqrt(p * (1 - p)), d: 1, rho: p * (1 - p) * ((1 - p) ** 2 + p ** 2), name: 'Bernoulli' }
    : { mu: 0, sig: 1, d: 2, rho: 1, name: 'Rademacher' };
}

/* ================= simulation ================= */
async function simulate(md, p, m, seed, onProg) {
  const rnd = rng(seed * 2 + (md === 'bern' ? 1 : 0)), S = new Int32Array(m * K), thr = p * 4294967296;
  for (let a = 0; a < m; a++) {
    let s = 0, t = 0, w = 0, b = 0;
    for (let ci = 0; ci < K; ci++) {
      const end = CH[ci];
      if (md === 'bern') { for (; t < end; t++) { if (rnd() < thr) s++; } }
      else { for (; t < end; t++) { if (b === 0) { w = rnd(); b = 32; } s += (w & 1) * 2 - 1; w >>>= 1; b--; } }
      S[a * K + ci] = s;
    }
    if ((a & 255) === 255) { onProg && onProg(a / m); await new Promise(r => setTimeout(r, 0)); }
  }
  return S;
}
function trajectories(md, p, seed) {
  const rnd = rng(seed * 7 + (md === 'bern' ? 3 : 5)), thr = p * 4294967296, out = [];
  for (let a = 0; a < TR; a++) {
    const path = new Float32Array(NT); let s = 0;
    for (let t = 0; t < NT; t++) { s += md === 'bern' ? (rnd() < thr ? 1 : 0) : ((rnd() & 1) * 2 - 1); path[t] = s; }
    out.push(path);
  }
  return out;
}

/* ================= statistics ================= */
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
function ksStat(z) {
  z.sort(); const N = z.length; let D = 0;
  for (let i = 0; i < N; i++) { const F = Phi(z[i]); D = Math.max(D, (i + 1) / N - F, F - i / N); }
  return D;
}
function stats(md) {
  if (st.cache[md]) return st.cache[md];
  const D = st.data[md], { mu, sig } = D.par, m = D.m, S = D.S;
  const subs = [100, 1000, 10000].filter(x => x <= m);
  const o = { mean: [], vr: [], tail: EPS.map(() => []), ks: subs.map(() => []), subs };
  for (let ci = 0; ci < K; ci++) {
    const n = CH[ci]; let s1 = 0, s2 = 0; const tc = EPS.map(() => 0);
    for (let a = 0; a < m; a++) {
      const v = S[a * K + ci]; s1 += v; s2 += v * v;
      const dev = Math.abs(v / n - mu);
      for (let e = 0; e < EPS.length; e++) if (dev > EPS[e] + 1e-12) tc[e]++;
    }
    const mean = s1 / m; o.mean.push(mean); o.vr.push(s2 / m - mean * mean);
    tc.forEach((c, e) => o.tail[e].push(c / m));
    subs.forEach((mm, j) => {
      const z = new Float64Array(mm);
      for (let a = 0; a < mm; a++) z[a] = (S[a * K + ci] - n * mu) / (sig * Math.sqrt(n));
      o.ks[j].push(ksStat(z));
    });
  }
  return st.cache[md] = o;
}

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
    if (se.band) s += `<polygon points="${se.band.map(p => X(p[0]) + ',' + Y(p[2])).join(' ')} ${se.band.slice().reverse().map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" style="fill:${se.color};opacity:${se.op || .2};stroke:none"/>`;
    if (se.bars) se.bars.forEach(b => { const xa = X(b[0]), xb = X(b[1]), y = Y(b[2]); s += `<rect x="${xa + 0.4}" y="${y}" width="${Math.max(xb - xa - 0.8, 0.5)}" height="${Math.max(M.t + ih - y, 0)}" style="fill:${se.color};opacity:.7" data-tip="${se.tip ? se.tip(b) : ''}"/>`; });
    if (se.pts) {
      s += `<polyline points="${se.pts.map(p => X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join(' ')}" style="fill:none;stroke:${se.color};stroke-width:${se.w || 2};opacity:${se.op || 1};${se.dash ? 'stroke-dasharray:5 4;' : ''}stroke-linejoin:round"/>`;
      if (se.dots) se.pts.forEach(p => { tips += `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.2" style="fill:${se.color};stroke:var(--panel);stroke-width:1.5"/><circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="8" fill="transparent" data-tip="${se.tip ? se.tip(p) : ''}"/>`; });
    }
  });
  s += `</g>${tips}</svg>`;
  if (o.legend) s += `<div class="legend">${o.legend.map(l => `<span><i class="ln${l.dash ? ' d' : ''}" style="border-color:${l.color}"></i>${l.name}</span>`).join('')}</div>`;
  el.innerHTML = s;
}

/* histogram on lattice-aware bins */
function hist(md, ci, tf, c) {
  const D = st.data[md], { mu, sig, d } = D.par, n = CH[ci], m = D.m, S = D.S, sd = sig * Math.sqrt(n), k = Math.max(1, Math.round(0.3 * sd / d)), bw = k * d, base = (d === 2 ? (n % 2) : 0) - d / 2, cnt = new Map();
  for (let a = 0; a < m; a++) { const j = Math.floor((S[a * K + ci] - base) / bw); cnt.set(j, (cnt.get(j) || 0) + 1); }
  return [...cnt].map(([j, q]) => [(base + j * bw - c) * tf, (base + (j + 1) * bw - c) * tf, q / (m * bw * tf)]);
}
function histPanel(el, md, ci, tf, c, mean, sd, xt, aria) {
  const bars = hist(md, ci, tf, c), xr = [mean - 4 * sd, mean + 4 * sd], pk = Math.max(...bars.map(b => b[2]), 1 / (sd * 2.5066)), pts = [];
  for (let i = 0; i <= 160; i++) { const x = xr[0] + (xr[1] - xr[0]) * i / 160; pts.push([x, Math.exp(-((x - mean) ** 2) / (2 * sd * sd)) / (sd * 2.5066)]); }
  chart(el, { W: 340, H: 210, ml: 40, xr, yr: [0, pk * 1.12], xt, aria, series: [{ bars, color: 'var(--s1)', tip: b => `${fmt(b[0])} to ${fmt(b[1])}: density ${b[2].toPrecision(3)}` }, { pts, color: 'var(--s2)', w: 1.8 }] });
}

/* ================= sections ================= */
function renderTraj() {
  const D = st.data[st.model], { mu, sig } = D.par, T = D.traj, ks = [...Array(NT).keys()].map(i => i + 1);
  $('trajTxt').textContent = st.model === 'bern'
    ? `Each line is one attacker. S_k counts the systems penetrated after k steps (p = ${st.p.toFixed(2)}): the lines fan out around kp. The running fraction S_k/k settles near p.`
    : 'Each line is one attacker with zero-drift steps. S_k wanders without trend and spreads like √k; the running average S_k/k closes in on 0.';
  let lo = 0, hi = 0; T.forEach(p => { for (let i = 0; i < NT; i++) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); } });
  const b1 = ks.map(k => [k, mu * k - 2 * sig * Math.sqrt(k), mu * k + 2 * sig * Math.sqrt(k)]);
  const pad = (hi - lo) * 0.06;
  const lines = f => T.map((p, i) => ({ pts: ks.map(k => [k, f(p[k - 1], k)]), color: i ? 'var(--s1)' : 'var(--ink)', w: i ? 1.1 : 2, op: i ? .45 : 1 }));
  const xr = [1, NT], xticks = [1, 200, 400, 600, 800, 1000];
  chart($('tr1'), { xr, xticks, yr: [Math.min(lo, ...b1.map(b => b[1])) - pad, Math.max(hi, ...b1.map(b => b[2])) + pad], xt: 'systems attacked k', yt: 'total score S_k', aria: 'Trajectories of the total score',
    series: [{ band: b1, color: 'var(--rule2)', op: .3 }, { pts: [[1, mu], [NT, mu * NT]], color: 'var(--s2)', w: 1.6, dash: true }, ...lines(s => s)], legend: [{ name: 'attacker trajectories', color: 'var(--s1)' }, { name: 'kμ', color: 'var(--s2)', dash: true }] });
  const b2 = ks.map(k => [k, mu - 2 * sig / Math.sqrt(k), mu + 2 * sig / Math.sqrt(k)]);
  chart($('tr2'), { xr, xticks, yr: st.model === 'bern' ? [-0.05, 1.05] : [-1.05, 1.05], yticks: st.model === 'bern' ? [0, 0.25, 0.5, 0.75, 1] : [-1, -0.5, 0, 0.5, 1], xt: 'systems attacked k', yt: 'average score S_k / k', aria: 'Trajectories of the average score',
    series: [{ band: b2, color: 'var(--rule2)', op: .3 }, { pts: [[1, mu], [NT, mu]], color: 'var(--s2)', w: 1.6, dash: true }, ...lines((s, k) => s / k)], legend: [{ name: 'attacker trajectories', color: 'var(--s1)' }, { name: 'μ', color: 'var(--s2)', dash: true }] });
}
function renderDist() {
  const md = st.model, D = st.data[md], { mu, sig } = D.par, ci = CH.indexOf(st.nsel), n = st.nsel, sd = sig * Math.sqrt(n), col = [];
  for (let a = 0; a < D.m; a++) col.push(D.S[a * K + ci]);
  const mean = col.reduce((x, y) => x + y, 0) / D.m, v = col.reduce((x, y) => x + (y - mean) ** 2, 0) / D.m;
  const specs = [['h1', 1, mean, sd, 'S_n', 'Total score S_n'], ['h2', 1 / n, mean / n, sd / n, 'S_n / n', 'Average score S_n/n'], ['h3', 1 / Math.sqrt(n), mean / Math.sqrt(n), sd / Math.sqrt(n), 'S_n / √n', 'Normalized total S_n/√n']];
  specs.forEach(([id, tf, mm, ss, lab, name]) => {
    histPanel($(id), md, ci, tf, 0, n * mu * tf, ss, lab, name);
    const sdE = Math.sqrt(v) * tf;
    $(id + 'c').textContent = `${name}: mean ${(mean * tf).toPrecision(4)} (theory ${(n * mu * tf).toPrecision(4)}), sd ${sdE.toPrecision(3)} (theory ${ss.toPrecision(3)})`;
  });
}
function renderVar() {
  const md = st.model, { sig } = st.data[md].par, s = stats(md), v2 = sig * sig;
  const ns = CH, e1 = s.vr, e2 = s.vr.map((v, i) => v / CH[i] ** 2), e3 = s.vr.map((v, i) => v / CH[i]);
  const mk = arr => CH.map((n, i) => [n, arr[i]]);
  const th = [ns.map(n => [n, v2 * n]), ns.map(n => [n, v2 / n]), ns.map(n => [n, v2])];
  const lo = Math.min(...e2, v2 / CH[K - 1]), yr = [10 ** Math.floor(Math.log10(lo)), 10 ** Math.ceil(Math.log10(v2 * CH[K - 1]))];
  const names = ['Var(S_n)', 'Var(S_n/n)', 'Var(S_n/√n)'], cols = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
  chart($('varChart'), { xlog: true, ylog: true, xr: [1, 10000], yr, xt: 'systems n', yt: 'variance across attackers', aria: 'Variance against n on log-log axes',
    series: [...th.map((p, i) => ({ pts: p, color: cols[i], w: 1.2, dash: true })), ...[e1, e2, e3].map((a, i) => ({ pts: mk(a), color: cols[i], w: 2, dots: true, tip: p => `${names[i]} at n = ${p[0]}: ${p[1].toPrecision(3)}` }))],
    legend: [...names.map((n, i) => ({ name: n, color: cols[i] })), { name: 'theory', color: 'var(--ink2)', dash: true }] });
  $('varTbl').innerHTML = NSEL.map(n => {
    const i = CH.indexOf(n), f = (a, b) => `${a.toPrecision(3)}<br><span class="muted">${b.toPrecision(3)}</span>`;
    return `<tr><td class="num">${n.toLocaleString('en-US')}</td><td class="num">${f(e1[i], v2 * n)}</td><td class="num">${f(e2[i], v2 / n)}</td><td class="num">${f(e3[i], v2)}</td></tr>`;
  }).join('');
}
function renderLLN() {
  const md = st.model, D = st.data[md], { sig } = D.par, s = stats(md), e = EPS.indexOf(st.eps), emp = s.tail[e];
  const cheb = CH.map(n => Math.min(1, sig * sig / (n * st.eps * st.eps))), clt = CH.map(n => 2 * (1 - Phi(st.eps * Math.sqrt(n) / sig)));
  chart($('llnChart'), { xlog: true, xr: [1, 10000], yr: [0, 1.02], yticks: [0, 0.25, 0.5, 0.75, 1], xt: 'systems n', yt: `P(|S_n/n − μ| > ${st.eps})`, aria: 'Probability of deviation against n',
    series: [{ pts: CH.map((n, i) => [n, cheb[i]]), color: 'var(--s2)', w: 1.8, dash: true }, { pts: CH.map((n, i) => [n, clt[i]]), color: 'var(--s3)', w: 1.8 }, { pts: CH.map((n, i) => [n, emp[i]]), color: 'var(--s1)', w: 2, dots: true, tip: p => `n = ${p[0]}: ${(p[1] * 100).toFixed(2)}% of ${D.m} attackers` }],
    legend: [{ name: 'simulated', color: 'var(--s1)' }, { name: 'Chebyshev bound', color: 'var(--s2)', dash: true }, { name: 'normal approximation', color: 'var(--s3)' }] });
  $('llnCap').textContent = `With m = ${D.m} attackers the smallest nonzero fraction that can be observed is 1/m = ${(1 / D.m).toPrecision(2)}.`;
  $('llnTbl').innerHTML = NSEL.map(n => { const i = CH.indexOf(n); return `<tr><td class="num">${n.toLocaleString('en-US')}</td><td class="num">${emp[i].toPrecision(3)}</td><td class="num">${cheb[i].toPrecision(3)}</td><td class="num">${clt[i].toPrecision(3)}</td></tr>`; }).join('');
}
function renderCLT() {
  const md = st.model, D = st.data[md], { mu, sig, rho } = D.par, s = stats(md), rad = md === 'rad';
  $('cltTxt').innerHTML = rad
    ? 'For Rademacher steps μ = 0 and σ = 1, so the standardized total is S<sub>n</sub>/√n itself. Histograms of S<sub>n</sub>/√n approach the standard normal density, and the Kolmogorov distance falls like 1/√n until it reaches the sampling noise set by m.'
    : 'For Bernoulli steps the total must be centred first: S<sub>n</sub>/√n drifts to infinity because its mean is p√n. The standardized total (S<sub>n</sub> − np)/√(np(1−p)) is shown, and it approaches the standard normal density. Switch to Rademacher for the case where S<sub>n</sub>/√n itself is the standardized quantity.';
  $('cltGrid').innerHTML = CLT_N.map((n, i) => `<figure class="fig"><div id="z${i}"></div></figure>`).join('');
  CLT_N.forEach((n, i) => { const ci = CH.indexOf(n), tf = 1 / (sig * Math.sqrt(n)); histPanel($('z' + i), md, ci, tf, n * mu, 0, 1, `n = ${n}`, `Standardized total score at n = ${n}`); });
  const cols = s.subs.map(mm => KS_COL[mm]);
  const be = CH.map(n => [n, 0.4748 * rho / (sig ** 3 * Math.sqrt(n))]);
  const all = s.ks.flat(), lo = Math.min(...all);
  chart($('ksChart'), { xlog: true, ylog: true, xr: [1, 10000], yr: [10 ** Math.floor(Math.log10(lo)), 1], xt: 'systems n', yt: 'Kolmogorov distance to N(0,1)', aria: 'Kolmogorov distance against n',
    series: [{ pts: be, color: 'var(--s2)', w: 1.8, dash: true }, ...s.ks.map((a, j) => ({ pts: CH.map((n, i) => [n, a[i]]), color: cols[j], w: 2, dots: true, tip: p => `m = ${s.subs[j]}, n = ${p[0]}: ${p[1].toPrecision(3)}` }))],
    legend: [...s.subs.map((mm, j) => ({ name: `m = ${mm.toLocaleString('en-US')}`, color: cols[j] })), { name: 'Berry–Esseen bound', color: 'var(--s2)', dash: true }] });
  $('ksCap').textContent = 'Each curve uses the first m attackers. Once the distance reaches the sampling floor of about 0.87/√m, more systems per attacker no longer change what the sample can show; only a larger m does.';
}
function renderInterp() {
  const md = st.model, D = st.data[md], { mu, sig } = D.par, s = stats(md), m = D.m;
  const sdS = n => Math.sqrt(s.vr[CH.indexOf(n)]), f = v => v.toPrecision(3);
  const within = (() => { const ci = CH.indexOf(1000), n = 1000; let c = 0; for (let a = 0; a < m; a++) if (Math.abs(D.S[a * K + ci] - n * mu) <= 2 * sig * Math.sqrt(n)) c++; return 100 * c / m; })();
  const what = md === 'bern'
    ? 'S<sub>n</sub> is the number of systems penetrated out of n, and S<sub>n</sub>/n the share of the estate that falls'
    : 'S<sub>n</sub> is the net balance between successful and failed steps, which has no drift';
  $('interp').innerHTML = `<p><b>System size n.</b> ${what}. Going from n = 100 to n = 10,000 the standard deviation of S<sub>n</sub> grows from ${f(sdS(100))} to ${f(sdS(10000))} (theory σ√n: ${f(sig * 10)} and ${f(sig * 100)}), so the absolute outcome of one attacker becomes less predictable. The standard deviation of S<sub>n</sub>/n falls from ${f(sdS(100) / 100)} to ${f(sdS(10000) / 10000)}, so the average becomes almost deterministic, equal to ${md === 'bern' ? 'p = ' + st.p.toFixed(2) : '0'}. The normalized total keeps the same spread (${f(sdS(100) / 10)} at n = 100, ${f(sdS(10000) / 100)} at n = 10,000) and a bell-shaped law: at n = 1,000, ${within.toFixed(1)}% of attackers fall within 2σ√n of nμ, against 95.4% for a normal law.</p>
  <p><b>Number of attackers m.</b> m does not change the law of any of the three quantities, because the attackers are independent copies of the same process. It sets how well that law is observed: a simulated frequency q has error about √(q(1−q)/m), and the Kolmogorov distance cannot be resolved below about 0.87/√m = ${(0.87 / Math.sqrt(m)).toPrecision(2)} for m = ${m.toLocaleString('en-US')}. Pooling the m attackers gives a total with mean mnμ and standard deviation σ√(mn), so the relative uncertainty of the pooled total falls like 1/√(mn).</p>
  <div class="callout"><p>${md === 'bern' ? 'With Bernoulli steps, a larger estate makes the share of compromised systems predictable (law of large numbers) while the count of compromised systems stays uncertain by ±σ√n. Extra attackers add expected compromises in proportion to m but make the pooled count relatively more predictable.' : 'With zero-mean steps the aggregate score never settles: S<sub>n</sub> keeps spreading like √n and only S<sub>n</sub>/n tends to 0. Scaling by √n is what exposes the limiting normal law.'}</p></div>`;
}
function renderTiles() {
  const md = st.model, D = st.data[md], { sig } = D.par, s = stats(md), i4 = CH.indexOf(10000), i3 = CH.indexOf(1000);
  const e = EPS.indexOf(st.eps), cheb = Math.min(1, sig * sig / (1000 * st.eps * st.eps)), j = s.subs.length - 1, mm = s.subs[j];
  $('t-m').textContent = `${D.m.toLocaleString('en-US')} × 10,000`;
  $('t-var').textContent = `${s.vr[i4].toPrecision(3)} vs ${(sig * sig * 10000).toPrecision(3)}`;
  $('t-lln').textContent = `${(s.tail[e][i3] * 100).toFixed(2)}% vs ${(cheb * 100).toFixed(1)}%`;
  $('t-lln-n').textContent = `attackers with |S_n/n − μ| > ${st.eps} at n = 1,000, simulated against the Chebyshev bound`;
  $('t-ks').textContent = `${s.ks[j][i4].toPrecision(2)} vs ${(0.87 / Math.sqrt(mm)).toPrecision(2)}`;
  $('t-ks-n').textContent = `Kolmogorov distance to N(0,1) at n = 10,000 for the first ${mm.toLocaleString('en-US')} attackers, against the sampling floor 0.87/√m`;
}
function render() {
  if (!st.data[st.model]) return;
  renderTraj(); renderDist(); renderVar(); renderLLN(); renderCLT(); renderInterp(); renderTiles();
}

/* ================= controls ================= */
async function run(only) {
  const btn = $('rerun'); btn.disabled = true;
  for (const md of (only ? [only] : ['bern', 'rad'])) {
    const nm = md === 'bern' ? 'Bernoulli' : 'Rademacher';
    $('status').textContent = `simulating ${nm}…`;
    const S = await simulate(md, st.p, st.m, st.seed, pr => { $('status').textContent = `simulating ${nm} ${Math.round(pr * 100)}%`; });
    st.data[md] = { S, m: st.m, par: params(md, st.p), traj: trajectories(md, st.p, st.seed) }; delete st.cache[md];
    if (md === st.model) render();
  }
  $('status').textContent = `${st.m.toLocaleString('en-US')} attackers × 10,000 systems, seed ${st.seed}`;
  btn.disabled = false; render();
}
function setModel(md) {
  st.model = md; $('mBern').setAttribute('aria-pressed', md === 'bern'); $('mRad').setAttribute('aria-pressed', md === 'rad');
  $('pWrap').hidden = md !== 'bern'; render();
}
function buildTabs() {
  $('nTabs').innerHTML = NSEL.map(n => `<button type="button" data-n="${n}" aria-pressed="${n === st.nsel}">n = ${n.toLocaleString('en-US')}</button>`).join('');
  $('nTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.nsel = +b.dataset.n; [...$('nTabs').children].forEach(x => x.setAttribute('aria-pressed', x === b)); renderDist();
  });
}
buildTabs();
$('mBern').onclick = () => setModel('bern'); $('mRad').onclick = () => setModel('rad');
$('pIn').oninput = e => { $('pOut').textContent = (+e.target.value).toFixed(2); };
$('pIn').onchange = e => { st.p = +e.target.value; if (!$('rerun').disabled) run('bern'); };
$('mSel').onchange = e => { st.m = +e.target.value; run(); };
$('rerun').onclick = () => { st.seed = 1 + Math.floor(Math.random() * 1e6); run(); };
$('epsSel').onchange = e => { st.eps = +e.target.value; renderLLN(); renderTiles(); };
run().catch(e => { console.error(e); $('status').textContent = 'simulation failed: ' + e; });
