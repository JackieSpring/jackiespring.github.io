/* Homework 1: toy ECC lab and statistical exploration. Requires ecc-lib.js. */
const L = Lib, toy = L.toy;
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in (attrs || {})) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtPt = P => P === null ? 'O' : `(${P[0]}, ${P[1]})`;
const tick = () => new Promise(r => setTimeout(r, 0));
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function short(h, a = 10, b = 8) { return h.length > a + b + 3 ? h.slice(0, a) + '…' + h.slice(-b) : h; }

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

function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
const fmtN = v => Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(+v.toPrecision(3));

function axisText(svg, W, H, m, o) {
  if (o.xt) { const t = svgEl('text', { x: m.l + (W - m.l - m.r) / 2, y: H - 4, 'text-anchor': 'middle', class: 'lbl' }, svg); t.textContent = o.xt; }
  if (o.yt) { const t = svgEl('text', { x: 12, y: m.t + (H - m.t - m.b) / 2, 'text-anchor': 'middle', class: 'lbl', transform: `rotate(-90 12 ${m.t + (H - m.t - m.b) / 2})` }, svg); t.textContent = o.yt; }
}
function legendHTML(items) { return '<div class="legend">' + items.map(i => `<span><i style="background:${i.color}"></i>${i.name}</span>`).join('') + '</div>'; }

function barChart(el, bars, o = {}) {
  const W = o.W || 520, H = o.H || 250, m = { l: 48, r: 12, t: 12, b: o.xt ? 44 : 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ymax = o.ymax || niceMax(Math.max(...bars.map(b => b.v), o.ref || 0, 1e-9) * 1.08);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.aria || 'bar chart' });
  for (let i = 0; i <= 4; i++) {
    const v = ymax * i / 4, y = m.t + ih - ih * i / 4;
    svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: i ? 'gr' : 'ax' }, svg);
    const t = svgEl('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'lbl' }, svg); t.textContent = (o.yfmt || fmtN)(v);
  }
  const bw = iw / bars.length, gap = Math.min(2, bw * 0.22);
  bars.forEach((b, i) => {
    const h = ih * b.v / ymax;
    svgEl('rect', { x: m.l + i * bw + gap / 2, y: m.t + ih - h, width: Math.max(bw - gap, 0.6), height: Math.max(h, 0), rx: Math.min(2, bw / 4), style: `fill:${b.color || o.color || 'var(--s1)'}`, 'data-tip': b.tip || '' }, svg);
    if (b.xl != null && (!o.xevery || i % o.xevery === 0)) { const t = svgEl('text', { x: m.l + i * bw + bw / 2, y: m.t + ih + 14, 'text-anchor': 'middle', class: 'lbl' }, svg); t.textContent = b.xl; }
  });
  if (o.ref != null) { const y = m.t + ih - ih * o.ref / ymax; svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, style: 'stroke:var(--s2);stroke-width:1.5;stroke-dasharray:5 4' }, svg); }
  if (o.line) { const pts = o.line.map((v, i) => `${m.l + i * bw + bw / 2},${m.t + ih - ih * v / ymax}`).join(' '); svgEl('polyline', { points: pts, style: 'fill:none;stroke:var(--s2);stroke-width:2' }, svg); }
  axisText(svg, W, H, m, o);
  el.innerHTML = ''; el.appendChild(svg);
  if (o.legend) el.insertAdjacentHTML('beforeend', legendHTML(o.legend));
}

