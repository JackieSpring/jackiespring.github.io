/* Homework 4: Welford's recurrences and sampling statistics.
   Exercise 1: live check of the one-pass recurrences. Exercise 2: m hackers, n systems each,
   Binomial(10, 0.4) scores; sampling mean and variance against the theoretical mu and sigma^2. */
const CH = [2, 3, 5, 10, 20, 30, 50, 100, 200, 500, 1000, 2000, 5000, 10000], K = CH.length, NL = [5, 10, 30, 100, 1000, 10000], TRN = 1000, TRH = 20;
const $ = id => document.getElementById(id);
const st = { m: 1000, seed: 2026, nsel: 30, data: null, cache: null, rec: null };

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

/* ================= score distribution: Binomial(10, 0.4) ================= */
const pmf = []; { let c = 1; for (let x = 0; x <= 10; x++) { pmf.push(c * 0.4 ** x * 0.6 ** (10 - x)); c = c * (10 - x) / (x + 1); } }
const mu = pmf.reduce((s, p, x) => s + x * p, 0), s2 = pmf.reduce((s, p, x) => s + (x - mu) ** 2 * p, 0), mu4 = pmf.reduce((s, p, x) => s + (x - mu) ** 4 * p, 0);
const cdfU = []; { let a = 0; pmf.forEach((p, i) => { a += p; cdfU.push(i === 10 ? 4294967296 : a * 4294967296); }); }
const sdMeanT = n => Math.sqrt(s2 / n), varVarT = n => mu4 / n - s2 * s2 * (n - 3) / (n * (n - 1));
const draw = rnd => { const u = rnd(); let x = 0; while (u >= cdfU[x]) x++; return x; };

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

/* ================= Exercise 1: Welford demo ================= */
function welfordRun(xs) {
  let mean = 0, ss = 0, k = 0, v = 0, rows = [], vok = true;
  for (const x of xs) {
    k++; const d = x - mean; mean += d / k; ss += d * (x - mean);
    const vSS = k > 1 ? ss / (k - 1) : NaN;
    if (k > 1) { v = k === 2 ? d * d / 2 : ((k - 2) / (k - 1)) * v + d * d / k; if (Math.abs(v - vSS) > 1e-9 * Math.max(1, Math.abs(vSS))) vok = false; }
    rows.push([k, x, mean, ss, vSS]);
  }
  return { rows, mean, ss, k, vok };
}
function renderWelford() {
  const xs = $('seq').value.split(/[\s,;]+/).filter(t => t !== '').map(Number).filter(v => isFinite(v)).slice(0, 200);
  if (xs.length < 2) {
    $('wfOut').innerHTML = '<span class="sub">Enter at least two numbers.</span>'; $('wfTbl').innerHTML = '';
    st.rec = null; renderRecTile(); return;
  }
  const r = welfordRun(xs), n = xs.length, m2 = xs.reduce((a, b) => a + b, 0) / n, ss2 = xs.reduce((a, b) => a + (b - m2) ** 2, 0);
  const ok = Math.abs(r.mean - m2) < 1e-9 && Math.abs(r.ss - ss2) < 1e-9 * Math.max(1, ss2);
  st.rec = ok && r.vok;
  $('wfOut').innerHTML = `<div>Recurrence: M = <b>${+r.mean.toPrecision(10)}</b>, SS = <b>${+r.ss.toPrecision(10)}</b>, s² = <b>${+(r.ss / (n - 1)).toPrecision(10)}</b></div><div style="margin-top: var(--space-1)">Two-pass: M = ${+m2.toPrecision(10)}, SS = ${+ss2.toPrecision(10)}, s² = ${+(ss2 / (n - 1)).toPrecision(10)}</div><div class="row" style="margin-top: var(--space-2)"><span class="pill ${ok ? 'ok' : 'no'}">${ok ? 'mean and SS agree with the two-pass values' : 'mismatch'}</span><span class="pill ${r.vok ? 'ok' : 'no'}">${r.vok ? 'variance recurrence agrees with SS/(k−1)' : 'variance recurrence mismatch'}</span></div>`;
  $('wfTbl').innerHTML = r.rows.slice(0, 40).map(x => `<tr><td class="num">${x[0]}</td><td class="num">${x[1]}</td><td class="num">${+x[2].toPrecision(7)}</td><td class="num">${+x[3].toPrecision(7)}</td><td class="num">${isNaN(x[4]) ? '–' : +x[4].toPrecision(7)}</td></tr>`).join('');
  renderRecTile();
}
function renderRecTile() {
  $('t-rec').textContent = st.rec === null ? '–' : st.rec ? 'all agree' : 'mismatch';
}

