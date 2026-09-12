import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseJob,makeHeader,hex,meetsTarget} from '../src/protocol.mjs';
import {isZclAddress,validSubmit} from '../bridge/validation.mjs';
const fixture=JSON.parse(await readFile(new URL('./zcl-mainnet-header.json',import.meta.url)));
const bytes=Buffer.from(fixture.header_hex,'hex');
const params=['1',hex(bytes.subarray(0,4)),hex(bytes.subarray(4,36)),hex(bytes.subarray(36,68)),hex(bytes.subarray(68,100)),hex(bytes.subarray(100,104)),hex(bytes.subarray(104,108)),true,'192_7','ZcashPoW'];
test('Stratum notification reconstructs an independently fetched mainnet header byte for byte',async()=>{
  const header=makeHeader(parseJob(params),hex(bytes.subarray(108,112)),bytes.subarray(112,140));
  assert.equal(hex(header),hex(bytes.subarray(0,140)));
  assert.equal(await meetsTarget(header,bytes.subarray(143),fixture.block_hash),true);
  assert.equal(await meetsTarget(header,bytes.subarray(143),'0'.repeat(64)),false);
});
test('rejects incompatible algorithms, partial fields and oversized jobs',()=>{
  const wrong=[...params];wrong[8]='200_9';assert.throws(()=>parseJob(wrong));
  const wrongTime=[...params];wrongTime[5]='00';assert.throws(()=>parseJob(wrongTime));
  assert.throws(()=>parseJob([...params,'surplus']));
  assert.throws(()=>makeHeader(parseJob(params),'00000000',new Uint8Array(27)));
});
// Public secp256k1 test key 1. Never used to receive real funds.
const knownAddress='t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs';
test('payout address checksum and ZCL prefix must match',()=>{
  assert.equal(isZclAddress(knownAddress),true);
  assert.equal(isZclAddress(knownAddress.slice(0,-1)+'a'),false);
  assert.equal(isZclAddress('1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'),false);
  assert.equal(isZclAddress(knownAddress+'\n'),false);
});
test('only bounded canonical shares belonging to this connection are allowed',()=>{
  const jobs=new Map([['1',{}]]),message={type:'submit',id:1,job:'1',time:params[5],nonce:hex(bytes.subarray(112,140)),solution:hex(bytes.subarray(140))};
  assert.equal(validSubmit(message,jobs),true);
  assert.equal(validSubmit({...message,job:'other'},jobs),false);
  assert.equal(validSubmit({...message,solution:'00'+message.solution},jobs),false);
  assert.equal(validSubmit({...message,nonce:'\n'+message.nonce},jobs),false);
  assert.equal(validSubmit({...message,id:Infinity},jobs),false);
});
