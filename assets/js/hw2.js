/* Homework 2: pipeline wallet, EIP-55, confronto hash. Richiede ecc-lib.js, keccak.js, bip39-words.js. */
const L = Lib;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tick = () => new Promise(r => setTimeout(r, 0));
function short(h, a = 10, b = 8) { return h.length > a + b + 3 ? h.slice(0, a) + '…' + h.slice(-b) : h; }

// tooltip (delegazione su [data-tip])
(function () {
  const tip = $('tip');
  document.addEventListener('pointermove', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !t.getAttribute('data-tip')) { tip.style.display = 'none'; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.style.display = 'block';
    const w = tip.offsetWidth; let x = e.clientX + 14; if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
  });
})();
const WIDX = new Map(BIP39_WORDS.map((w, i) => [w, i]));
const bin = (n, len) => n.toString(2).padStart(len, '0');
const TEST_MN = 'test test test test test test test test test test test junk';
const KNOWN = { [TEST_MN]: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'], 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about': ['0x9858EfFD232B4033E47d90003D41EC34EcaEda94', '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0'] };

function entropyToMnemonic(ent) {
  const cs = ent.length * 8 / 32, h = L.sha256(ent); let bits = ''; for (const b of ent) bits += bin(b, 8); bits += bin(h[0], 8).slice(0, cs);
  const words = []; for (let i = 0; i < bits.length; i += 11) words.push(BIP39_WORDS[parseInt(bits.slice(i, i + 11), 2)]); return words.join(' ');
}
function parseMnemonic(str) {
  const words = str.normalize('NFKD').trim().toLowerCase().split(/\s+/).filter(Boolean), res = { words, idx: [], unknown: [], valid: false };
  words.forEach((w, i) => { if (WIDX.has(w)) res.idx.push(WIDX.get(w)); else { res.idx.push(null); res.unknown.push(i); } });
  if (![12, 15, 18, 21, 24].includes(words.length)) res.err = `${words.length} parole: BIP-39 ammette 12, 15, 18, 21 o 24.`;
  if (res.unknown.length) { res.err = (res.err ? res.err + ' ' : '') + `${res.unknown.length} parola/e non presente/i nella lista inglese BIP-39.`; }
  if (res.err) return res;
  const bits = res.idx.map(i => bin(i, 11)).join(''), cs = bits.length / 33, eb = bits.slice(0, bits.length - cs), ent = new Uint8Array(eb.length / 8);
  for (let i = 0; i < ent.length; i++) ent[i] = parseInt(eb.slice(8 * i, 8 * i + 8), 2);
  Object.assign(res, { bits, cs, ent, chk: bits.slice(-cs), expect: bin(L.sha256(ent)[0], 8).slice(0, cs) }); res.valid = res.chk === res.expect; return res;
}
async function pbkdf2(pw, salt, iter) { const key = await crypto.subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-512', salt, iterations: iter }, key, 512)); }
async function hmac512(keyBytes, data) { const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, data)); }
function eip55(lowerHex) { const h = L.toHex(L.keccak256(L.enc(lowerHex))); return '0x' + [...lowerHex].map((c, i) => /[a-f]/.test(c) && parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c).join(''); }

async function deriveWallet(words, pass, acct, idx) {
  const t0 = performance.now();
  const seed = await pbkdf2(L.enc(words.join(' ').normalize('NFKD')), L.enc(('mnemonic' + pass).normalize('NFKD')), 2048), tSeed = performance.now() - t0;
  const I = await hmac512(L.enc('Bitcoin seed'), seed); let k = L.bigFromBytes(I.slice(0, 32)), c = I.slice(32);
  const master = { k, c }, levels = [], N = L.secp.N;
  const path = [[44, true, "purpose (BIP-44)"], [60, true, "coin type 60 = Ether"], [acct, true, 'account'], [0, false, 'change (esterno)'], [idx, false, 'indice indirizzo']];
  let p = 'm';
  for (const [i, hard, name] of path) {
    const index = hard ? i + 0x80000000 : i, data = new Uint8Array(37);
    if (hard) { data[0] = 0; data.set(L.bytesFromBig(k, 32), 1); } else { const Q = L.secp.mulG(k); data[0] = 2 + Number(Q[1] & 1n); data.set(L.bytesFromBig(Q[0], 32), 1); }
    new DataView(data.buffer).setUint32(33, index >>> 0);
    const J = await hmac512(c, data); k = (L.bigFromBytes(J.slice(0, 32)) + k) % N; c = J.slice(32);
    p += '/' + i + (hard ? "'" : ''); levels.push({ path: p, name, index, k, c });
  }
  const Q = L.secp.mulG(k), x = L.bytesFromBig(Q[0], 32), y = L.bytesFromBig(Q[1], 32), xy = new Uint8Array(64); xy.set(x); xy.set(y, 32);
  const hash = L.keccak256(xy), addrBytes = hash.slice(12), lower = L.toHex(addrBytes), addr = eip55(lower), hexH = L.toHex(L.keccak256(L.enc(lower)));
  return { seed, tSeed, master, levels, k, Q, x, y, hash, lower, addr, hexH, pathStr: p };
}

