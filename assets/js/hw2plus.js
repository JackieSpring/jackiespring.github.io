/* Homework 2+: toy ECC cipher on secp256k1, Caesar cipher, statistical and search attacks.
   Requires ecc-lib.js and hw2plus-data.js (CORPUS, REF_UNI, REF_BI, REF_TRI, COMMON_WORDS, TEST_TEXT). */
/* ================= PAGE: helpers and chart primitives ================= */
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
    svgEl('rect', { x: m.l + i * bw + gap / 2, y: m.t + ih - h, width: Math.max(bw - gap, 0.6), height: Math.max(h, 0), style: `fill:${b.color || o.color || 'var(--s1)'}`, 'data-tip': b.tip || '' }, svg);
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

/* ================= Toy ECC encryption, Caesar, comparison ================= */
const SC = L.secp, GP = [SC.GX, SC.GY], enc = L.enc, dec = b => new TextDecoder().decode(b);
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const hx = u8 => L.toHex(u8);
const fmtDur = s => { if (!isFinite(s)) return '∞'; if (s < 1e-3) return (s * 1e6).toFixed(0) + ' µs'; if (s < 1) return (s * 1e3).toFixed(0) + ' ms'; if (s < 120) return s.toFixed(1) + ' s'; if (s < 7200) return (s / 60).toFixed(1) + ' min'; if (s < 172800) return (s / 3600).toFixed(1) + ' h'; if (s < 3.15e7 * 2) return (s / 86400).toFixed(1) + ' days'; const y = s / 31557600; return y < 1e6 ? y.toFixed(1) + ' years' : y.toExponential(1) + ' years'; };

function randBits(b) { // uniform integer with exactly b bits (top bit set), b <= 256
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(b / 8))); let v = L.bigFromBytes(bytes) & ((1n << BigInt(b)) - 1n); v |= 1n << BigInt(b - 1); return b === 256 ? v % SC.N || 1n : v;
}
function keystream(xBig, len) {
  const x = L.bytesFromBig(xBig, 32), out = new Uint8Array(len); let off = 0, c = 0;
  while (off < len) { const inb = new Uint8Array(36); inb.set(x); new DataView(inb.buffer).setUint32(32, c++); const h = L.sha256(inb); for (let i = 0; i < 32 && off < len; i++) out[off++] = h[i]; }
  return out;
}
function eccEncrypt(msg, Q, r) { const R = SC.mulG(r), S = SC.mulPoint(r, Q), ks = keystream(S[0], msg.length); return { R, S, ks, ct: msg.map((b, i) => b ^ ks[i]) }; }
function eccDecrypt(R, ct, d) { if (!SC.onCurve(R)) throw new Error('R is not on the curve'); const S = SC.mulPoint(d, R), ks = keystream(S[0], ct.length); return { S, ks, pt: ct.map((b, i) => b ^ ks[i]) }; }

function caesar(text, k, decrypt) {
  k = (((decrypt ? -k : k) % 26) + 26) % 26;
  return text.replace(/[A-Za-z]/g, c => { const base = c < 'a' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - base + k) % 26 + base); });
}

/* ---------- ECC demo ---------- */
const E = { d: null, Q: null, b: 20, last: null };
function eccNewKeys() { E.b = +$('eccBits').value; E.d = randBits(E.b); E.Q = SC.mulG(E.d); }
function renderEcc() {
  const msgTxt = $('msg').value, msg = enc(msgTxt), b = E.b, dl = (t, x) => `<dl class="steprow"><dt>${t}</dt><dd>${x}</dd></dl>`;
  const r = randBits(256), res = eccEncrypt(msg, E.Q, r), dr = eccDecrypt(res.R, res.ct, E.d), ok = dec(dr.pt) === msgTxt;
  E.last = { msg, r, res }; const h32 = v => L.hex(v);
  $('eccOut').innerHTML =
    dl('1 · Bob: key pair<div class="kind">key generation</div>', `<div class="small">Private key d, chosen in a restricted range: ${b} bits, so 2<sup>${b - 1}</sup> ≤ d &lt; 2<sup>${b}</sup>.</div><div class="mono">d = ${E.d} <span class="muted">(0x${E.d.toString(16)})</span></div><div class="small" style="margin-top:6px">Public key Q = d·G, published:</div><div class="hex mono">Qx = ${h32(E.Q[0])}<br>Qy = ${h32(E.Q[1])}</div>`) +
    dl('2 · Alice: encrypt<div class="kind">encryption</div>', `<div class="small">Message: <span class="mono">"${esc(msgTxt)}"</span> = ${msg.length} bytes <span class="hex mono">${hx(msg)}</span></div><div class="small" style="margin-top:6px">Fresh ephemeral key r (256 bits, from the browser's secure random generator):</div><div class="hex mono">${h32(r)}</div><div class="small" style="margin-top:6px">R = r·G (sent in the clear) :</div><div class="hex mono">Rx = ${h32(res.R[0])}<br>Ry = ${h32(res.R[1])}</div><div class="small" style="margin-top:6px">Shared secret S = r·Q (never sent); only its x-coordinate is used:</div><div class="hex mono">Sx = ${h32(res.S[0])}</div><div class="small" style="margin-top:6px">Key stream K = SHA-256(Sx ‖ 0) ‖ SHA-256(Sx ‖ 1) ‖ … cut to the message length:</div><div class="hex mono">${hx(res.ks)}</div><div class="small" style="margin-top:6px">Ciphertext c = m ⊕ K, sent together with R:</div><div class="hex mono"><b>${hx(res.ct)}</b></div>`) +
    dl('3 · Bob: decrypt<div class="kind">decryption</div>', `<div class="small">Bob rebuilds the shared secret with his private key: S′ = d·R = d·(r·G) = r·(d·G) = r·Q = S.</div><div class="small">x(S′) equals x(S): <span class="pill ${dr.S[0] === res.S[0] ? 'ok' : 'no'}">${dr.S[0] === res.S[0] ? 'yes' : 'no'}</span></div><div class="small" style="margin-top:6px">Same key stream, then m = c ⊕ K:</div><div class="mono"><b>"${esc(dec(dr.pt))}"</b> &nbsp; ${ok ? '<span class="pill ok">matches the original message</span>' : '<span class="pill no">mismatch</span>'}</div>`);
}
function initEccDemo() {
  eccNewKeys(); renderEcc();
  $('btnKeygen').addEventListener('click', () => { eccNewKeys(); renderEcc(); });
  $('btnEnc').addEventListener('click', renderEcc); $('eccBits').addEventListener('change', () => { eccNewKeys(); renderEcc(); });
  $('msg').addEventListener('input', () => { renderEcc(); renderCaesar(); });
}

