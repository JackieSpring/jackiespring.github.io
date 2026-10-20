/* Library for Homework 1 and later: toy curve, secp256k1 (BigInt), SHA-256, statistics. */
const Lib = (() => {
  // ---------- toy curve  y^2 = x^3 + 7 (mod p) ----------
  const toy = {
    p: 17, b: 7,
    onCurve(P) { return P === null || ((P[1]*P[1] - (P[0]**3 + 7)) % 17 + 17) % 17 === 0; },
    allPoints() { const r = []; for (let x = 0; x < 17; x++) for (let y = 0; y < 17; y++) if (this.onCurve([x, y])) r.push([x, y]); return r; },
    inv(a) { a = ((a % 17) + 17) % 17; for (let i = 1; i < 17; i++) if ((a * i) % 17 === 1) return i; return null; },
    // returns {R, kind, lambda} so the UI can show the full computation
    add(P, Q) {
      const m = v => ((v % 17) + 17) % 17;
      if (P === null) return { R: Q, kind: 'P = O  →  P+Q = Q' };
      if (Q === null) return { R: P, kind: 'Q = O  →  P+Q = P' };
      if (P[0] === Q[0] && m(P[1] + Q[1]) === 0) return { R: null, kind: 'Q = −P (vertical line)  →  P+Q = O (point at infinity)' };
      let lam, kind;
      if (P[0] === Q[0] && P[1] === Q[1]) { lam = m(3 * P[0] * P[0] * this.inv(2 * P[1])); kind = 'doubling (tangent)'; }
      else { lam = m((Q[1] - P[1]) * this.inv(Q[0] - P[0])); kind = 'addition (chord)'; }
      const x = m(lam * lam - P[0] - Q[0]);
      const y = m(lam * (P[0] - x) - P[1]);
      return { R: [x, y], kind, lambda: lam, line: [P, Q] };
    },
    neg(P) { return P === null ? null : [P[0], (17 - P[1]) % 17]; },
    // naive repeated addition G, 2G, ..., kG
    ladder(G, k) { const out = []; let R = null; for (let i = 1; i <= k; i++) { const s = this.add(R, G); out.push({ i, P: R, G, ...s }); R = s.R; } return out; },
    // double-and-add trace (left-to-right)
    doubleAndAdd(G, k) {
      const bits = k.toString(2); let R = null; const trace = [];
      for (let i = 0; i < bits.length; i++) {
        if (R !== null || i > 0) { const d = this.add(R, R); trace.push({ op: 'double', bit: bits[i], before: R, R: d.R, kind: d.kind, lambda: d.lambda }); R = d.R; }
        if (bits[i] === '1') { const a = this.add(R, G); trace.push({ op: 'add G', bit: bits[i], before: R, R: a.R, kind: a.kind, lambda: a.lambda }); R = a.R; }
      }
      return { bits, trace, R };
    },
    mul(G, k) { let R = null; for (let i = 0; i < k; i++) R = this.add(R, G).R; return R; },
    order(G) { let R = G, n = 1; while (R !== null) { R = this.add(R, G).R; n++; if (n > 100) return null; } return n; },
  };

  // ---------- secp256k1 (BigInt) ----------
  const P = 2n ** 256n - 2n ** 32n - 977n;
  const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  const GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n;
  const GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n;
  const md = a => { const r = a % P; return r >= 0n ? r : r + P; };
  function inv(a) {
    let t = 0n, nt = 1n, r = P, nr = md(a);
    while (nr) { const q = r / nr;[t, nt] = [nt, t - q * nt];[r, nr] = [nr, r - q * nr]; }
    return t < 0n ? t + P : t;
  }
  function jdbl(X, Y, Z) {
    if (Z === 0n) return [0n, 1n, 0n];
    const A = X * X % P, B = Y * Y % P, C = B * B % P;
    const D = 2n * ((X + B) * (X + B) - A - C) % P, E = 3n * A, F = E * E % P;
    const X3 = md(F - 2n * D), Y3 = md(E * (D - X3) - 8n * C), Z3 = 2n * Y * Z % P;
    return [X3, Y3, Z3];
  }
  function jaddMixed(X1, Y1, Z1, x2, y2) {
    if (Z1 === 0n) return [x2, y2, 1n];
    const Z1Z1 = Z1 * Z1 % P, U2 = x2 * Z1Z1 % P, S2 = y2 * Z1 % P * Z1Z1 % P;
    const H = md(U2 - X1), r0 = md(S2 - Y1);
    if (H === 0n) return r0 === 0n ? jdbl(X1, Y1, Z1) : [0n, 1n, 0n];
    const HH = H * H % P, I = 4n * HH % P, J = H * I % P, r = 2n * r0 % P, V = X1 * I % P;
    const X3 = md(r * r - J - 2n * V), Y3 = md(r * (V - X3) - 2n * Y1 * J), Z3 = md((Z1 + H) * (Z1 + H) - Z1Z1 - HH);
    return [X3, Y3, Z3];
  }
  function toAffine(X, Y, Z) { if (Z === 0n) return null; const zi = inv(Z), z2 = zi * zi % P; return [X * z2 % P, Y * z2 % P * zi % P]; }
  let TBL = null;
  function table() {
    if (TBL) return TBL; TBL = []; let J = [GX, GY, 1n];
    for (let i = 0; i < 256; i++) { TBL.push(toAffine(...J)); J = jdbl(...J); }
    return TBL;
  }
  function mulG(k) { // k * G, fixed-base (uses precomputed 2^i G)
    const T = table(); let J = [0n, 1n, 0n]; let i = 0;
    for (let kk = k; kk > 0n; kk >>= 1n, i++) if (kk & 1n) J = jaddMixed(J[0], J[1], J[2], T[i][0], T[i][1]);
    return toAffine(...J);
  }
  // general scalar multiplication (double-and-add, Jacobian) for any affine point
  function mulPoint(k, Pt) {
    let J = [0n, 1n, 0n];
    for (let i = k.toString(2).length - 1; i >= 0; i--) { J = jdbl(J[0], J[1], J[2]); if ((k >> BigInt(i)) & 1n) J = jaddMixed(J[0], J[1], J[2], Pt[0], Pt[1]); }
    return toAffine(J[0], J[1], J[2]);
  }
  function addAffine(A, B) { const J = A === null ? [0n, 1n, 0n] : [A[0], A[1], 1n]; if (B === null) return A; return toAffine(...jaddMixed(J[0], J[1], J[2], B[0], B[1])); }
  const neg = A => A === null ? null : [A[0], md(-A[1])];
  // Montgomery batch inversion: Jacobian list -> affine list (null for the point at infinity)
  function batchAffine(Js) {
    const n = Js.length, pref = new Array(n); let acc = 1n;
    for (let i = 0; i < n; i++) { pref[i] = acc; if (Js[i][2] !== 0n) acc = acc * Js[i][2] % P; }
    let iv = inv(acc); const out = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      if (Js[i][2] === 0n) { out[i] = null; continue; }
      const zi = iv * pref[i] % P; iv = iv * Js[i][2] % P; const z2 = zi * zi % P;
      out[i] = [Js[i][0] * z2 % P, Js[i][1] * z2 % P * zi % P];
    }
    return out;
  }
  const hex =(b, n = 64) => b.toString(16).padStart(n, '0');
  const onCurve = Q => Q && md(Q[1] * Q[1] - Q[0] ** 3n - 7n) === 0n;

  // ---------- SHA-256 (sync) ----------
  const K256 = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function sha256(msg) {
    const l = msg.length, padLen = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(padLen);
    buf.set(msg); buf[l] = 0x80; const dv = new DataView(buf.buffer);
    dv.setUint32(padLen - 4, (l * 8) >>> 0); dv.setUint32(padLen - 8, Math.floor(l * 8 / 4294967296));
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), w = new Uint32Array(64);
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < padLen; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + 4 * i);
      for (let i = 16; i < 64; i++) { const s0 = rr(w[i-15],7)^rr(w[i-15],18)^(w[i-15]>>>3), s1 = rr(w[i-2],17)^rr(w[i-2],19)^(w[i-2]>>>10); w[i] = (w[i-16]+s0+w[i-7]+s1) | 0; }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rr(e,6)^rr(e,11)^rr(e,25), ch = (e&f)^(~e&g), t1 = (h+S1+ch+K256[i]+w[i]) | 0;
        const S0 = rr(a,2)^rr(a,13)^rr(a,22), mj = (a&b)^(a&c)^(b&c), t2 = (S0+mj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      H[0]+=a;H[1]+=b;H[2]+=c;H[3]+=d;H[4]+=e;H[5]+=f;H[6]+=g;H[7]+=h;
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer); for (let i = 0; i < 8; i++) odv.setUint32(4 * i, H[i]); return out;
  }

  // ---------- utils ----------
  const enc = s => new TextEncoder().encode(s);
  const toHex = u8 => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = h => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
  const bigFromBytes = u8 => BigInt('0x' + (toHex(u8) || '0'));
  const bytesFromBig = (b, n) => fromHex(b.toString(16).padStart(2 * n, '0'));
  function popcnt8(u8) { let c = 0; for (const b of u8) { let v = b; while (v) { c += v & 1; v >>= 1; } } return c; }
  const hamming = (a, b) => { let c = 0; for (let i = 0; i < a.length; i++) { let v = a[i] ^ b[i]; while (v) { c += v & 1; v >>= 1; } } return c; };

  // mulberry32 PRNG (deterministic => reproducible results)
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function rand256(r) { // uniform in [1, N-1]
    for (;;) { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt(Math.floor(r() * 4294967296)); if (v > 0n && v < N) return v; }
  }

  // ---------- statistics ----------
  function lgamma(x) { const c = [76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const cj of c) s += cj / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
  function gammq(a, x) { // upper regularized incomplete gamma Q(a,x)
    if (x <= 0) return 1;
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  const chi2p = (chi, df) => gammq(df / 2, chi / 2);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
  function pearson(x, y) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i]-mx)*(y[i]-my); sxx += (x[i]-mx)**2; syy += (y[i]-my)**2; } return sxy / Math.sqrt(sxx * syy); }
  function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); idx.forEach(([, i], k) => r[i] = k + 1); return r; }
  const spearman = (x, y) => pearson(ranks(x), ranks(y));
  const normSf = z => 0.5 * (1 - erf(z / Math.SQRT2));
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }

  return { toy, secp: { P, N, GX, GY, mulG, mulPoint, addAffine, neg, batchAffine, jdbl, jaddMixed, toAffine, onCurve, inv, table, md }, sha256, enc, toHex, fromHex, bigFromBytes, bytesFromBig, hex, popcnt8, hamming, rng, rand256, chi2p, mean, sd, pearson, spearman, normSf };
})();
if (typeof module !== 'undefined') module.exports = Lib;