/* ================= Exercise 2: simulation ================= */
async function simulate(m, seed, onProg) {
  const rnd = rng(seed), M = new Float64Array(m * K), SS = new Float64Array(m * K);
  for (let a = 0; a < m; a++) {
    let mean = 0, ss = 0, k = 0;
    for (let ci = 0; ci < K; ci++) {
      const end = CH[ci];
      while (k < end) { const x = draw(rnd); k++; const d = x - mean; mean += d / k; ss += d * (x - mean); }
      M[a * K + ci] = mean; SS[a * K + ci] = ss;
    }
    if ((a & 127) === 127) { onProg && onProg(a / m); await new Promise(r => setTimeout(r, 0)); }
  }
  return { M, SS };
}
function trajectories(seed) {
  const rnd = rng(seed * 5 + 1), out = [];
  for (let h = 0; h < TRH; h++) {
    let mean = 0, ss = 0; const ms = [], vs = [];
    for (let k = 1; k <= TRN; k++) { const x = draw(rnd), d = x - mean; mean += d / k; ss += d * (x - mean); if (k >= 2) { ms.push([k, mean]); vs.push([k, ss / (k - 1)]); } }
    out.push({ ms, vs });
  }
  return out;
}
function stats() {
  if (st.cache) return st.cache;
  const { M, SS } = st.data.sim, m = st.m, o = [];
  for (let ci = 0; ci < K; ci++) {
    const n = CH[ci]; let sM = 0, sV = 0, sB = 0;
    for (let a = 0; a < m; a++) { sM += M[a * K + ci]; sV += SS[a * K + ci] / (n - 1); sB += SS[a * K + ci] / n; }
    const aM = sM / m, aV = sV / m; let dM = 0, dV = 0;
    for (let a = 0; a < m; a++) { dM += (M[a * K + ci] - aM) ** 2; dV += (SS[a * K + ci] / (n - 1) - aV) ** 2; }
    o.push({ n, aM, aV, aB: sB / m, sdM: Math.sqrt(dM / m), sdV: Math.sqrt(dV / m) });
  }
  return st.cache = o;
}