/* ---------- Caesar demo ---------- */
function renderCaesar() {
  const k = +$('cKey').value, m = $('msg').value; $('cKeyV').textContent = k;
  const c = caesar(m, k, false), d = caesar(c, k, true);
  $('cOut').innerHTML = `<dl class="steprow"><dt>Plaintext</dt><dd class="mono">${esc(m)}</dd></dl><dl class="steprow"><dt>Encrypt: c = (m + ${k}) mod 26</dt><dd class="mono"><b>${esc(c)}</b></dd></dl><dl class="steprow"><dt>Decrypt: m = (c − ${k}) mod 26</dt><dd class="mono"><b>${esc(d)}</b> ${d === m ? '<span class="pill ok">matches</span>' : '<span class="pill no">mismatch</span>'}</dd></dl>`;
  // wheel
  const R1 = 108, R2 = 78, cx = 125, cy = 125, svg = svgEl('svg', { viewBox: '0 0 250 250', role: 'img', 'aria-label': 'Caesar wheel' });
  svgEl('circle', { cx, cy, r: 122, style: 'fill:var(--panel2);stroke:var(--rule2)' }, svg); svgEl('circle', { cx, cy, r: 62, style: 'fill:var(--panel);stroke:var(--rule2)' }, svg);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * 2 * Math.PI - Math.PI / 2, a2 = ((i - k) / 26) * 2 * Math.PI - Math.PI / 2;
    const t1 = svgEl('text', { x: cx + R1 * Math.cos(a), y: cy + R1 * Math.sin(a) + 4, 'text-anchor': 'middle', style: 'font-size:12px;font-weight:600;fill:var(--ink)' }, svg); t1.textContent = ALPHA[i];
    const t2 = svgEl('text', { x: cx + R2 * Math.cos(a), y: cy + R2 * Math.sin(a) + 4, 'text-anchor': 'middle', style: 'font-size:12px;fill:var(--s2);font-weight:600' }, svg); t2.textContent = ALPHA[(i + k) % 26];
  }
  const t = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', style: 'font-size:12px' }, svg); t.textContent = 'outer: plain'; const t3 = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', style: 'font-size:12px;fill:var(--s2)' }, svg); t3.textContent = 'inner: cipher';
  $('cWheel').innerHTML = ''; $('cWheel').appendChild(svg);
  const rows = []; for (let j = 0; j < 26; j++) rows.push(`<tr${j === k ? ' class="cur"' : ''}><td class="num mono">${j}</td><td class="mono">${esc(caesar(c, j, true))}</td></tr>`);
  $('cBrute').innerHTML = rows.join('');
}
function initCaesarDemo() { $('cKey').addEventListener('input', renderCaesar); renderCaesar(); }