function lineChart(el, series, o = {}) {
  const W = o.W || 520, H = o.H || 250, m = { l: 52, r: 14, t: 12, b: o.xt ? 44 : 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = series.flatMap(s => s.pts.map(p => p[0])), ys = series.flatMap(s => s.pts.map(p => p[1]));
  const xmin = o.xmin ?? Math.min(...xs), xmax = o.xmax ?? Math.max(...xs);
  let ymin = o.ymin ?? Math.min(...ys), ymax = o.ymax ?? Math.max(...ys);
  const lg = !!o.ylog;
  const ty = v => lg ? (Math.log10(Math.max(v, ymin)) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) : (v - ymin) / (ymax - ymin);
  const sx = v => m.l + iw * (v - xmin) / (xmax - xmin), sy = v => m.t + ih - ih * ty(v);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.aria || 'line chart' });
  const yt = lg ? Array.from({ length: Math.round(Math.log10(ymax / ymin)) + 1 }, (_, i) => ymin * Math.pow(10, i)) : Array.from({ length: 5 }, (_, i) => ymin + (ymax - ymin) * i / 4);
  yt.forEach((v, i) => {
    const y = sy(v); svgEl('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: i ? 'gr' : 'ax' }, svg);
    const t = svgEl('text', { x: m.l - 6, y: y + 3.5, 'text-anchor': 'end', class: 'lbl' }, svg);
    t.textContent = o.yfmt ? o.yfmt(v) : (lg ? '1e' + Math.round(Math.log10(v)) : fmtN(v));
  });
  if (o.hband) svgEl('rect', { x: m.l, y: sy(o.hband[1]), width: iw, height: sy(o.hband[0]) - sy(o.hband[1]), style: 'fill:var(--rule);opacity:.6' }, svg);
  (o.xticks || []).forEach(v => { const x = sx(v); svgEl('line', { x1: x, x2: x, y1: m.t + ih, y2: m.t + ih + 4, class: 'ax' }, svg); const t = svgEl('text', { x, y: m.t + ih + 16, 'text-anchor': 'middle', class: 'lbl' }, svg); t.textContent = o.xfmt ? o.xfmt(v) : v; });
  series.forEach(s => {
    if (s.line !== false) svgEl('polyline', { points: s.pts.map(p => `${sx(p[0])},${sy(p[1])}`).join(' '), style: `fill:none;stroke:${s.color};stroke-width:${s.w || 2};${s.dash ? 'stroke-dasharray:5 4;' : ''}` }, svg);
    if (s.dots || s.line === false) s.pts.forEach(p => svgEl('circle', { cx: sx(p[0]), cy: sy(p[1]), r: s.r || 3.2, style: `fill:${s.color};stroke:var(--panel);stroke-width:1.5`, 'data-tip': s.tip ? s.tip(p) : '' }, svg));
    else s.pts.forEach(p => svgEl('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 7, fill: 'transparent', 'data-tip': s.tip ? s.tip(p) : '' }, svg));
  });
  axisText(svg, W, H, m, o);
  el.innerHTML = ''; el.appendChild(svg);
  el.insertAdjacentHTML('beforeend', legendHTML(series.filter(s => s.name).map(s => ({ name: s.name, color: s.color }))));
}

function heatColor(p) { // diverging: light blue (>0.5) / orange (<0.5) around a neutral grey midpoint
  const mid = [56, 56, 53], hi = [94, 200, 242], lo = [255, 160, 46];
  const d = Math.max(-1, Math.min(1, (p - 0.5) / 0.3)), t = Math.abs(d), pole = d >= 0 ? hi : lo;
  return `rgb(${mid.map((c, i) => Math.round(c + (pole[i] - c) * t)).join(',')})`;
}
/* ================= SECTION 1: toy curve lab ================= */
const TOY_SRC = `// toy-ecc.js : scalar multiplication on y² = x³ + 7 (mod 17)
const p = 17;
const G = [1, 5];            // base point
const k = 6;                 // private key

const mod = (a) => ((a % p) + p) % p;
const inv = (a) => { for (let i = 1; i < p; i++) if (mod(a * i) === 1) return i; };
const onCurve = ([x, y]) => mod(y * y - x ** 3 - 7) === 0;

// point addition; null represents the point at infinity O
function add(P, Q) {
  if (P === null) return Q;
  if (Q === null) return P;
  if (P[0] === Q[0] && mod(P[1] + Q[1]) === 0) return null;   // P + (-P) = O
  const lam = (P[0] === Q[0] && P[1] === Q[1])
    ? mod(3 * P[0] ** 2 * inv(2 * P[1]))                      // tangent (doubling)
    : mod((Q[1] - P[1]) * inv(Q[0] - P[0]));                  // chord
  const x = mod(lam * lam - P[0] - Q[0]);
  return [x, mod(lam * (P[0] - x) - P[1])];
}

console.log('G on the curve?', onCurve(G));
let R = null;
for (let i = 1; i <= k; i++) {                                // G, 2G, ..., kG
  R = add(R, G);
  console.log(i + 'G =', R ? '(' + R[0] + ', ' + R[1] + ')' : 'O');
}
console.log('TOY PUBLIC KEY Q = kG = (' + R[0] + ', ' + R[1] + ')');
`;
const ALLPTS = toy.allPoints();
const ORD = new Map(ALLPTS.map(P => [P.join(','), toy.order(P)]));
const S = { G: [1, 5], k: 6, method: 'add', steps: [], cur: 0, timer: null, playing: false };

function buildSteps(G, k, method) {
  const steps = []; let R = null;
  if (method === 'add') {
    for (let i = 1; i <= k; i++) { const s = toy.add(R, G); steps.push({ label: i + 'G', op: i === 1 ? 'O + G' : `${i - 1}G + G`, P: R, Q: G, R: s.R, lam: s.lambda, kind: s.kind }); R = s.R; }
  } else {
    const bits = k.toString(2); R = G; let c = 1;
    steps.push({ label: '1G', op: `start: the leading bit of ${bits} is 1`, P: null, Q: G, R: G, kind: 'start' });
    for (let i = 1; i < bits.length; i++) {
      c *= 2; const d = toy.add(R, R); steps.push({ label: c + 'G', op: `doubling (next bit ${bits[i]})`, P: R, Q: R, R: d.R, lam: d.lambda, kind: d.kind }); R = d.R;
      if (bits[i] === '1') { c += 1; const a = toy.add(R, G); steps.push({ label: c + 'G', op: 'add G (the bit is 1)', P: R, Q: G, R: a.R, lam: a.lambda, kind: a.kind }); R = a.R; }
    }
  }
  return steps;
}
const fmtQ = Q => Q === null ? 'O (point at infinity)' : `(${Q[0]}, ${Q[1]})`;

function drawPlane() {
  const el = $('plane'), CELL = 25, M = 30, W = M + 17 * CELL + 12, H = M + 17 * CELL + 12;
  const X = x => M + x * CELL + CELL / 2, Y = y => 12 + (16 - y) * CELL + CELL / 2;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Curve points modulo 17' });
  for (let i = 0; i < 17; i++) {
    svgEl('line', { x1: X(i), x2: X(i), y1: Y(16) - CELL / 2, y2: Y(0) + CELL / 2, class: 'gr' }, svg);
    svgEl('line', { x1: X(0) - CELL / 2, x2: X(16) + CELL / 2, y1: Y(i), y2: Y(i), class: 'gr' }, svg);
    if (i % 2 === 0) {
      const a = svgEl('text', { x: X(i), y: Y(0) + CELL / 2 + 13, 'text-anchor': 'middle', class: 'lbl' }, svg); a.textContent = i;
      const b = svgEl('text', { x: X(0) - CELL / 2 - 6, y: Y(i) + 3.5, 'text-anchor': 'end', class: 'lbl' }, svg); b.textContent = i;
    }
  }
  const st = S.steps[S.cur], orbit = new Set(); { let R = null; const n = toy.order(S.G); for (let i = 1; i < n; i++) { R = toy.add(R, S.G).R; orbit.add(R.join(',')); } }
  // line residues first (under everything)
  if (st && st.P && st.Q && st.kind !== 'start') {
    const [P, Q] = [st.P, st.Q];
    if (P[0] === Q[0] && (P[1] + Q[1]) % 17 === 0) { for (let y = 0; y < 17; y++) svgEl('circle', { cx: X(P[0]), cy: Y(y), r: 2.2, style: 'fill:var(--muted);opacity:.7' }, svg); }
    else { const lam = st.lam; for (let x = 0; x < 17; x++) { const y = (((lam * (x - P[0]) + P[1]) % 17) + 17) % 17; svgEl('circle', { cx: X(x), cy: Y(y), r: 2.2, style: 'fill:var(--muted);opacity:.75' }, svg); } }
  }
  ALLPTS.forEach(P => {
    const inO = orbit.has(P.join(','));
    svgEl('circle', { cx: X(P[0]), cy: Y(P[1]), r: inO ? 5.5 : 4, style: `fill:${inO ? 'var(--panel2)' : 'var(--rule2)'};stroke:${inO ? 'var(--ink2)' : 'none'};stroke-width:1.4`, 'data-tip': `(${P[0]}, ${P[1]})${inO ? ', in the subgroup of G' : ''}` }, svg);
  });
  if (st) {
    const { P, Q, R } = st;
    if (P && R && st.kind !== 'start' && st.lam !== undefined) { // third intersection and reflection
      const y3 = (17 - R[1]) % 17; svgEl('line', { x1: X(R[0]), x2: X(R[0]), y1: Y(y3), y2: Y(R[1]), style: 'stroke:var(--s3);stroke-width:1.5;stroke-dasharray:3 3' }, svg);
      svgEl('circle', { cx: X(R[0]), cy: Y(y3), r: 6.5, style: 'fill:none;stroke:var(--s3);stroke-width:2' }, svg);
    }
    if (Q) { svgEl('circle', { cx: X(Q[0]), cy: Y(Q[1]), r: 8, style: 'fill:var(--s2);stroke:var(--panel);stroke-width:2', 'data-tip': 'G or Q: ' + fmtPt(Q) }, svg); }
    if (P) { svgEl('circle', { cx: X(P[0]), cy: Y(P[1]), r: 8, style: 'fill:var(--s1);stroke:var(--panel);stroke-width:2', 'data-tip': 'P: ' + fmtPt(P) }, svg); if (Q && P[0] === Q[0] && P[1] === Q[1]) { /* doubling: single marker */ } }
    if (R) { svgEl('circle', { cx: X(R[0]), cy: Y(R[1]), r: 8.5, style: 'fill:var(--s3);stroke:var(--panel);stroke-width:2', 'data-tip': st.label + ' = ' + fmtPt(R) }, svg); const t = svgEl('text', { x: X(R[0]) + 11, y: Y(R[1]) - 9, style: 'font-size:12px;font-weight:600;fill:var(--ink)' }, svg); t.textContent = st.label; }
  }
  el.innerHTML = ''; el.appendChild(svg);
}

function renderSteps() {
  const body = $('stepBody'); body.innerHTML = '';
  S.steps.forEach((s, i) => {
    const tr = document.createElement('tr'); tr.dataset.i = i;
    tr.innerHTML = `<td class="mono">${esc(s.label)}</td><td>${esc(s.op)}</td><td class="mono">${s.kind === 'start' ? '–' : fmtPt(s.P)}</td><td class="mono">${s.kind === 'start' ? '–' : fmtPt(s.Q)}</td><td class="num mono">${s.lam === undefined ? '–' : s.lam}</td><td class="mono"><b>${fmtPt(s.R)}</b></td>`;
    tr.style.cursor = 'pointer'; tr.addEventListener('click', () => { pause(); show(i); });
    body.appendChild(tr);
  });
}
function stepText(s) {
  if (!s) return '';
  if (s.kind === 'start') return `<b>${esc(s.label)}</b> = G = ${fmtPt(s.R)}. Double-and-add reads the bits of k from the left; the leading 1 simply starts from G.`;
  let h = `<b>${esc(s.label)}</b>: ${esc(s.op)} → ${esc(s.kind)}<br>`;
  if (s.lam === undefined) return h + `P = ${fmtPt(s.P)}, Q = ${fmtPt(s.Q)} → ${esc(s.kind)}. Result ${fmtQ(s.R)}.`;
  const [P, Q, R] = [s.P, s.Q, s.R];
  h += `<span class="mono">λ = ${s.lam}</span> &nbsp; <span class="mono">x₃ = λ² − x₁ − x₂ = ${R[0]}</span> &nbsp; <span class="mono">y₃ = λ(x₁ − x₃) − y₁ = ${R[1]}</span><br>`;
  h += `The line through ${fmtPt(P)} and ${fmtPt(Q)} meets the curve again at (${R[0]}, ${(17 - R[1]) % 17}) (green ring); reflecting gives the sum ${fmtPt(R)}.`;
  return h;
}
function renderLog(upTo) {
  const lines = []; const n = toy.order(S.G);
  if (S.method === 'dbl') lines.push(`k = ${S.k} = ${S.k.toString(2)} (binary)`);
  for (let i = 0; i <= upTo && i < S.steps.length; i++) { const s = S.steps[i]; lines.push(`${s.label} = ${fmtPt(s.R)}${S.method === 'dbl' ? '   // ' + s.op : ''}`); }
  if (upTo >= S.steps.length - 1) { const R = S.steps[S.steps.length - 1].R; lines.push('', `TOY PUBLIC KEY  Q = kG = ${S.k}G = ${fmtQ(R)}`); if (S.k >= n) lines.push(`(ord(G) = ${n}, so ${S.k}G = ${S.k % n}G)`); }
  $('outLog').textContent = lines.join('\n');
}
function show(i) {
  S.cur = Math.max(0, Math.min(S.steps.length - 1, i));
  drawPlane(); $('stepInfo').innerHTML = stepText(S.steps[S.cur]); renderLog(S.cur);
  const rows = $('stepBody').children; for (const r of rows) r.classList.toggle('cur', +r.dataset.i === S.cur);
  const row = rows[S.cur]; if (row) { const box = row.closest('.steps'); box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 2); }
}
function renderPub() {
  const n = toy.order(S.G), R = S.steps[S.steps.length - 1].R;
  $('pubkeyBox').innerHTML = `<p><b>TOY PUBLIC KEY</b> &nbsp; Q = ${S.k}·G = <span class="mono"><b>${fmtQ(R)}</b></span> &nbsp; for G = ${fmtPt(S.G)} (order ${n}).</p><p class="small">Check: ${R ? `${R[1]}² = ${R[1] * R[1]} ≡ ${(R[1] * R[1]) % 17} and ${R[0]}³ + 7 = ${R[0] ** 3 + 7} ≡ ${(R[0] ** 3 + 7) % 17} (mod 17)` : 'the point at infinity has no coordinates'}. Anyone may know Q and G; recovering k is the discrete logarithm problem.</p>`;
}
function recompute() {
  pause(); S.k = Math.max(1, Math.min(99, parseInt($('k').value) || 1)); $('k').value = S.k;
  S.G = $('base').value.split(',').map(Number); S.method = $('method').value;
  S.steps = buildSteps(S.G, S.k, S.method); renderSteps(); renderPub(); show(S.steps.length - 1);
}
function pause() { if (S.timer) clearTimeout(S.timer); S.timer = null; S.playing = false; $('btnPlay').textContent = '▶ Play'; }
function play() {
  if (S.playing) { pause(); return; }
  S.playing = true; $('btnPlay').textContent = '❚❚ Pause';
  if (S.cur >= S.steps.length - 1) S.cur = -1;
  const go = () => { if (!S.playing) return; if (S.cur >= S.steps.length - 1) { pause(); return; } show(S.cur + 1); S.timer = setTimeout(go, +$('speed').value); };
  go();
}
function initToy() {
  const opt = P => `<option value="${P.join(',')}">G = (${P[0]}, ${P[1]}) · order ${ORD.get(P.join(','))}</option>`;
  $('base').innerHTML = ALLPTS.map(opt).join(''); $('base').value = '1,5';
  $('sBase').innerHTML = $('base').innerHTML; $('sBase').value = '6,6';
  $('codeListing').textContent = TOY_SRC; $('codeLines').textContent = 'toy-ecc.js · ' + TOY_SRC.trim().split('\n').length + ' lines';
  $('codeOut').textContent = toyProgramOutput();
  $('copyCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText(TOY_SRC); $('copyCode').textContent = 'Copied'; } catch (e) { const r = document.createRange(); r.selectNodeContents($('codeListing')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $('copyCode').textContent = 'Selected, copy by hand'; } setTimeout(() => $('copyCode').textContent = 'Copy code', 1800); });
  ['k', 'base', 'method'].forEach(id => $(id).addEventListener('change', recompute));
  $('btnPlay').addEventListener('click', () => { if (!S.steps.length) recompute(); play(); });
  $('btnPrev').addEventListener('click', () => { pause(); show(S.cur - 1); });
  $('btnNext').addEventListener('click', () => { pause(); show(S.cur + 1); });
  recompute();
}
function toyProgramOutput() {
  const lines = ['G on the curve? ' + toy.onCurve([1, 5])]; let R = null;
  for (let i = 1; i <= 6; i++) { R = toy.add(R, [1, 5]).R; lines.push(`${i}G = ${R ? `(${R[0]}, ${R[1]})` : 'O'}`); }
  lines.push(`TOY PUBLIC KEY Q = kG = (${R[0]}, ${R[1]})`); return lines.join('\n');
}

/* ----- real-number picture ----- */
function drawReal() {
  const W = 560, H = 360, m = { l: 34, r: 12, t: 10, b: 24 }, x0 = -2.2, x1 = 3.6, y0 = -7.5, y1 = 7.5;
  const sx = x => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r), sy = y => m.t + (y1 - y) / (y1 - y0) * (H - m.t - m.b);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Curve y² = x³ + 7 over the real numbers' });
  const cp = svgEl('clipPath', { id: 'rcclip' }, svg); svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, cp);
  for (let x = -2; x <= 3; x++) { svgEl('line', { x1: sx(x), x2: sx(x), y1: m.t, y2: H - m.b, class: 'gr' }, svg); const t = svgEl('text', { x: sx(x), y: H - 8, 'text-anchor': 'middle', class: 'lbl' }, svg); t.textContent = x; }
  for (let y = -6; y <= 6; y += 3) { svgEl('line', { x1: m.l, x2: W - m.r, y1: sy(y), y2: sy(y), class: y === 0 ? 'ax' : 'gr' }, svg); const t = svgEl('text', { x: m.l - 6, y: sy(y) + 3.5, 'text-anchor': 'end', class: 'lbl' }, svg); t.textContent = y; }
  const xmin = -Math.cbrt(7), up = [], dn = [];
  for (let i = 0; i <= 300; i++) { const x = xmin + (x1 - xmin) * i / 300, y = Math.sqrt(Math.max(0, x ** 3 + 7)); up.push([sx(x), sy(y)]); dn.push([sx(x), sy(-y)]); }
  const g = svgEl('g', { 'clip-path': 'url(#rcclip)' }, svg);
  [up, dn].forEach(a => svgEl('polyline', { points: a.map(p => p.join(',')).join(' '), style: 'fill:none;stroke:var(--ink);stroke-width:2.2' }, g));
  const mode = $('rcMode').value, px = +$('rcPx').value; let qx = +$('rcQx').value;
  const P = [px, Math.sqrt(px ** 3 + 7)]; let Q = mode === 'dbl' ? P : [qx, -Math.sqrt(qx ** 3 + 7)];
  if (mode === 'add' && Math.abs(P[0] - Q[0]) < 0.06) { Q = [P[0] + 0.06, -Math.sqrt((P[0] + 0.06) ** 3 + 7)]; }
  const lam = mode === 'dbl' ? 3 * P[0] ** 2 / (2 * P[1]) : (Q[1] - P[1]) / (Q[0] - P[0]);
  const x3 = lam * lam - P[0] - Q[0], y3 = P[1] + lam * (x3 - P[0]), R = [x3, -y3];
  const ln = (x) => P[1] + lam * (x - P[0]);
  svgEl('line', { x1: sx(x0), y1: sy(ln(x0)), x2: sx(x1), y2: sy(ln(x1)), style: 'stroke:var(--s2);stroke-width:1.8' }, g);
  svgEl('line', { x1: sx(x3), y1: sy(y3), x2: sx(x3), y2: sy(-y3), style: 'stroke:var(--s3);stroke-width:1.5;stroke-dasharray:4 4' }, g);
  const dot = (p, fill, r, label, hollow) => { svgEl('circle', { cx: sx(p[0]), cy: sy(p[1]), r, style: hollow ? `fill:var(--panel);stroke:${fill};stroke-width:2.4` : `fill:${fill};stroke:var(--panel);stroke-width:2`, 'data-tip': `${label} = (${p[0].toFixed(3)}, ${p[1].toFixed(3)})` }, g); const t = svgEl('text', { x: sx(p[0]) + 10, y: sy(p[1]) - 8, style: 'font-size:12px;font-weight:600;fill:var(--ink)' }, g); t.textContent = label; };
  dot(P, 'var(--s1)', 6.5, 'P'); if (mode === 'add') dot(Q, 'var(--s1)', 6.5, 'Q');
  dot([x3, y3], 'var(--s3)', 6.5, mode === 'add' ? '−(P+Q)' : '−2P', true); dot(R, 'var(--s3)', 7, mode === 'add' ? 'P+Q' : '2P');
  $('realCurve').innerHTML = ''; $('realCurve').appendChild(svg);
  $('rcCap').innerHTML = mode === 'add' ? `Orange line through P and Q (slope λ = ${lam.toFixed(3)}); it meets the curve a third time at the hollow green point; reflecting across the x axis gives P + Q = (${R[0].toFixed(3)}, ${R[1].toFixed(3)}).` : `Orange tangent at P (slope λ = ${lam.toFixed(3)}); its second intersection is the hollow green point; reflecting gives 2P = (${R[0].toFixed(3)}, ${R[1].toFixed(3)}).`;
  $('rcQx').closest('label').hidden = mode === 'dbl';
}
function initReal() { ['rcMode', 'rcPx', 'rcQx'].forEach(id => $(id).addEventListener('input', drawReal)); drawReal(); }
/* ================= SECTION 2: statistics ================= */
function initToyStats() {
  const draw = () => {
    const G = $('sBase').value.split(',').map(Number), n = toy.order(G);
    const orbit = []; let R = null; for (let i = 1; i <= n; i++) { R = toy.add(R, G).R; orbit.push(R); }
    const aff = orbit.filter(Boolean), cx = Array(17).fill(0), cy = Array(17).fill(0);
    aff.forEach(P => { cx[P[0]]++; cy[P[1]]++; });
    const bx = cx.map((v, i) => ({ v, xl: i, tip: `x = ${i}: ${v} ${v === 1 ? 'point' : 'points'}` })), by = cy.map((v, i) => ({ v, xl: i, tip: `y = ${i}: ${v} ${v === 1 ? 'point' : 'points'}` }));
    const ymax = Math.max(2, ...cx, ...cy);
    barChart($('toyHistX'), bx, { W: 360, H: 220, ymax, xevery: 2, xt: 'value of x', yt: 'frequency', ref: aff.length / 17, aria: 'Histogram of x' });
    barChart($('toyHistY'), by, { W: 360, H: 220, ymax, xevery: 2, color: 'var(--s2)', xt: 'value of y', yt: 'frequency', ref: aff.length / 17, aria: 'Histogram of y' });
    const ks = Array.from({ length: 40 }, (_, i) => i + 1), pts = ks.map(k => { const P = toy.mul(G, k); return P ? [k, P[0]] : null; }).filter(Boolean);
    lineChart($('toyScatter'), [{ name: 'x(kG)', color: 'var(--s1)', pts, line: false, r: 3.6, tip: p => `k = ${p[0]}, x(kG) = ${p[1]}` }], { W: 360, H: 220, xmin: 0, xmax: 41, ymin: 0, ymax: 16, xticks: [0, 10, 20, 30, 40], xt: 'k', yt: 'x(kG)', yfmt: v => v });
    // facts
    const xsAll = []; const ksAll = []; for (let k = 1; k < n; k++) { const P = toy.mul(G, k); xsAll.push(P[0]); ksAll.push(k); }
    const ysAll = []; for (let k = 1; k < n; k++) ysAll.push(toy.mul(G, k)[1]);
    let sym = 0; for (let k = 1; k < n; k++) if (toy.mul(G, k)[0] === toy.mul(G, n - k)[0]) sym++;
    let period = true; for (let k = 1; k < 20; k++) { const a = toy.mul(G, k), b = toy.mul(G, k + n); if (!(a === null ? b === null : (b && a[0] === b[0] && a[1] === b[1]))) period = false; }
    // avalanche on the 5-bit encoding of x for k and k xor 2^j (indices taken mod n), averaged
    let tot = 0, cnt = 0; const pop = v => { let c = 0; while (v) { c += v & 1; v >>= 1; } return c; };
    for (let k = 1; k < 2 * n; k++) for (let j = 0; j < 4; j++) { const A = toy.mul(G, k), B = toy.mul(G, k ^ (1 << j)); if (A && B) { tot += pop(A[0] ^ B[0]); cnt++; } }
    const r = xsAll.length > 2 ? L.pearson(ksAll, xsAll) : NaN, sp = xsAll.length > 2 ? L.spearman(ksAll, xsAll) : NaN;
    const dx = cx.filter(v => v > 0).length, dy = cy.filter(v => v > 0).length;
    const rows = [
      ['Order of G (period of k ↦ kG)', `${n}  (so nG = O and (k + n)G = kG: ${period ? 'verified' : 'failed'})`],
      ['Distinct points reached', `${aff.length} affine points + O`],
      ['Distinct x values', `${dx} of 17 possible (the others are not the x coordinate of any curve point)`],
      ['Distinct y values', `${dy} of 17 possible`],
      ['Mirror symmetry x(kG) = x((n − k)G)', `${sym} values of k out of ${n - 1}`],
      ['Pearson / Spearman, k against x(kG)', isNaN(r) ? 'too few points' : `${r.toFixed(3)} / ${sp.toFixed(3)} for k = 1…${n - 1} (short, periodic sequence: sign and size say little)`],
      ['Avalanche: flip 1 low bit of k, count the changed bits of x (5-bit encoding)', cnt ? `${(tot / cnt).toFixed(2)} of 5 (a random 5-bit value would give 2.50)` : 'n/a'],
    ];
    $('toyFacts').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]}</td></tr>`).join('');
    $('toyFactsLine').textContent = `Subgroup of order ${n}${n === 18 ? ': G generates the whole group' : ''}.`;
  };
  $('sBase').addEventListener('change', draw); draw();
}

function initBrute() {
  const G = [1, 5], n = 9; const opts = []; let R = null;
  for (let k = 1; k < n; k++) { R = toy.add(R, G).R; opts.push(`<option value="${R.join(',')}">Q = (${R[0]}, ${R[1]})</option>`); }
  $('bfQ').innerHTML = opts.join(''); $('bfQ').value = '5,8';
  $('btnBF').addEventListener('click', () => {
    const Q = $('bfQ').value.split(',').map(Number); let T = null, steps = 0, found = null;
    for (let k = 1; k <= 18 && found === null; k++) { T = toy.add(T, G).R; steps++; if (T && T[0] === Q[0] && T[1] === Q[1]) found = k; }
    const sec = Math.pow(2, 128), yrs = sec / 1e18 / 31557600;
    $('bfOut').innerHTML = `Trying k = 1, 2, 3, … finds <b>k = ${found}</b> after <b>${steps}</b> additions. The toy group has ${n} elements, so at most ${n - 1} attempts are needed.<br>On secp256k1 the best generic attack (Pollard's rho) needs about √n ≈ 2<sup>128</sup> ≈ ${sec.toExponential(2)} group operations. Even at 10<sup>18</sup> operations per second that is about ${yrs.toExponential(1)} years.`;
  });
  $('btnBF').click();
}

