/* Keccak-f[1600], Keccak-256 (Ethereum) e SHA3-256 (NIST). Estende Lib di ecc-lib.js. */
(() => {
  const RC64 = [0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];
  const RCH = new Uint32Array(24), RCL = new Uint32Array(24);
  RC64.forEach((v, i) => { RCH[i] = Number(v >> 32n); RCL[i] = Number(v & 0xffffffffn); });
  const ROTC = [1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44];
  const PILN = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1];
  function keccakF(sh, sl) {
    const bh = new Uint32Array(5), bl = new Uint32Array(5);
    for (let r = 0; r < 24; r++) {
      for (let i = 0; i < 5; i++) { bh[i] = sh[i]^sh[i+5]^sh[i+10]^sh[i+15]^sh[i+20]; bl[i] = sl[i]^sl[i+5]^sl[i+10]^sl[i+15]^sl[i+20]; }
      for (let i = 0; i < 5; i++) {
        const nh = bh[(i+1)%5], nl = bl[(i+1)%5];
        const th = bh[(i+4)%5] ^ ((nh << 1) | (nl >>> 31)), tl = bl[(i+4)%5] ^ ((nl << 1) | (nh >>> 31));
        for (let j = 0; j < 25; j += 5) { sh[j+i] ^= th; sl[j+i] ^= tl; }
      }
      let th = sh[1], tl = sl[1];
      for (let i = 0; i < 24; i++) {
        const j = PILN[i], n = ROTC[i], h0 = sh[j], l0 = sl[j];
        let h = th, l = tl; if (n >= 32) { const t = h; h = l; l = t; }
        const m = n & 31; let rh = h, rl = l; if (m) { rh = (h << m) | (l >>> (32 - m)); rl = (l << m) | (h >>> (32 - m)); }
        sh[j] = rh; sl[j] = rl; th = h0; tl = l0;
      }
      for (let j = 0; j < 25; j += 5) {
        for (let i = 0; i < 5; i++) { bh[i] = sh[j+i]; bl[i] = sl[j+i]; }
        for (let i = 0; i < 5; i++) { sh[j+i] ^= ~bh[(i+1)%5] & bh[(i+2)%5]; sl[j+i] ^= ~bl[(i+1)%5] & bl[(i+2)%5]; }
      }
      sh[0] ^= RCH[r]; sl[0] ^= RCL[r];
    }
  }
  function sponge256(msg, ds) {
    const rate = 136, sh = new Uint32Array(25), sl = new Uint32Array(25);
    const padLen = (Math.floor(msg.length / rate) + 1) * rate, buf = new Uint8Array(padLen);
    buf.set(msg); buf[msg.length] ^= ds; buf[padLen - 1] ^= 0x80;
    for (let o = 0; o < padLen; o += rate) {
      for (let i = 0; i < rate / 8; i++) { const q = o + 8 * i;
        sl[i] ^= buf[q] | (buf[q+1] << 8) | (buf[q+2] << 16) | (buf[q+3] << 24);
        sh[i] ^= buf[q+4] | (buf[q+5] << 8) | (buf[q+6] << 16) | (buf[q+7] << 24); }
      keccakF(sh, sl);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { out[8*i+k] = (sl[i] >>> (8*k)) & 255; out[8*i+4+k] = (sh[i] >>> (8*k)) & 255; }
    return out;
  }
  const keccak256 = m => sponge256(m, 0x01);   // padding Keccak originale (Ethereum)
  const sha3_256 = m => sponge256(m, 0x06);    // NIST FIPS 202 (bit di dominio 01 + pad10*1)
  Lib.keccak256 = keccak256; Lib.sha3_256 = sha3_256;
})();