/* ---------- comparison statistics ---------- */
function ic(counts, n) { let s = 0; for (const c of counts) s += c * (c - 1); return s / (n * (n - 1)); }
function sampleLetters(len, r) { const T = TEST_TEXT.replace(/ /g, ''); const i = Math.floor(r() * (T.length - len)); return T.slice(i, i + len); }
async function runCompare() {
  const n = +$('cmpLen').value, r = L.rng(7), plain = sampleLetters(n, r), key = 7;
  const cText = caesar(plain, key, false), cc = Array(26).fill(0), pc = Array(26).fill(0); for (let i = 0; i < n; i++) { cc[ALPHA.indexOf(cText[i])]++; pc[ALPHA.indexOf(plain[i])]++; }
  const d = randBits(20), Q = SC.mulG(d), r1 = randBits(256), a = eccEncrypt(enc(plain), Q, r1), r2 = randBits(256), a2 = eccEncrypt(enc(plain), Q, r2);
  const bc = Array(256).fill(0); a.ct.forEach(v => bc[v]++); const E256 = n / 256;
  const chiE = bc.reduce((s, c) => s + (c - E256) ** 2 / E256, 0), pE = L.chi2p(chiE, 255);
  const chiC = cc.reduce((s, c) => s + (c - n / 26) ** 2 / (n / 26), 0), pC = L.chi2p(chiC, 25);
  const icC = ic(cc, n), icP = ic(pc, n), icE = ic(bc, n);
  const eIdx = []; for (let i = 0; i < n; i++) if (plain[i] === 'E') eIdx.push(i);
  const distE = new Set(eIdx.map(i => a.ct[i])).size, distC = new Set(eIdx.map(i => cText[i])).size;
  const same = (x, y) => x.every((v, i) => v === y[i]);
  const rows = [
    ['Symbols used', '26 letters', '256 byte values', 'Caesar keeps the alphabet; the ECC scheme outputs raw bytes'],
    ['Chi-square test against a uniform distribution', `χ² = ${chiC.toFixed(0)} (25 df), p = ${pC < 1e-4 ? '< 0.0001' : pC.toFixed(4)}`, `χ² = ${chiE.toFixed(0)} (255 df), p = ${pE.toFixed(3)}`, 'Caesar ciphertext is far from uniform; the ECC ciphertext cannot be told apart from random bytes'],
    ['Index of coincidence', `${icC.toFixed(4)} (plaintext ${icP.toFixed(4)}; uniform 26 letters = 0.0385)`, `${icE.toFixed(4)} (uniform bytes = ${(1 / 256).toFixed(4)})`, 'Caesar preserves the IC exactly: a fingerprint of the language survives encryption'],
    [`Different ciphertext symbols for the ${eIdx.length} letters “E”`, `${distC}`, `${distE}`, 'Caesar maps each letter to one symbol; the key stream changes at every position'],
    ['Encrypt the same message twice', `identical (${same(enc(cText), enc(caesar(plain, key, false)))})`, `different (${!same(a.ct, a2.ct)}); R differs too`, 'Caesar is deterministic. The ECC scheme is randomised by the fresh r']
  ];
  $('cmpTable').innerHTML = rows.map(x => `<tr><td>${x[0]}</td><td class="mono">${x[1]}</td><td class="mono">${x[2]}</td><td class="small">${x[3]}</td></tr>`).join('');
  barChart($('cmpCaesar'), cc.map((v, i) => ({ v: v / n * 100, xl: ALPHA[i], tip: `${ALPHA[i]}: ${(v / n * 100).toFixed(1)}% of the ciphertext` })), { W: 520, H: 230, line: REF_UNI.map(v => v * 100), color: 'var(--s1)', xt: 'ciphertext letter', yt: '% of ciphertext', yfmt: v => v.toFixed(0), legend: [{ name: 'Caesar ciphertext (key 7)', color: 'var(--s1)' }, { name: 'English letter frequencies, unshifted', color: 'var(--s2)' }] });
  const bk = Array(32).fill(0); bc.forEach((c, v) => bk[v >> 3] += c);
  barChart($('cmpEcc'), bk.map((v, i) => ({ v, xl: (i * 8).toString(16).toUpperCase().padStart(2, '0'), tip: `bytes 0x${(i * 8).toString(16)}–0x${(i * 8 + 7).toString(16)}: ${v}` })), { W: 520, H: 230, ref: n / 32, ymax: Math.max(...bk, n / 32) * 1.3, xevery: 2, color: 'var(--s1)', xt: 'ciphertext byte (hex bucket start)', yt: 'count' });
  return { pC, pE, icC, icE };
}
function initCompare() { $('btnCmp').addEventListener('click', runCompare); }
/* ================= Statistical cryptanalysis of Caesar ================= */
function decodeTable(t) { const bin = atob(t.b64), out = new Float64Array(bin.length), step = (t.hi - t.lo) / 255; for (let i = 0; i < bin.length; i++) out[i] = t.lo + bin.charCodeAt(i) * step; return out; }
const LB = decodeTable(REF_BI), LT = decodeTable(REF_TRI), LOGF = REF_UNI.map(Math.log), WORDSET = new Set(COMMON_WORDS);
const METHODS = [
  { id: 'dict', name: 'Exhaustive search + word check', color: 'var(--s4)', higher: true },
  { id: 'peak', name: 'Most frequent letter = E', color: 'var(--s5)', higher: true },
  { id: 'chi', name: 'Chi-square on letter frequencies', color: 'var(--s1)', higher: false },
  { id: 'll1', name: 'Unigram log-likelihood', color: 'var(--s6)', higher: true },
  { id: 'bi', name: 'Bigram score', color: 'var(--s2)', higher: true },
  { id: 'tri', name: 'Trigram score', color: 'var(--s3)', higher: true },
];
const toIdx = s => { const o = []; for (const ch of s) { const v = ch.charCodeAt(0) - 65; if (v >= 0 && v < 26) o.push(v); } return Uint8Array.from(o); };
function scoreAll(method, text) { // returns array of 26 scores, key k means: plaintext = ciphertext shifted back by k
  const x = toIdx(text.toUpperCase()), n = x.length, out = new Array(26).fill(0);
  if (method === 'dict') {
    const up = text.toUpperCase();
    for (let k = 0; k < 26; k++) { const d = caesar(up, k, true); let toks = d.match(/[A-Z]+/g) || []; if (toks.length > 2) toks = toks.slice(1, -1); out[k] = toks.reduce((s, w) => s + (WORDSET.has(w) ? w.length : 0), 0); }
    return out;
  }
  const cc = new Array(26).fill(0); for (const v of x) cc[v]++;
  for (let k = 0; k < 26; k++) {
    if (method === 'chi') { let s = 0; for (let j = 0; j < 26; j++) { const e = n * REF_UNI[j]; s += (cc[(j + k) % 26] - e) ** 2 / e; } out[k] = s; }
    else if (method === 'peak') out[k] = cc[(4 + k) % 26];
    else if (method === 'll1') { let s = 0; for (let j = 0; j < 26; j++) s += cc[(j + k) % 26] * LOGF[j]; out[k] = s; }
    else if (method === 'bi') { let s = 0; for (let i = 0; i + 1 < n; i++) s += LB[((x[i] - k + 26) % 26) * 26 + (x[i + 1] - k + 26) % 26]; out[k] = s; }
    else if (method === 'tri') { let s = 0; for (let i = 0; i + 2 < n; i++) s += LT[((x[i] - k + 26) % 26) * 676 + ((x[i + 1] - k + 26) % 26) * 26 + (x[i + 2] - k + 26) % 26]; out[k] = s; }
  }
  return out;
}
function pickKey(method, text) { // {key, tie, scores, ranked}
  const m = METHODS.find(q => q.id === method), sc = scoreAll(method, text), sign = m.higher ? 1 : -1;
  const ranked = sc.map((v, k) => ({ k, v })).sort((a, b) => sign * (b.v - a.v) || a.k - b.k);
  const tie = Math.abs(ranked[0].v - ranked[1].v) < 1e-9; return { key: ranked[0].k, tie, scores: sc, ranked };
}

