import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {blakeGroup,parameters,packProof,unpackProof,verifyProof} from '../src/solver-reference.mjs';
import {estimateRequirements} from '../src/solver.mjs';
const fixture=JSON.parse(await readFile(new URL('./blake-vectors.json',import.meta.url)));
const mainnet=JSON.parse(await readFile(new URL('./zcl-mainnet-header.json',import.meta.url)));
const generated=JSON.parse(await readFile(new URL('./gpu-mainnet-proofs.json',import.meta.url)));
test('Existing mainnet ZCL192,7 block validates against its independently supplied hash and400-byte proof',()=> {
  const raw=Buffer.from(mainnet.header_hex,'hex');
  assert.equal(raw.length,543);
  assert.equal(raw.subarray(140,143).toString('hex'),'fd9001');
  const digest=createHash('sha256').update(createHash('sha256').update(raw).digest()).digest().reverse().toString('hex');
  assert.equal(digest,mainnet.block_hash);
  assert.equal(verifyProof(raw.subarray(0,140),raw.subarray(143)),true);
  const changed=Buffer.from(raw.subarray(143)); changed[200]^=1;
  assert.equal(verifyProof(raw.subarray(0,140),changed),false);
});
test('All three saved GPU192,7 proofs verify, including the original mainnet proof',()=> {
  assert.equal(generated.proofs.length,3);
  for(const proof of generated.proofs) assert.equal(verifyProof(Uint8Array.from(proof.header),Uint8Array.from(proof.proof)),true);
  assert.ok(generated.proofs.some(p=>Buffer.from(p.proof).toString('hex')===mainnet.header_hex.slice(286)));
});
for(const vector of fixture.vectors) {
  test(`Python hashlib Blake2b ${vector.n},${vector.k} group ${vector.group}`,()=> {
    const got=blakeGroup(Buffer.from(vector.header,'hex'),vector.group,vector.n,vector.k);
    assert.equal(Buffer.from(got).toString('hex'),vector.digest);
  });
}
for(const [n,k] of [[96,5],[192,7]]) {
  test(`Canonical ${n},${k} proof serialization preserves every index bit`,()=> {
    const p=parameters(n,k);
    const indices=Array.from({length:2**k},(_,i)=>(i*104729)%(p.leaves));
    indices[0]=p.leaves-1;
    assert.deepEqual(unpackProof(packProof(indices,n,k),n,k),indices);
    assert.equal(packProof(indices,n,k).length,p.proofBytes);
    assert.throws(()=>packProof([...indices.slice(1),p.leaves],n,k));
    assert.equal(verifyProof(new Uint8Array(140),new Uint8Array(p.proofBytes),n,k),false);
    assert.equal(verifyProof(new Uint8Array(139),new Uint8Array(p.proofBytes),n,k),false);
  });
}
test('192,7 arenas are chunked within baseline WebGPU limits without reducing the search domain',()=> {
  const result=estimateRequirements({maxStorageBufferBindingSize:128*2**20,maxBufferSize:256*2**20,maxStorageBuffersPerShaderStage:8});
  assert.equal(result.parameters.leaves,2**25);
  assert.equal(result.bytes,3.25*2**30+(2*2**20+1)*4);
  assert.equal(result.outputGroupSize,6);
  for(const arena of result.arenas) {
    assert.ok(arena.chunkBytes<=128*2**20);
    assert.equal(arena.chunks*arena.bucketsPerChunk,result.parameters.buckets);
  }
  assert.throws(()=>estimateRequirements({maxStorageBufferBindingSize:1024,maxBufferSize:1024,maxStorageBuffersPerShaderStage:8}));
});