let walletRun = 0, prevAddr = null;
async function computeWallet() {
  const my = ++walletRun, raw = $('mn').value, pr = parseMnemonic(raw), pass = $('pw').value;
  const acct = Math.max(0, Math.min(99, +$('acct').value || 0)), idx = Math.max(0, Math.min(99, +$('aidx').value || 0));
  const dl = (t, b) => `<dl class="steprow"><dt>${t}</dt><dd>${b}</dd></dl>`;
  let h = '';
  const chips = pr.words.map((w, i) => `<span class="wordchip${pr.idx[i] === null ? ' bad' : ''}" data-tip="${pr.idx[i] === null ? 'non è nella lista' : 'indice ' + pr.idx[i] + ' = ' + bin(pr.idx[i], 11)}">${esc(w)}</span>`).join('');
  if (pr.err) {
    h += dl('1 · Mnemonic', chips + `<div class="small" style="margin-top:6px"><span class="pill no">non valida</span> ${esc(pr.err)} Un wallet rifiuterebbe questa frase.</div>`);
  } else {
    h += dl('1 · Mnemonic → entropia<div class="kind">codifica BIP-39</div>', chips + `<div class="small" style="margin-top:8px">${pr.words.length} parole × 11 bit = ${pr.bits.length} bit = <b>${pr.ent.length * 8}</b> bit di entropia + <b>${pr.cs}</b> bit di checksum.</div><div class="small">Entropia: <span class="hex mono">${L.toHex(pr.ent)}</span></div><div class="small">Bit di checksum nella frase: <span class="mono">${pr.chk}</span> &nbsp; primi ${pr.cs} bit di SHA-256(entropia): <span class="mono">${pr.expect}</span> &nbsp; ${pr.valid ? '<span class="pill ok">valida</span>' : '<span class="pill no">checksum errato: un wallet la rifiuterebbe</span>'}</div>`);
  }
  $('wOut').innerHTML = h + '<p class="small muted">Derivazione…</p>';
  const d = await deriveWallet(pr.words, pass, acct, idx); if (my !== walletRun) return;
  h += dl('2 · Seed<div class="kind">derivazione di chiavi</div>', `<div class="small">PBKDF2-HMAC-SHA512(password = mnemonic, salt = "mnemonic" + passphrase, 2048 iterazioni, 64 byte), calcolato in ${d.tSeed.toFixed(0)} ms:</div><div class="hex mono">${L.toHex(d.seed)}</div>`);
  h += dl('3 · Chiave master<div class="kind">BIP-32</div>', `<div class="small">HMAC-SHA512(key = "Bitcoin seed", data = seed), diviso in due metà.</div><div class="small">Chiave privata master (32 byte di sinistra):</div><div class="hex mono">${L.hex(d.master.k)}</div><div class="small">Chain code master (32 byte di destra):</div><div class="hex mono">${L.toHex(d.master.c)}</div>`);
  const rows = d.levels.map(l => `<tr><td class="mono">${l.path}</td><td>${l.name}</td><td class="mono">${l.index >= 0x80000000 ? '0x' + l.index.toString(16) + ' (hardened)' : l.index}</td><td class="mono hex">${short(L.hex(l.k), 12, 8)}</td></tr>`).join('');
  h += dl('4 · Percorso di derivazione<div class="kind">BIP-44 su BIP-32</div>', `<div class="small">Ogni livello: chiave figlia = (HMAC-SHA512(chain code del padre, dati ‖ indice).sinistra + chiave del padre) mod n. I livelli hardened mettono nell'HMAC la chiave <i>privata</i> del padre, gli altri la chiave <i>pubblica</i>.</div><div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>percorso</th><th>significato</th><th>indice</th><th>chiave privata</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  const comp = (d.Q[1] & 1n ? '03' : '02') + L.toHex(d.x);
  h += dl('5 · Chiave privata → pubblica<div class="kind">secp256k1</div>', `<div class="small">Chiave privata k a ${d.pathStr}:</div><div class="hex mono">${L.hex(d.k)}</div><div class="small">Chiave pubblica Q = kG, non compressa (04 ‖ x ‖ y):</div><div class="hex mono">04${L.toHex(d.x)}${L.toHex(d.y)}</div><div class="small">Forma compressa (parità di y ‖ x), usata da Bitcoin:</div><div class="hex mono">${comp}</div>`);
  const hh = L.toHex(d.hash);
  h += dl('6 · Hash della chiave pubblica<div class="kind">Keccak-256</div>', `<div class="small">Si fa l'hash dei 64 byte x ‖ y (senza prefisso 04). L'indirizzo è composto dagli ultimi 20 byte (40 cifre esadecimali) dell'hash di 32 byte:</div><div class="hex mono"><span class="muted">${hh.slice(0, 24)}</span><b>${hh.slice(24)}</b></div>`);
  const known = pass === '' && acct === 0 && KNOWN[pr.words.join(' ')] ? KNOWN[pr.words.join(' ')][idx] : null;
  const diff = prevAddr && prevAddr !== d.addr ? [...d.lower].filter((c, i) => c !== prevAddr.slice(2).toLowerCase()[i]).length : null;
  const cases = [...d.lower].map((c, i) => /[a-f]/.test(c) && parseInt(d.hexH[i], 16) >= 8 ? `<span class="up">${c.toUpperCase()}</span>` : c).join('');
  const nib = [...d.hexH.slice(0, 40)].map((c, i) => `<span class="${/[a-f]/.test(d.lower[i]) && parseInt(c, 16) >= 8 ? 'ge' : ''}">${c}</span>`).join('');
  h += dl('7 · Maiuscole di checksum<div class="kind">EIP-55</div>', `<div class="small">Si fa l'hash Keccak-256 del testo dell'indirizzo in minuscolo; una lettera diventa maiuscola quando la cifra corrispondente dell'hash vale 8 o più.</div><div class="small">minuscolo: <span class="mono hex">${d.lower}</span></div><div class="small">cifre dell'hash (evidenziate = ≥ 8 e la cifra dell'indirizzo è una lettera):</div><div class="mono nib" style="overflow-x:auto;white-space:nowrap;font-size:12.5px">${nib}</div><div class="addr" style="margin-top:10px">0x${cases}</div>${known ? `<div style="margin-top:8px">${known === d.addr ? '<span class="pill ok">✓ coincide con l’indirizzo pubblicato per questa mnemonic</span>' : '<span class="pill no">✗ diverso dall’indirizzo pubblicato</span>'}</div>` : ''}${diff !== null ? `<div class="small" style="margin-top:8px">Rispetto all'indirizzo precedente: <b>${diff}</b> cifre esadecimali su 40 sono diverse (due indirizzi indipendenti differiscono in media in 37.5 cifre).</div>` : ''}`);
  $('wOut').innerHTML = h; prevAddr = d.addr;
  if (known !== null && !window.__tileDone) { window.__tileDone = true; $('t-w').innerHTML = `${known === d.addr ? '✓' : '✗'} ${d.addr.slice(0, 6)}…${d.addr.slice(-4)}`; }
  return d;
}
function initWallet() {
  const set = v => { $('mn').value = v; computeWallet(); };
  $('mn').value = TEST_MN;
  $('btnTest').addEventListener('click', () => { $('pw').value = ''; $('acct').value = 0; $('aidx').value = 0; prevAddr = null; set(TEST_MN); });
  $('btnGen12').addEventListener('click', () => set(entropyToMnemonic(crypto.getRandomValues(new Uint8Array(16)))));
  $('btnGen24').addEventListener('click', () => set(entropyToMnemonic(crypto.getRandomValues(new Uint8Array(32)))));
  $('btnSwap').addEventListener('click', () => { const w = $('mn').value.trim().split(/\s+/); const i = Math.floor(Math.random() * w.length); w[i] = BIP39_WORDS[Math.floor(Math.random() * 2048)]; set(w.join(' ')); });
  let t; const deb = () => { clearTimeout(t); t = setTimeout(computeWallet, 350); };
  ['mn', 'pw'].forEach(id => $(id).addEventListener('input', deb)); ['acct', 'aidx'].forEach(id => $(id).addEventListener('change', computeWallet));
  return computeWallet();
}

/* EIP-55 typo simulation */
async function runEip(N, outEl) {
  const r = L.rng(55), HEX = '0123456789abcdef'; let caught = 0, expUnd = 0, letters = 0;
  for (let i = 0; i < N; i++) {
    const a = eip55(L.toHex(Uint8Array.from({ length: 20 }, () => Math.floor(r() * 256)))), body = a.slice(2), pos = Math.floor(r() * 40), old = body[pos].toLowerCase();
    let nc; do { nc = HEX[Math.floor(r() * 16)]; } while (nc === old); if (/[a-f]/.test(nc) && r() < 0.5) nc = nc.toUpperCase();
    const b2 = body.slice(0, pos) + nc + body.slice(pos + 1), lt = (b2.match(/[a-fA-F]/g) || []).length; letters += lt; expUnd += Math.pow(2, -lt);
    if (eip55(b2.toLowerCase()) !== '0x' + b2) caught++;
    if (i % 4000 === 3999) await tick();
  }
  const res = { N, caught, expUnd, meanLetters: letters / N }; if (outEl) outEl.innerHTML = `<b>${caught}</b> errori su una cifra su ${N} sono stati intercettati (${(100 * caught / N).toFixed(3)}%). Non rilevati: <b>${N - caught}</b>; la teoria (2<sup>−L</sup> per L lettere nell'indirizzo errato, L medio = ${res.meanLetters.toFixed(1)}) ne prevede circa <b>${expUnd.toFixed(2)}</b>. Il tasso di rilevazione è circa ${(100 * (1 - expUnd / N)).toFixed(4)}%: per questo basta un checksum di soli ~15 bit a rendere innocui gli errori di battitura.`; return res;
}
function initEip() {
  $('btnEip').addEventListener('click', async () => { $('btnEip').disabled = true; $('eipOut').textContent = 'in corso…'; await tick(); await runEip(+$('eipN').value, $('eipOut')); $('btnEip').disabled = false; });
}

/* hash comparison tool */
function renderHash() {
  const m = L.enc($('hIn').value), flip = m.length ? (() => { const f = m.slice(); f[0] ^= 1; return f; })() : null;
  const fns = [['SHA-256', L.sha256], ['SHA3-256 (NIST)', L.sha3_256], ['Keccak-256 (Ethereum)', L.keccak256]];
  const outs = fns.map(([n, f]) => ({ n, h: f(m), d: flip ? L.hamming(f(m), f(flip)) : null }));
  $('hOut').innerHTML = outs.map(o => `<tr><td style="white-space:nowrap"><b>${o.n}</b></td><td class="hex">${L.toHex(o.h)}</td><td class="small" style="white-space:nowrap">${o.d === null ? '–' : o.d + ' bit su 256 cambiano se si inverte il primo bit del messaggio'}</td></tr>`).join('');
  const d = L.hamming(outs[1].h, outs[2].h);
  $('hNote').innerHTML = `SHA3-256 e Keccak-256 differiscono in <b>${d}</b> bit su 256 per questo messaggio, anche se eseguono la stessa permutazione: cambia solo il byte di padding (<code>0x06</code> contro <code>0x01</code>). Invertire un bit del messaggio cambia circa metà dei bit di output in tutte e tre le funzioni (effetto avalanche).`;
}
function initHash() { $('hIn').addEventListener('input', renderHash); renderHash(); }

async function boot() {
  initEip(); initHash();
  await initWallet();
  await tick(); const r = await runEip(10000, $('eipOut')); $('t-eip').textContent = `${r.caught}/${r.N} intercettati`;
  window.__ready = true;
}
boot().catch(e => { console.error(e); window.__err = String(e && e.stack || e); });