/* ----- secp256k1 experiment ----- */
const SECP = { res: null };
async function runSecp() {
  const N = +$('sN').value, mode = $('sMode').value, seed = +$('sSeed').value || 1, btn = $('btnRun');
  btn.disabled = true; const prog = $('sProg'); const T0 = performance.now();
  const r = L.rng(seed), P = L.secp.P, half = 2n ** 255n;
  const xs = [], ys = [], keys = [];
  let bad = 0;
  for (let i = 0; i < N; i++) {
    const k = mode === 'seq' ? BigInt(i + 1) : L.rand256(r), Q = L.secp.mulG(k);
    if (!L.secp.onCurve(Q) || Q[0] >= P) bad++;
    xs.push(L.bytesFromBig(Q[0], 32)); ys.push(Q[1]); keys.push(k);
    if (i % 100 === 99) { prog.textContent = `computing… ${Math.round(100 * i / N)}%`; await tick(); }
  }
  // bit balance
  const bitc = new Array(256).fill(0), bytec = new Array(256).fill(0), hw = [];
  for (const x of xs) { let w = 0; for (let b = 0; b < 32; b++) { const v = x[b]; bytec[v]++; for (let j = 0; j < 8; j++) { const bit = (v >> (7 - j)) & 1; bitc[8 * b + j] += bit; w += bit; } } hw.push(w); }
  const z = bitc.map(c => (c - N / 2) / (Math.sqrt(N) / 2)), out3 = z.filter(v => Math.abs(v) > 3).length, chiBits = z.reduce((s, v) => s + v * v, 0), pBits = L.chi2p(chiBits, 256);
  const E = N * 32 / 256, chiB = bytec.reduce((s, c) => s + (c - E) ** 2 / E, 0), pB = L.chi2p(chiB, 255);
  const evenY = ys.filter(y => y % 2n === 0n).length / N;
  // correlation between index/key and x
  const frac = b => Number(b >> 204n) / 2 ** 52, kx = keys.map((k, i) => mode === 'seq' ? i + 1 : frac(k)), xf = xs.map(x => frac(L.bigFromBytes(x))), yf = ys.map(frac);
  const pr = L.pearson(kx, xf), sp = L.spearman(kx, xf), pry = L.pearson(kx, yf);
  prog.textContent = 'avalanche test…'; await tick();
  // avalanche: single bit flip, ECC vs SHA-256; adjacent keys
  const M = Math.min(N, 800), hdE = [], hdH = [], hdAdj = [];
  const kb = k => L.bytesFromBig(k, 32);
  for (let i = 0; i < M; i++) {
    const k = keys[i]; let k2, tries = 0;
    do { k2 = k ^ (1n << BigInt(Math.floor(r() * 255))); tries++; } while ((k2 === 0n || k2 >= L.secp.N) && tries < 20);
    if (k2 === 0n || k2 >= L.secp.N) continue;
    hdE.push(L.hamming(xs[i], L.bytesFromBig(L.secp.mulG(k2)[0], 32)));
    hdH.push(L.hamming(L.sha256(kb(k)), L.sha256(kb(k2))));
    const Qa = L.secp.mulG(k + 1n); hdAdj.push(L.hamming(xs[i], L.bytesFromBig(Qa[0], 32)));
    if (i % 100 === 99) { prog.textContent = `avalanche… ${Math.round(100 * i / M)}%`; await tick(); }
  }
  // avalanche matrix: 24 input bit positions x 256 output bits
  prog.textContent = 'avalanche matrix…'; await tick();
  const POS = Array.from({ length: 24 }, (_, i) => Math.round(i * 253 / 23)), TR = 24, mat = POS.map(() => new Array(256).fill(0));
  for (let pi = 0; pi < POS.length; pi++) {
    for (let t = 0; t < TR; t++) {
      const k = L.rand256(r), k2 = k ^ (1n << BigInt(POS[pi])); if (k2 === 0n || k2 >= L.secp.N) continue;
      const a = L.bytesFromBig(L.secp.mulG(k)[0], 32), b = L.bytesFromBig(L.secp.mulG(k2)[0], 32);
      for (let by = 0; by < 32; by++) { const d = a[by] ^ b[by]; for (let j = 0; j < 8; j++) mat[pi][8 * by + j] += (d >> (7 - j)) & 1; }
    }
    if (pi % 4 === 3) await tick();
  }
  const matP = mat.map(row => row.map(c => c / TR));
  SECP.res = { N, mode, xs, xf, z, hw, bytec, hdE, hdH, hdAdj, matP, POS, TR, out3, chiBits, pBits, chiB, pB, evenY, pr, sp, pry, bad, ms: performance.now() - T0 };
  drawSecp(); prog.textContent = `done in ${(SECP.res.ms / 1000).toFixed(1)} s`; btn.disabled = false;
}