/* ================= rendering ================= */
function renderPmf() {
  chart($('pmf'), { W: 420, H: 220, xr: [-0.5, 10.5], yr: [0, 0.3], xticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], yticks: [0, 0.1, 0.2, 0.3], xt: 'score x', yt: 'probability', aria: 'Probability mass function of the score',
    series: [{ bars: pmf.map((p, x) => [x - 0.5, x + 0.5, p]), color: 'var(--s1)', tip: b => `P(X = ${Math.round((b[0] + b[1]) / 2)}) = ${b[2].toFixed(4)}` }] });
  $('pmfCap').textContent = `Score distribution Binomial(10, 0.4): μ = ${mu}, σ² = ${s2.toFixed(2)}.`;
}
function renderConv() {
  const T = st.data.traj, xr = [2, TRN], xticks = [2, 10, 100, 1000];
  const lines = key => T.map((t, i) => ({ pts: t[key], color: i ? 'var(--s1)' : 'var(--ink)', w: i ? 1.1 : 2, op: i ? .45 : 1 }));
  chart($('cv1'), { xlog: true, xr, xticks, xfmt: fmt, yr: [0, 10], yticks: [0, 2, 4, 6, 8, 10], xt: 'systems attempted k', yt: 'Welford mean M_k', aria: 'Welford running means',
    series: [{ pts: [[2, mu], [TRN, mu]], color: 'var(--s2)', w: 1.6, dash: true }, ...lines('ms')], legend: [{ name: 'hacker trajectories', color: 'var(--s1)' }, { name: 'μ', color: 'var(--s2)', dash: true }] });
  chart($('cv2'), { xlog: true, xr, xticks, xfmt: fmt, yr: [0, 10], yticks: [0, 2, 4, 6, 8, 10], xt: 'systems attempted k', yt: 'Welford variance s²_k', aria: 'Welford running variances',
    series: [{ pts: [[2, s2], [TRN, s2]], color: 'var(--s2)', w: 1.6, dash: true }, ...lines('vs')], legend: [{ name: 'hacker trajectories', color: 'var(--s1)' }, { name: 'σ²', color: 'var(--s2)', dash: true }] });
}
const f4 = v => v.toPrecision(4);
function renderTables() {
  const S = stats(), by = n => S[CH.indexOf(n)];
  $('avgTbl').innerHTML = NL.map(n => { const r = by(n); return `<tr><td class="num">${n.toLocaleString('en-US')}</td><td class="num">${f4(r.aM)}</td><td class="num">${mu}</td><td class="num">${f4(r.aV)}</td><td class="num">${s2.toFixed(2)}</td><td class="num">${f4(r.aB)}</td><td class="num">${f4((n - 1) * s2 / n)}</td></tr>`; }).join('');
  $('sdTbl').innerHTML = NL.map(n => { const r = by(n); return `<tr><td class="num">${n.toLocaleString('en-US')}</td><td class="num">${r.sdM.toPrecision(3)}</td><td class="num">${sdMeanT(n).toPrecision(3)}</td><td class="num">${r.sdV.toPrecision(3)}</td><td class="num">${Math.sqrt(varVarT(n)).toPrecision(3)}</td></tr>`; }).join('');
  const lo = Math.min(...S.map(r => Math.min(r.sdM, r.sdV))), hi = Math.max(...S.map(r => Math.max(r.sdM, r.sdV)));
  const yr = [10 ** Math.floor(Math.log10(lo)), 10 ** Math.ceil(Math.log10(hi))];
  chart($('sdChart'), { xlog: true, ylog: true, xr: [2, 10000], xticks: [10, 100, 1000, 10000], yr, xt: 'systems per hacker n', yt: 'sd across hackers', aria: 'Standard deviations against n',
    series: [{ pts: CH.map(n => [n, sdMeanT(n)]), color: 'var(--s1)', w: 1.2, dash: true }, { pts: CH.map(n => [n, Math.sqrt(varVarT(n))]), color: 'var(--s2)', w: 1.2, dash: true },
      { pts: S.map(r => [r.n, r.sdM]), color: 'var(--s1)', w: 2, dots: true, tip: p => `sd of sampling means, n = ${p[0]}: ${p[1].toPrecision(3)}` },
      { pts: S.map(r => [r.n, r.sdV]), color: 'var(--s2)', w: 2, dots: true, tip: p => `sd of sampling variances, n = ${p[0]}: ${p[1].toPrecision(3)}` }],
    legend: [{ name: 'sampling mean', color: 'var(--s1)' }, { name: 'sampling variance', color: 'var(--s2)' }, { name: 'theory', color: 'var(--ink2)', dash: true }] });
}
function renderHists() {
  const n = st.nsel, ci = CH.indexOf(n), { M, SS } = st.data.sim, m = st.m, sd = sdMeanT(n);
  // sampling means: bins aligned to the lattice of possible means (multiples of 1/n)
  const w = 8 * sd / 32, k = Math.max(1, Math.round(w * n)), cnt = new Map();
  for (let a = 0; a < m; a++) { const sum = Math.round(M[a * K + ci] * n), j = Math.floor((sum + 0.5) / k); cnt.set(j, (cnt.get(j) || 0) + 1); }
  const bars = [...cnt].map(([j, c]) => [(j * k - 0.5) / n, ((j + 1) * k - 0.5) / n, c / (m * k / n)]);
  const pts = []; for (let i = 0; i <= 160; i++) { const x = mu - 4 * sd + 8 * sd * i / 160; pts.push([x, Math.exp(-((x - mu) ** 2) / (2 * sd * sd)) / (sd * 2.5066)]); }
  const pk = Math.max(...bars.map(b => b[2]), 1 / (sd * 2.5066));
  chart($('hm'), { xr: [mu - 4 * sd, mu + 4 * sd], yr: [0, pk * 1.12], xt: `sampling mean, n = ${n}`, yt: 'density', aria: 'Histogram of sampling means',
    series: [{ bars, color: 'var(--s1)', tip: b => `${fmt(b[0])} to ${fmt(b[1])}: density ${b[2].toPrecision(3)}` }, { pts, color: 'var(--s2)', w: 1.8 }], legend: [{ name: 'simulated', color: 'var(--s1)' }, { name: 'N(μ, σ²/n)', color: 'var(--s2)' }] });
  const r = stats()[ci];
  $('hmc').textContent = `Mean of the sampling means ${f4(r.aM)} (μ = ${mu}); sd ${r.sdM.toPrecision(3)} (σ/√n = ${sd.toPrecision(3)}).`;
  // sampling variances
  const hi = Math.max(s2 + 5 * Math.sqrt(varVarT(n)), s2 * 1.4), hi2 = Math.min(hi, 40), bw = hi2 / 32, vc = new Array(32).fill(0);
  for (let a = 0; a < m; a++) { const v = SS[a * K + ci] / (n - 1), j = Math.floor(v / bw); if (j >= 0 && j < 32) vc[j]++; }
  const vb = vc.map((c, j) => [j * bw, (j + 1) * bw, c / (m * bw)]), vpk = Math.max(...vb.map(b => b[2]));
  chart($('hv'), { xr: [0, hi2], yr: [0, vpk * 1.15], xt: `sampling variance, n = ${n}`, yt: 'density', aria: 'Histogram of sampling variances',
    series: [{ bars: vb, color: 'var(--s3)', tip: b => `${fmt(b[0])} to ${fmt(b[1])}: density ${b[2].toPrecision(3)}` }, { pts: [[s2, 0], [s2, vpk * 1.15]], color: 'var(--s2)', w: 1.8, dash: true }], legend: [{ name: 'simulated', color: 'var(--s3)' }, { name: 'σ²', color: 'var(--s2)', dash: true }] });
  $('hvc').textContent = `Mean of the sampling variances ${f4(r.aV)} (σ² = ${s2.toFixed(2)}); sd ${r.sdV.toPrecision(3)} (theory ${Math.sqrt(varVarT(n)).toPrecision(3)}).`;
}
function renderConcl() {
  const S = stats(), by = n => S[CH.indexOf(n)], a = by(30), b = by(10), c = by(1000), m = st.m;
  $('conclBody').innerHTML = `<p><b>Unbiasedness.</b> Averaged over the hackers, the sampling mean and the sampling variance reproduce μ and σ² at every n, within sampling noise, even for n = 5 (table above). At n = 30 the average sampling mean is ${f4(a.aM)} against μ = ${mu}, and the average s² is ${f4(a.aV)} against σ² = ${s2.toFixed(2)}. Dividing SS by n instead of n − 1 gives ${f4(a.aB)}, which matches (n − 1)σ²/n = ${f4(29 * s2 / 30)}: the divisor n − 1 is what makes s² unbiased, E[x̄] = μ and E[s²] = σ². The remaining gaps are sampling noise of the average over m = ${m.toLocaleString('en-US')} hackers.</p>
  <p><b>Why it matters in inference.</b> In practice there is one sample, for instance one hacker's n scores, and μ and σ² are unknown. Because x̄ and s² are unbiased, they can be used as estimates of the unknown parameters, and s/√n estimates the standard error of x̄, which is what confidence intervals and tests for the mean are built on. The recurrences give both estimates in a single pass, one score at a time.</p>
  <p><b>Effect of n.</b> Unbiasedness does not depend on n, but the spread of the estimates does. From n = 10 to n = 1,000 the standard deviation of the sampling mean goes from ${b.sdM.toPrecision(3)} to ${c.sdM.toPrecision(3)}, a factor ${(b.sdM / c.sdM).toPrecision(3)} for a hundred times more systems, as σ/√n predicts (factor 10). The standard deviation of the sampling variance shrinks at the same rate, ${b.sdV.toPrecision(3)} to ${c.sdV.toPrecision(3)}. So both estimators concentrate on the true values as n grows, and halving the error takes four times as many systems per hacker. A larger m does not change this: it only makes the averages over hackers less noisy.</p>`;
}
function renderTiles() {
  const S = stats(), a = S[CH.indexOf(30)], c = S[CH.indexOf(1000)];
  $('t-var').textContent = `${a.aV.toPrecision(4)} vs ${s2.toFixed(2)}`;
  $('t-sdm').textContent = `${c.sdM.toPrecision(3)} vs ${sdMeanT(1000).toPrecision(3)}`;
  $('t-sdv').textContent = `${c.sdV.toPrecision(3)} vs ${Math.sqrt(varVarT(1000)).toPrecision(3)}`;
}
function render() { if (!st.data) return; renderPmf(); renderConv(); renderTables(); renderHists(); renderConcl(); renderTiles(); }

/* ================= controls ================= */
async function run() {
  const btn = $('rerun'); btn.disabled = true;
  const sim = await simulate(st.m, st.seed, p => { $('status').textContent = `simulating ${Math.round(p * 100)}%`; });
  st.data = { sim, traj: trajectories(st.seed) }; st.cache = null;
  $('status').textContent = `${st.m.toLocaleString('en-US')} hackers × 10,000 systems, seed ${st.seed}`;
  btn.disabled = false; render();
}
$('nTabs').innerHTML = NL.map(n => `<button type="button" data-n="${n}" aria-pressed="${n === st.nsel}">n = ${n.toLocaleString('en-US')}</button>`).join('');
$('nTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  st.nsel = +b.dataset.n; [...$('nTabs').children].forEach(x => x.setAttribute('aria-pressed', x === b)); if (st.data) renderHists();
});
$('seq').addEventListener('input', renderWelford);
$('mSel').onchange = e => { st.m = +e.target.value; run(); };
$('rerun').onclick = () => { st.seed = 1 + Math.floor(Math.random() * 1e6); run(); };
renderWelford(); renderPmf();
run().catch(e => { console.error(e); $('status').textContent = 'simulation failed: ' + e; });