/* ----- reference model chart ----- */
function drawCorpus() {
  const T = TEST_TEXT.replace(/ /g, ''), cnt = Array(26).fill(0); for (const ch of T) cnt[ch.charCodeAt(0) - 65]++;
  const mod = cnt.map(c => c / T.length);
  lineChart($('corpusChart'), [
    { name: `Reference (training) corpus: ${CORPUS.name}, ${(CORPUS.letters / 1e6).toFixed(2)} million letters`, color: 'var(--s1)', pts: REF_UNI.map((v, i) => [i, v * 100]), dots: true, tip: p => `${ALPHA[p[0]]}: ${p[1].toFixed(2)}%` },
    { name: `Test text: modern technical English, ${(T.length / 1000).toFixed(0)} thousand letters`, color: 'var(--s2)', pts: mod.map((v, i) => [i, v * 100]), dots: true, tip: p => `${ALPHA[p[0]]}: ${p[1].toFixed(2)}%` }],
    { W: 640, H: 250, xmin: -0.5, xmax: 25.5, ymin: 0, ymax: 14, xticks: Array.from({ length: 26 }, (_, i) => i), xfmt: v => ALPHA[v], xt: 'letter', yt: 'frequency (%)', yfmt: v => v.toFixed(0) });
  const uni = (Math.log2(26) - CORPUS.H1), u = h => Math.log2(26) / (Math.log2(26) - h);
  $('corpusInfo').innerHTML = `<tr><td>Single-letter model</td><td class="num mono">${CORPUS.H1.toFixed(2)}</td><td class="num mono">${(Math.log2(26) - CORPUS.H1).toFixed(2)}</td><td class="num mono">${u(CORPUS.H1).toFixed(1)}</td></tr><tr><td>Bigram model</td><td class="num mono">${CORPUS.H2.toFixed(2)}</td><td class="num mono">${(Math.log2(26) - CORPUS.H2).toFixed(2)}</td><td class="num mono">${u(CORPUS.H2).toFixed(1)}</td></tr><tr><td>Trigram model</td><td class="num mono">${CORPUS.H3.toFixed(2)}</td><td class="num mono">${(Math.log2(26) - CORPUS.H3).toFixed(2)}</td><td class="num mono">${u(CORPUS.H3).toFixed(1)}</td></tr>`;
}

