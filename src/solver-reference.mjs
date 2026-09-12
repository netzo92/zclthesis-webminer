// Independent host-side Blake2b and Equihash verifier. No nonce search runs here.
const MASK = (1n << 64n) - 1n;
export const IV = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
export const SIGMA = [
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
  [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4], [7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
  [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13], [2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
  [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11], [13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
  [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5], [10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
];
const ror = (x, n) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & MASK;
function compress(h, block, length, last) {
  const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const m = Array.from({length:16}, (_, i) => view.getBigUint64(i * 8, true));
  const v = [...h, ...IV];
  v[12] ^= BigInt(length);
  if (last) v[14] ^= MASK;
  function g(a,b,c,d,x,y) {
    v[a] = (v[a] + v[b] + x) & MASK; v[d] = ror(v[d] ^ v[a], 32);
    v[c] = (v[c] + v[d]) & MASK; v[b] = ror(v[b] ^ v[c], 24);
    v[a] = (v[a] + v[b] + y) & MASK; v[d] = ror(v[d] ^ v[a], 16);
    v[c] = (v[c] + v[d]) & MASK; v[b] = ror(v[b] ^ v[c], 63);
  }
  for (let round = 0; round < 12; round++) {
    const s = SIGMA[round % 10];
    g(0,4,8,12,m[s[0]],m[s[1]]); g(1,5,9,13,m[s[2]],m[s[3]]);
    g(2,6,10,14,m[s[4]],m[s[5]]); g(3,7,11,15,m[s[6]],m[s[7]]);
    g(0,5,10,15,m[s[8]],m[s[9]]); g(1,6,11,12,m[s[10]],m[s[11]]);
    g(2,7,8,13,m[s[12]],m[s[13]]); g(3,4,9,14,m[s[14]],m[s[15]]);
  }
  return h.map((x, i) => x ^ v[i] ^ v[i + 8]);
}
export function parameters(n = 192, k = 7) {
  if (!((n === 192 && k === 7) || (n === 96 && k === 5))) {
    throw new Error('This solver supports ZCL 192,7 and the reduced 96,5 test configuration only.');
  }
  const digit = n / (k + 1), bucketBits = digit - 4;
  return {n, k, digit, bucketBits, buckets: 2 ** bucketBits, slots:64,
    leaves: 2 ** (digit + 1), hashesPerBlake: Math.floor(512 / n),
    digestBytes: Math.floor(512 / n) * n / 8, proofBytes: (2 ** k) * (digit + 1) / 8,
    strides: [Math.ceil((n - digit + 4) / 32) + 1, Math.ceil((n - 2 * digit + 4) / 32) + 1]};
}
export function midstate(header, n = 192, k = 7) {
  if (!(header instanceof Uint8Array) || header.length !== 140) throw new Error('Header must be exactly 140 bytes.');
  const p = parameters(n, k), state = [...IV];
  const personal = new Uint8Array(16);
  personal.set(new TextEncoder().encode('ZcashPoW'));
  const pv = new DataView(personal.buffer);
  pv.setUint32(8, n, true); pv.setUint32(12, k, true);
  state[0] ^= BigInt(0x01010000 | p.digestBytes);
  state[6] ^= pv.getBigUint64(0, true); state[7] ^= pv.getBigUint64(8, true);
  return compress(state, header.subarray(0, 128), 128, false);
}
export function blakeGroup(header, group, n = 192, k = 7, state = midstate(header, n, k)) {
  const p = parameters(n, k), block = new Uint8Array(128);
  block.set(header.subarray(128));
  new DataView(block.buffer).setUint32(12, group, true);
  const result = compress(state, block, 144, true), bytes = new Uint8Array(64), v = new DataView(bytes.buffer);
  result.forEach((x, i) => v.setBigUint64(i * 8, x, true));
  return bytes.slice(0, p.digestBytes);
}
export function packProof(indices, n = 192, k = 7) {
  const p = parameters(n,k);
  if (indices.length !== 2 ** k) throw new Error('Incorrect index count.');
  const result = new Uint8Array(p.proofBytes);
  let offset = 0;
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= p.leaves) throw new Error('Index outside Equihash domain.');
    for (let bit = p.digit; bit >= 0; bit--, offset++) result[offset >> 3] |= ((index >>> bit) & 1) << (7 - (offset & 7));
  }
  return result;
}
export function unpackProof(proof, n = 192, k = 7) {
  const p = parameters(n,k);
  if (!(proof instanceof Uint8Array) || proof.length !== p.proofBytes) throw new Error('Incorrect solution size.');
  const indices = [];
  let offset = 0;
  for (let i = 0; i < 2 ** k; i++) {
    let value = 0;
    for (let bit = 0; bit <= p.digit; bit++, offset++) value = value * 2 + ((proof[offset >> 3] >> (7 - (offset & 7))) & 1);
    indices.push(value);
  }
  return indices;
}
export function verifyProof(header, proof, n = 192, k = 7) {
  try {
    const p = parameters(n,k), indices = unpackProof(proof,n,k), state = midstate(header,n,k), cache = new Map();
    if (new Set(indices).size !== indices.length) return false;
    let rows = indices.map(index => {
      const group = Math.floor(index / p.hashesPerBlake);
      if (!cache.has(group)) cache.set(group, blakeGroup(header,group,n,k,state));
      const start = (index % p.hashesPerBlake) * n / 8;
      return {first:index, hash:cache.get(group).slice(start,start + n / 8)};
    });
    for (let round = 1; round <= k; round++) {
      const next = [], bits = round === k ? n : round * p.digit;
      for (let i = 0; i < rows.length; i += 2) {
        const a = rows[i], b = rows[i+1];
        if (a.first >= b.first) return false;
        const hash = a.hash.map((x, j) => x ^ b.hash[j]);
        for (let bit = 0; bit < bits; bit++) if ((hash[bit >> 3] >> (7 - (bit & 7))) & 1) return false;
        next.push({first:a.first,hash});
      }
      rows = next;
    }
    return true;
  } catch { return false; }
}
