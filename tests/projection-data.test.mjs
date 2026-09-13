import test from 'node:test';
import assert from 'node:assert/strict';
import {donationAddress,validProjection,observeProjection} from '../public/earnings-data.mjs';
const now=Date.parse('2026-09-13T12:00:00Z');
function fixture(){
 return {status:'ok',address:donationAddress,generatedAt:new Date(now).toISOString(),miner:{status:'ok',accountingHeld:false,payoutLocked:false,projection:{schemaVersion:1,asset:'ZCL',address:donationAddress,status:'ok',reason:null,generatedAt:new Date(now).toISOString(),basis:'conditional-next-block-subsidy',workBasis:'retained-unconsumed-round-shares',subsidyBasis:'next-height-subsidy-excluding-transaction-fees',sourceGeneratedAt:new Date(now-30000).toISOString(),tipHeight:3192878,tipHash:'a'.repeat(64),height:3192879,roundId:'initial',subsidyZat:'31250000',feePercent:'0.8',poolWeight:'1.000000000000000000000000',addressWeight:'0.250000000000000000000000',sharePercent:25,grossZat:'7812500',poolFeeZat:'62500',additionalDonationZat:'0',allocationZat:'7750000'}}};
}
test('next-block estimate is bound to the address, current verified round and exact allocation',()=>{
 const data=fixture();assert.equal(validProjection(data,donationAddress,now),true);
 for(const patch of [{address:'different'},{height:3192878},{tipHash:'unknown'},{roundId:''},{feePercent:0.8},{basis:'hourly-income'},{allocationZat:'7750001'},{sharePercent:26},{addressWeight:'1.100000000000000000000000'},{grossZat:'2100000000000001'}]){
  const bad=fixture();Object.assign(bad.miner.projection,patch);assert.equal(validProjection(bad,donationAddress,now),false,JSON.stringify(patch));
 }
 assert.equal(validProjection(data,'different',now),false);
});
test('stale, failed, held, partial and empty-round contexts cannot expose an estimate',()=>{
 for(const change of [d=>d.status='partial',d=>d.miner.status='partial',d=>d.miner.accountingHeld=true,d=>d.miner.payoutLocked=true,d=>d.miner.projection.status='unavailable',d=>d.miner.projection.reason='no-round-work',d=>d.miner.projection.poolWeight='0.000000000000000000000000',d=>d.miner.projection.sourceGeneratedAt=new Date(now-180001).toISOString(),d=>d.miner.projection.generatedAt=new Date(now+60001).toISOString(),d=>d.generatedAt=new Date(now-180001).toISOString()]){
  const bad=fixture();change(bad);assert.equal(validProjection(bad,donationAddress,now),false);
 }
});
test('verified address with zero work may show zero, while amounts preserve largest-remainder rounding',()=>{
 const zero=fixture();Object.assign(zero.miner.projection,{addressWeight:'0.000000000000000000000000',sharePercent:0,grossZat:'0',poolFeeZat:'0',allocationZat:'0'});assert.equal(validProjection(zero,donationAddress,now),true);
 const rounded=fixture();Object.assign(rounded.miner.projection,{poolWeight:'3.000000000000000000000000',addressWeight:'1.000000000000000000000000',sharePercent:100/3,grossZat:'10416667',poolFeeZat:'83333',additionalDonationZat:'103333',allocationZat:'10230001'});assert.equal(validProjection(rounded,donationAddress,now),true);
 rounded.miner.projection.allocationZat='10230002';rounded.miner.projection.grossZat='10416668';assert.equal(validProjection(rounded,donationAddress,now),false,'more than the possible rounding residual is rejected');
});
test('conditional history contains only distinct observed timestamps and resets on address or round change',()=>{
 const p=fixture().miner.projection;
 let history=observeProjection(null,p,donationAddress);assert.equal(history.points.length,1);
 history=observeProjection(history,p,donationAddress);assert.equal(history.points.length,1);
 history=observeProjection(history,{...p,generatedAt:new Date(now+30000).toISOString(),allocationZat:'7600000'},donationAddress);assert.deepEqual(history.points.map(p=>p.value),['7750000','7600000']);
 history=observeProjection(history,{...p,generatedAt:new Date(now+60000).toISOString(),roundId:'b'.repeat(64)},donationAddress);assert.equal(history.points.length,1);
 history=observeProjection(history,p,'other-address');assert.equal(history.points.length,1);assert.equal(history.address,'other-address');
});