/* ----- interactive attack ----- */
const ATK = { trueKey: null };
const ITALIAN = 'Il cifrario di Cesare e uno dei piu antichi metodi di cifratura conosciuti. Ogni lettera del messaggio viene sostituita con quella che si trova un certo numero di posizioni piu avanti nell alfabeto. Con sole ventisei chiavi possibili, e facilissimo da violare con un attacco a forza bruta oppure con l analisi delle frequenze delle lettere.';
function runAttackUI() {
  const ct = $('ctIn').value, method = $('atkMethod').value, m = METHODS.find(q => q.id === method);
  if (toIdx(ct.toUpperCase()).length < 2) { $('atkOut').innerHTML = '<span class="small">Enter some ciphertext first.</span>'; return; }
  const r = pickKey(method, ct), plain = caesar(ct, r.key, true), top = r.ranked.slice(0, 3);
  const isLL = method === 'll1' || method === 'bi' || method === 'tri', lo = Math.min(...r.scores);
  barChart($('atkChart'), r.scores.map((v, k) => ({ v: isLL ? v - lo : v, xl: k, color: k === r.key ? 'var(--s2)' : 'var(--s1)', tip: `key ${k}: ${method === 'chi' ? v.toFixed(1) : v.toFixed(2)}` })), { W: 520, H: 230, xt: 'candidate key k', yt: method === 'chi' ? 'chi-square (lower is better)' : method === 'dict' ? 'letters in recognised words' : method === 'peak' ? 'count of letter at E' : 'log-likelihood above worst key', yfmt: v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) });
  const gap = (() => { const a = r.ranked[0].v, s = r.ranked[1].v; if (method === 'chi') return s / a >= 3; if (method === 'peak' || method === 'dict') return a >= 1.5 * s && a - s >= 2; return a - s >= 3; })();
  const ok = ATK.trueKey === null ? '' : (r.key === ATK.trueKey && !r.tie ? '<span class="pill ok">matches the key used to encrypt</span>' : '<span class="pill no">wrong key (true key ' + ATK.trueKey + ')</span>');
  const sc = v => method === 'chi' || method === 'peak' || method === 'dict' ? v.toFixed(method === 'chi' ? 1 : 0) : v.toFixed(2);
  $('atkOut').innerHTML = `<div><b>${m.name}</b> picks <span class="mono"><b>k = ${r.key}</b></span> ${ok}${r.tie ? ' <span class="pill warn">tie between several keys</span>' : ''}</div><div class="small" style="margin:6px 0">Best three: ${top.map(t => `k = ${t.k} (${sc(t.v)})`).join(', ')}. ${gap ? '<span class="pill ok">clear margin</span> over the runner-up.' : '<span class="pill warn">narrow margin</span> over the runner-up: the evidence is thin, treat the answer as uncertain.'}</div><div class="eq" style="white-space:pre-wrap">${esc(plain.slice(0, 400))}${plain.length > 400 ? '…' : ''}</div>`;
}
function setCipherInput(plain, key) { ATK.trueKey = key; $('ctIn').value = key === null ? plain : caesar(plain, key, false); runAttackUI(); }
function sampleWindow(len, r) { const T = TEST_TEXT; let i = Math.floor(r() * (T.length - 4 * len - 20)); let j = i, c = 0; while (c < len) { if (T[j] !== ' ') c++; j++; } return T.slice(i, j).trim(); }
function initAttackUI() {
  const rnd = L.rng(99);
  $('btnAtk').addEventListener('click', () => { ATK.trueKey = null; runAttackUI(); });
  $('atkMethod').addEventListener('change', runAttackUI);
  $('btnAtkMsg').addEventListener('click', () => setCipherInput($('msg').value, 7));
  $('btnAtkRand').addEventListener('click', () => setCipherInput(sampleWindow(+$('atkLen').value, rnd), 1 + Math.floor(rnd() * 25)));
  $('btnAtkIt').addEventListener('click', () => setCipherInput(ITALIAN.toUpperCase(), 5));
  $('ctIn').addEventListener('input', () => { ATK.trueKey = null; });
  setCipherInput(sampleWindow(120, L.rng(5)), 11);
}