function drawSecp() {
  const R = SECP.res; if (!R) return; const { N } = R;
  const m = L.mean, s = L.sd, ok = (c) => c ? '<span class="pill ok">consistent</span>' : '<span class="pill no">deviates</span>';
  const hwm = m(R.hw), hws = s(R.hw), eM = m(R.hdE), eS = s(R.hdE), hM = m(R.hdH), hS = s(R.hdH), aM = m(R.hdAdj);
  const rBound = 3 / Math.sqrt(N), yb = 3 * 0.5 / Math.sqrt(N);
  const rows = [
    ['Valid points', `${N - R.bad} of ${N} satisfy y² = x³ + 7 (mod p) and x &lt; p`, 'all', ok(R.bad === 0)],
    ['Bit balance, 256 positions', `${R.out3} positions beyond ±3σ; Σz² = ${R.chiBits.toFixed(0)}, p = ${R.pBits.toFixed(3)}`, '≈ 0.7 positions beyond ±3σ; p uniform on (0, 1)', ok(R.out3 <= 3 && R.pBits > 0.001 && R.pBits < 0.999)],
    ['Byte frequency χ² (255 df)', `χ² = ${R.chiB.toFixed(0)}, p = ${R.pB.toFixed(3)}`, 'χ² ≈ 255 ± 23', ok(R.pB > 0.001 && R.pB < 0.999)],
    ['Hamming weight of x', `mean ${hwm.toFixed(2)}, sd ${hws.toFixed(2)}`, 'mean 128, sd 8', ok(Math.abs(hwm - 128) < 4 * 8 / Math.sqrt(N) && Math.abs(hws - 8) < 1)],
    ['Parity of y', `${(100 * R.evenY).toFixed(1)}% even`, `50% ± ${(100 * yb).toFixed(1)}%`, ok(Math.abs(R.evenY - 0.5) < yb)],
    ['Correlation, input against x', `Pearson ${R.pr.toFixed(3)}, Spearman ${R.sp.toFixed(3)}`, `|r| &lt; ${rBound.toFixed(3)} (3σ)`, ok(Math.abs(R.pr) < rBound && Math.abs(R.sp) < rBound)],
    ['Correlation, input against y', `Pearson ${R.pry.toFixed(3)}`, `|r| &lt; ${rBound.toFixed(3)}`, ok(Math.abs(R.pry) < rBound)],
    ['Avalanche, flip 1 bit of k', `mean ${eM.toFixed(1)}, sd ${eS.toFixed(1)} bits of x (SHA-256: ${hM.toFixed(1)}, ${hS.toFixed(1)})`, '128 ± 8', ok(Math.abs(eM - 128) < 2 && Math.abs(eS - 8) < 1.2)],
    ['Adjacent keys k, k + 1', `mean ${aM.toFixed(1)} bits of x changed`, '128', ok(Math.abs(aM - 128) < 3)],
  ];
  $('secpTable').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td class="mono">${r[1]}</td><td class="small">${r[2]}</td><td>${r[3]}</td></tr>`).join('');
  // bit z chart
  lineChart($('chBits'), [{ name: 'z-score of the bit position', color: 'var(--s1)', pts: R.z.map((v, i) => [i, v]), line: false, r: 2, tip: p => `bit ${p[0]} (from the MSB): z = ${p[1].toFixed(2)}` }], { W: 520, H: 240, xmin: 0, xmax: 255, ymin: -4.5, ymax: 4.5, xticks: [0, 64, 128, 192, 255], hband: [-3, 3], xt: 'bit position of x (0 = most significant)', yt: 'z-score', yfmt: v => v.toFixed(0) });
  // bytes in 16 buckets
  const bk = Array(16).fill(0); R.bytec.forEach((c, v) => bk[v >> 4] += c);
  barChart($('chBytes'), bk.map((v, i) => ({ v, xl: (i * 16).toString(16).toUpperCase().padStart(2, '0'), tip: `byte 0x${(i * 16).toString(16)}–0x${(i * 16 + 15).toString(16)}: ${v}` })), { W: 520, H: 240, ref: N * 32 / 16, ymax: N * 32 / 16 * 1.25, xt: 'byte value (start of bin, hex)', yt: 'frequency' });
  // hamming weight histogram with binomial overlay
  const lo = 96, hi = 160, bw = 4, nb = (hi - lo) / bw, hh = Array(nb).fill(0); R.hw.forEach(w => { const b = Math.floor((w - lo) / bw); if (b >= 0 && b < nb) hh[b]++; });
  const binom = k => Math.exp(lgam(257) - lgam(k + 1) - lgam(257 - k) - 256 * Math.LN2), expect = Array.from({ length: nb }, (_, b) => { let s = 0; for (let k = lo + b * bw; k < lo + (b + 1) * bw; k++) s += binom(k); return s * N; });
  barChart($('chHW'), hh.map((v, b) => ({ v, xl: lo + b * bw, tip: `weight ${lo + b * bw}–${lo + b * bw + bw - 1}: ${v}` })), { W: 520, H: 240, line: expect, xevery: 2, xt: 'number of 1 bits in x', yt: 'frequency', legend: [{ name: 'observed', color: 'var(--s1)' }, { name: 'Binomial(256, ½)', color: 'var(--s2)' }] });
  // avalanche distributions
  const bins = a => { const c = Array(nb).fill(0); a.forEach(w => { const b = Math.floor((w - lo) / bw); if (b >= 0 && b < nb) c[b]++; }); return c.map(v => v / a.length); };
  const th = Array.from({ length: nb }, (_, b) => expect[b] / N);
  lineChart($('chAv'), [
    { name: 'point multiplication on secp256k1', color: 'var(--s1)', pts: bins(R.hdE).map((v, b) => [lo + b * bw + bw / 2, v]), tip: p => `${p[0] - 2}–${p[0] + 1} bits changed: ${(100 * p[1]).toFixed(1)}%` },
    { name: 'SHA-256', color: 'var(--s2)', pts: bins(R.hdH).map((v, b) => [lo + b * bw + bw / 2, v]), tip: p => `${p[0] - 2}–${p[0] + 1} bits changed: ${(100 * p[1]).toFixed(1)}%` },
    { name: 'Ideal Binomial(256, ½)', color: 'var(--muted)', dash: true, pts: th.map((v, b) => [lo + b * bw + bw / 2, v]), tip: () => '' }],
    { W: 520, H: 240, xmin: lo, xmax: hi, ymin: 0, ymax: 0.25, xticks: [96, 112, 128, 144, 160], xt: 'bits of x changed (out of 256)', yt: 'share of trials', yfmt: v => (100 * v).toFixed(0) + '%' });
  drawSecpCanvas();
}
function lgam(x) { // log gamma for binomial pmf (Lanczos)
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const cj of c) s += cj / ++y; return -t + Math.log(2.5066282746310005 * s / x);
}
function drawSecpCanvas() {
  const R = SECP.res; if (!R) return;
  const ink = cssVar('--ink2'), grid = cssVar('--grid'), ax = cssVar('--rule2'), blue = cssVar('--s1');
  // scatter
  let c = $('chScatter'), g = c.getContext('2d'); const W = c.width, H = c.height, mg = { l: 44, r: 12, t: 10, b: 34 };
  g.clearRect(0, 0, W, H); g.font = '11px ' + cssVar('--f-mono'); g.fillStyle = ink; g.strokeStyle = grid; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = mg.t + (H - mg.t - mg.b) * (1 - i / 4); g.beginPath(); g.moveTo(mg.l, y); g.lineTo(W - mg.r, y); g.stroke(); g.textAlign = 'right'; g.fillText((i / 4).toFixed(2), mg.l - 6, y + 4); }
  const n = Math.min(R.N, 1500); g.fillStyle = blue; g.globalAlpha = 0.65;
  for (let i = 0; i < n; i++) { const x = mg.l + (W - mg.l - mg.r) * i / (n - 1), y = mg.t + (H - mg.t - mg.b) * (1 - R.xf[i]); g.fillRect(x - 1, y - 1, 2.2, 2.2); }
  g.globalAlpha = 1; g.fillStyle = ink; g.textAlign = 'center'; g.fillText(R.mode === 'seq' ? 'input k = 1, 2, 3, … (index)' : 'sample index i (random key kᵢ)', (W + mg.l) / 2, H - 6);
  g.save(); g.translate(12, H / 2); g.rotate(-Math.PI / 2); g.fillText('x(kG) / p', 0, 0); g.restore();
  g.strokeStyle = ax; g.strokeRect(mg.l, mg.t, W - mg.l - mg.r, H - mg.t - mg.b);
  // heatmap
  c = $('chHeat'); g = c.getContext('2d'); const HW = c.width, HH = c.height, rows = R.matP.length, top = 8, left = 34, hh = HH - 56, cw = (HW - left - 6) / 256, rh = hh / rows;
  g.clearRect(0, 0, HW, HH); g.font = '10.5px ' + cssVar('--f-mono'); g.fillStyle = ink;
  R.matP.forEach((row, i) => { row.forEach((p, j) => { g.fillStyle = heatColor(p); g.fillRect(left + j * cw, top + i * rh, Math.ceil(cw) + 0.3, Math.ceil(rh) - 1); }); g.fillStyle = ink; g.textAlign = 'right'; if (i % 4 === 0) g.fillText('k' + R.POS[i], left - 4, top + i * rh + rh / 2 + 4); });
  g.textAlign = 'center'; g.fillStyle = ink; g.fillText('output bit of x (0 … 255)', left + 128 * cw, top + hh + 16);
  const lx = left + 40 * cw, lw = 176 * cw; for (let i = 0; i < 100; i++) { g.fillStyle = heatColor(0.2 + 0.6 * i / 99); g.fillRect(lx + lw * i / 100, top + hh + 24, lw / 100 + 1, 10); }
  g.fillStyle = ink; g.textAlign = 'right'; g.fillText('0.2', lx - 4, top + hh + 33); g.textAlign = 'left'; g.fillText('0.8  (grey = 0.5, ideal)', lx + lw + 4, top + hh + 33);
}
function initSecp() {
  $('btnRun').addEventListener('click', runSecp);
}

/* ================= AVVIO ================= */
async function boot() {
  initToy(); initReal(); initToyStats(); initBrute(); initSecp();
  await tick(); await runSecp();
  const R = SECP.res;
  if (R) { $('t-av').textContent = `${L.mean(R.hdE).toFixed(1)} / 256`; $('t-chi').textContent = `p = ${R.pB.toFixed(3)}`; }
  window.__ready = true;
}
boot().catch(e => { console.error(e); window.__err = String(e && e.stack || e); });