/* ----- Monte Carlo evaluation ----- */
const MC = { lengths: [5, 10, 15, 20, 30, 50, 100, 200, 500], res: null };
async function runMC() {
  const M = +$('mcM').value, rnd = L.rng(2026), btn = $('btnMC'); btn.disabled = true;
  const res = {}; METHODS.forEach(m => res[m.id] = []);
  for (let li = 0; li < MC.lengths.length; li++) {
    const len = MC.lengths[li], ok = {}; METHODS.forEach(m => ok[m.id] = 0);
    for (let t = 0; t < M; t++) {
      const plain = sampleWindow(len, rnd), k = 1 + Math.floor(rnd() * 25), ct = caesar(plain, k, false);
      for (const m of METHODS) { const r = pickKey(m.id, ct); if (r.key === k && !r.tie) ok[m.id]++; }
    }
    METHODS.forEach(m => res[m.id].push(ok[m.id] / M)); $('mcProg').textContent = `${Math.round(100 * (li + 1) / MC.lengths.length)}%`; await tick();
  }
  MC.res = res; drawMC(M); $('mcProg').textContent = 'done'; btn.disabled = false; return res;
}
function drawMC(M) {
  const res = MC.res; if (!res) return;
  lineChart($('mcChart'), METHODS.map(m => ({ name: m.name, color: m.color, pts: res[m.id].map((v, i) => [Math.log10(MC.lengths[i]), v * 100]), dots: true, w: 3.6 - 0.35 * METHODS.indexOf(m), r: 3.2, tip: p => `${m.name}, ${Math.round(Math.pow(10, p[0]))} letters: ${p[1].toFixed(1)}% of keys recovered` })),
    { W: 640, H: 300, xmin: Math.log10(4), xmax: Math.log10(600), ymin: 0, ymax: 100, xticks: MC.lengths.map(Math.log10), xfmt: v => Math.round(Math.pow(10, v)), xt: 'ciphertext length (letters, log scale)', yt: 'keys recovered (%)', yfmt: v => v.toFixed(0) });
  $('mcTable').innerHTML = MC.lengths.map((len, i) => `<tr><td class="num mono">${len}</td>${METHODS.map(m => `<td class="num mono">${(100 * res[m.id][i]).toFixed(0)}%</td>`).join('')}</tr>`).join('');
  const first = (id, th) => { const i = res[id].findIndex(v => v >= th); return i < 0 ? 'more than 500' : MC.lengths[i]; };
  $('mcText').innerHTML = `Success rises with length for every method. The trigram score reaches 90% at <b>${first('tri', 0.9)}</b> letters and 99% at <b>${first('tri', 0.99)}</b>; the bigram score needs <b>${first('bi', 0.9)}</b> and <b>${first('bi', 0.99)}</b>; unigram log-likelihood <b>${first('ll1', 0.9)}</b> and <b>${first('ll1', 0.99)}</b>; chi-square <b>${first('chi', 0.9)}</b> and <b>${first('chi', 0.99)}</b>; the word check <b>${first('dict', 0.9)}</b> and <b>${first('dict', 0.99)}</b>. The “most frequent letter is E” shortcut is the weakest and needs <b>${first('peak', 0.9)}</b> letters to reach 90%, because it relies on a single count that is easily misled. Methods that use more of the statistics (pairs, triples) need fewer letters: order matters as well as frequency.`;
  $('mcNote').textContent = `${M} random ciphertexts per length and method, random key in 1…25, plaintext windows from the test text (never used for training).`;
}
function initMC() { $('btnMC').addEventListener('click', () => runMC()); }
/* ================= Attacks on the toy ECC scheme ================= */
const MASK52 = (1n << 52n) - 1n, AT = { tBF: 6e-6, tBS: 14e-6 };
async function bruteForce(T, b, onProg, maxSteps) {
  const limit = Math.min(2 ** b, maxSteps || Infinity), qx = T[0], t0 = performance.now(); let J = [SC.GX, SC.GY, 1n];
  for (let d = 1; d <= limit; d++) {
    const z2 = J[2] * J[2] % SC.P;
    if ((qx * z2 - J[0]) % SC.P === 0n) { const a = SC.toAffine(J[0], J[1], J[2]); if (a && a[0] === T[0] && a[1] === T[1]) return { d: BigInt(d), ops: d, ms: performance.now() - t0 }; }
    J = SC.jaddMixed(J[0], J[1], J[2], SC.GX, SC.GY);
    if ((d & 0x3fff) === 0) { onProg && onProg(d / limit); await tick(); }
  }
  return { d: null, ops: limit, ms: performance.now() - t0 };
}
async function bsgs(T, b, onProg) {
  const m = 2 ** Math.ceil(b / 2), tbl = new Map(), t0 = performance.now(), CH = 2048; let ops = 0;
  let J = [SC.GX, SC.GY, 1n], j = 1;
  while (j < m) {
    const batch = [], idx = []; for (let c = 0; c < CH && j < m; c++, j++) { batch.push(J); idx.push(j); J = SC.jaddMixed(J[0], J[1], J[2], SC.GX, SC.GY); }
    SC.batchAffine(batch).forEach((p, i) => tbl.set(Number(p[0] & MASK52), idx[i])); ops += batch.length;
    if (onProg) { onProg(0.5 * j / m); await tick(); }
  }
  const tBaby = performance.now() - t0, S = SC.mulG(BigInt(m)), negS = [S[0], SC.P - S[1]], check = d => d > 0n && (() => { const q = SC.mulG(d); return q && q[0] === T[0] && q[1] === T[1]; })();
  let Jt = [T[0], T[1], 1n], i = 0;
  while (i <= m) {
    const batch = [], base = i; for (let c = 0; c < CH && i <= m; c++, i++) { batch.push(Jt); Jt = SC.jaddMixed(Jt[0], Jt[1], Jt[2], negS[0], negS[1]); }
    const aff = SC.batchAffine(batch);
    for (let c = 0; c < aff.length; c++) {
      const gi = BigInt(base + c), p = aff[c], bm = BigInt(m);
      if (p === null) { if (check(gi * bm)) return { d: gi * bm, ops: ops + base + c + 1, ms: performance.now() - t0, tBaby, entries: tbl.size, m }; continue; }
      const jj = tbl.get(Number(p[0] & MASK52)); if (jj !== undefined) for (const cand of [gi * bm + BigInt(jj), gi * bm - BigInt(jj)]) if (check(cand)) return { d: cand, ops: ops + base + c + 1, ms: performance.now() - t0, tBaby, entries: tbl.size, m };
    }
    if (onProg) { onProg(0.5 + 0.5 * Math.min(1, i / m)); await tick(); }
  }
  return { d: null, ops: ops + i, ms: performance.now() - t0, entries: tbl.size, m };
}
async function benchmarkRates() {
  const fake = SC.mulG(5n + (1n << 200n)); // not in the searched range
  const a = await bruteForce(fake, 20, null, 20000); AT.tBF = a.ms / 1000 / a.ops;
  const k = BigInt(1000 + Math.floor(Math.random() * 500)), r = await bsgs(SC.mulG(k), 20); if (r.d !== null) AT.tBS = r.ms / 1000 / r.ops;
}

const FAIL = { last: null };
async function runEccAttack() {
  const b = +$('aBits').value, method = $('aMethod').value, target = $('aTarget').value, btn = $('btnAtkEcc'), prog = $('aProg'), out = $('aOut');
  if (method === 'brute' && b > 22) { const est = AT.tBF * 2 ** (b - 1); out.innerHTML = `<div class="pill warn">not run</div> <span class="small">Brute force over 2<sup>${b}</sup> keys needs about ${(2 ** (b - 1)).toExponential(1)} steps on average, roughly <b>${fmtDur(est)}</b> at this machine's speed. Choose baby-step giant-step for this size.</span>`; return null; }
  btn.disabled = true; prog.value = 0; out.innerHTML = '<span class="small">Setting up the victim…</span>'; await tick();
  const dTrue = randBits(b), Q = SC.mulG(dTrue), rTrue = target === 'R' ? randBits(b) : randBits(256), msgTxt = $('msg').value, c = eccEncrypt(enc(msgTxt), Q, rTrue);
  const T = target === 'Q' ? Q : c.R, onProg = p => { prog.value = p; };
  const res = method === 'brute' ? await bruteForce(T, b, onProg) : await bsgs(T, b, onProg); prog.value = 1;
  let html = '';
  if (res.d === null) { html = '<span class="pill no">key not found in the assumed range</span>'; }
  else {
    const found = res.d, secretOk = found === (target === 'Q' ? dTrue : rTrue);
    let pt; if (target === 'Q') pt = eccDecrypt(c.R, c.ct, found).pt; else { const S = SC.mulPoint(found, Q), ks = keystream(S[0], c.ct.length); pt = c.ct.map((v, i) => v ^ ks[i]); }
    if (method === 'brute') AT.tBF = res.ms / 1000 / res.ops; else AT.tBS = res.ms / 1000 / res.ops;
    const perOp = res.ms / res.ops;
    html = `<dl class="steprow"><dt>Attacker sees</dt><dd class="small">public key Q, the transmitted R, the ciphertext <span class="mono">${hx(c.ct)}</span>, and the knowledge that the secret has at most ${b} bits.</dd></dl>
    <dl class="steprow"><dt>Target</dt><dd class="small">${target === 'Q' ? 'Bob’s public key Q = d·G: find d, then decrypt like Bob.' : 'The ephemeral point R = r·G (Alice also drew r from the small range): find r, then compute S = r·Q from public data. Bob’s private key is never needed.'}</dd></dl>
    <dl class="steprow"><dt>Method</dt><dd class="small">${method === 'brute' ? 'Brute force: compute 1·G, 2·G, 3·G, … and compare each with the target.' : `Baby-step giant-step: store x(j·G) for j &lt; ${res.m}, then subtract multiples of ${res.m}·G from the target until a stored value appears. The table holds ${res.entries.toLocaleString('en-US')} entries.`}</dd></dl>
    <dl class="steprow"><dt>Recovered ${target === 'Q' ? 'd' : 'r'}</dt><dd class="mono">${found} <span class="muted">(0x${found.toString(16)})</span> ${secretOk ? '<span class="pill ok">equals the real secret</span>' : '<span class="pill no">differs</span>'}</dd></dl>
    <dl class="steprow"><dt>Work</dt><dd class="small"><b>${res.ops.toLocaleString('en-US')}</b> group operations in <b>${(res.ms / 1000).toFixed(2)} s</b> (${(1000 / perOp).toLocaleString('en-US', { maximumFractionDigits: 0 })} per second). Worst case for ${method === 'brute' ? '2<sup>' + b + '</sup>' : '≈ 2·2<sup>' + Math.ceil(b / 2) + '</sup>'} operations.</dd></dl>
    <dl class="steprow"><dt>Decrypted message</dt><dd class="mono"><b>"${esc(dec(pt))}"</b> ${dec(pt) === msgTxt ? '<span class="pill ok">correct</span>' : '<span class="pill no">wrong</span>'}</dd></dl>`;
    FAIL.last = { b, method, ms: res.ms, ops: res.ops };
  }
  out.innerHTML = html; btn.disabled = false; drawScaling(); return res;
}
function humanBytes(n) { const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB']; let i = 0; while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; } return n >= 1000 ? n.toExponential(1) + ' ZB' : n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i]; }
function drawScaling() {
  const rows = [16, 20, 24, 32, 40, 56, 64, 80, 128, 256].map(b => {
    const bf = AT.tBF * 2 ** (b - 1), bs = AT.tBS * 1.5 * 2 ** (b / 2), mem = 2 ** (b / 2) * 40;
    return { b, bf, bs, mem };
  });
  $('scaleTable').innerHTML = rows.map(r => `<tr${r.b === 256 ? ' class="cur"' : ''}><td class="num mono">${r.b}${r.b === 256 ? ' (secp256k1)' : ''}</td><td class="num mono">2<sup>${r.b}</sup></td><td class="num mono">${fmtDur(r.bf)}</td><td class="num mono">${fmtDur(r.bs)}</td><td class="num mono">${r.b <= 64 ? humanBytes(r.mem) : humanBytes(r.mem)}</td></tr>`).join('');
  const bits = [16, 24, 32, 48, 64, 80, 96, 128, 160, 192, 224, 256], lg = v => Math.log10(v);
  const f = (fn) => bits.map(b => [b, lg(fn(b))]);
  lineChart($('scaleChart'), [
    { name: 'brute force (average)', color: 'var(--s2)', pts: f(b => AT.tBF * 2 ** (b - 1)), dots: true, tip: p => `${p[0]} bits: 10^${p[1].toFixed(1)} s` },
    { name: 'baby-step giant-step', color: 'var(--s1)', pts: f(b => AT.tBS * 1.5 * 2 ** (b / 2)), dots: true, tip: p => `${p[0]} bits: 10^${p[1].toFixed(1)} s` },
    { name: 'age of the universe (4×10¹⁷ s)', color: 'var(--muted)', dash: true, pts: [[16, 17.6], [256, 17.6]], tip: () => '' }],
    { W: 640, H: 280, xmin: 16, xmax: 256, ymin: -4, ymax: 80, xticks: [16, 64, 128, 192, 256], xt: 'private-key size (bits)', yt: 'time (seconds)', yfmt: v => '10^' + Math.round(v) });
}

/* ----- design weaknesses (demos) ----- */
function initWeak() {
  $('btnMall').addEventListener('click', () => {
    const L0 = E.last, old = $('mallOld').value, nw = $('mallNew').value, out = $('mallOut'); if (!L0) return;
    const msg = $('msg').value, pos = msg.indexOf(old);
    if (!old || old.length !== nw.length || pos < 0) { out.innerHTML = '<span class="pill warn">The old text must occur in the message and the new text must have the same length.</span>'; return; }
    const ct2 = Uint8Array.from(L0.res.ct), a = enc(old), b2 = enc(nw); for (let i = 0; i < a.length; i++) ct2[pos + i] ^= a[i] ^ b2[i];
    const pt = eccDecrypt(L0.res.R, ct2, E.d).pt;
    out.innerHTML = `<div class="small">Original ciphertext: <span class="hex mono">${hx(L0.res.ct)}</span></div><div class="small">Modified ciphertext: <span class="hex mono">${hx(ct2)}</span> (only ${a.length} byte${a.length > 1 ? 's' : ''} changed)</div><div style="margin-top:6px">Bob decrypts without noticing: <span class="mono"><b>"${esc(dec(pt))}"</b></span></div>`;
  });
  $('btnReuse').addEventListener('click', () => {
    const m1 = enc($('msg').value), m2 = enc($('reuseMsg').value), n = Math.min(m1.length, m2.length), r = randBits(256), Q = E.Q;
    const c1 = eccEncrypt(m1, Q, r), c2 = eccEncrypt(m2, Q, r), x = (a, b) => a.slice(0, n).map((v, i) => v ^ b[i]);
    const cx = x(c1.ct, c2.ct), mx = x(m1, m2), rec = x(cx, m1);
    $('reuseOut').innerHTML = `<div class="small">Same r means the same R and the same key stream, so the attacker sees R twice and can XOR the ciphertexts (compared over the first ${n} bytes, the length of the shorter message).</div><div class="small">c₁ ⊕ c₂ = <span class="hex mono">${hx(cx)}</span></div><div class="small">m₁ ⊕ m₂ = <span class="hex mono">${hx(mx)}</span> ${hx(cx) === hx(mx) ? '<span class="pill ok">identical</span>' : '<span class="pill no">different</span>'}</div><div class="small" style="margin-top:6px">If m₁ is known, m₂ = c₁ ⊕ c₂ ⊕ m₁ = <span class="mono"><b>"${esc(dec(rec))}"</b></span></div>`;
  });
}
function initEccAttack() { $('btnAtkEcc').addEventListener('click', runEccAttack); drawScaling(); initWeak(); }
/* ================= INIT ================= */
async function boot() {
  initEccDemo(); initCaesarDemo(); initCompare(); drawCorpus(); initAttackUI(); initMC(); initEccAttack();
  await tick(); await runCompare();
  await tick(); await benchmarkRates(); drawScaling();
  await tick(); const res = await runEccAttack();
  if (res && res.d !== null) $('t-ecc').textContent = `${$('aBits').value}-bit key in ${(res.ms / 1000).toFixed(1)} s`;
  await tick(); const mc = await runMC(); const at = (id, len) => Math.round(100 * mc[id][MC.lengths.indexOf(len)]);
  $('t-cae').textContent = `chi²: ${at('chi', 30)}% at 30 letters`; $('t-cae2').textContent = `trigrams: ${at('tri', 10)}% at 10 letters`;
  window.__ready = true;
}
boot().catch(e => { console.error(e); window.__err = String(e && e.stack || e); });
