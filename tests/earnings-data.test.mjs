import test from 'node:test';
import assert from 'node:assert/strict';
import {donationAddress,formatZcl,validSnapshot,referenceTime,observe,isAmount} from '../public/earnings-data.mjs';
export function fixture(address=donationAddress){
 const window=seconds=>({seconds,difficultyWeight:2,estimatedSolps:20,networkPercent:2});
 const work=()=>({last5m:window(300),lastHour:window(3600)});
 return {schemaVersion:1,asset:'ZCL',generatedAt:'2026-09-13T12:00:00Z',status:'ok',address,
  network:{status:'ok',generatedAt:'2026-09-13T12:00:00Z',solps:1000,basis:'last-120-blocks'},
  pool:{mined:null,work:work()},miner:{status:'ok',earnedZat:'6000000',creditedZat:'4000000',availableZat:'2000000',immatureZat:'1000000',awaitingCreditZat:'1000000',paidZat:'1000000',pendingPayoutZat:'1000000',thresholdZat:'5000000',remainingZat:'3000000',progressPercent:40,thresholdReached:false,accountingHeld:false,payoutLocked:false,work:work()},
  history:{basis:'session-observations-only',available:false}};
}
test('payout progress uses only the mature unreserved balance',()=>{
 const data=fixture();assert.equal(validSnapshot(data,donationAddress),true);
 for(const key of ['remainingZat','progressPercent','thresholdReached']){const bad=structuredClone(data);bad.miner[key]=key==='remainingZat'?'1000000':key==='progressPercent'?80:true;assert.equal(validSnapshot(bad,donationAddress),false,key);}
 data.miner.availableZat='7000000';data.miner.remainingZat='0';data.miner.progressPercent=100;data.miner.thresholdReached=true;
 assert.equal(validSnapshot(data,donationAddress),true,'threshold reached does not promise immediate payout');
});
test('recipient mismatches, malformed amounts, inconsistent rewards and work are rejected',()=>{
 const data=fixture();assert.equal(validSnapshot(data,'t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs'),false);
 for(const value of ['-1','1e8',10,'9000000000000000']){const bad=structuredClone(data);bad.miner.earnedZat=value;assert.equal(validSnapshot(bad,donationAddress),false);}
 const wrong=structuredClone(data);wrong.miner.earnedZat='6000001';assert.equal(validSnapshot(wrong,donationAddress),false);
 const over=structuredClone(data);over.miner.work.last5m.estimatedSolps=21;assert.equal(validSnapshot(over,donationAddress),false);
 const ratio=structuredClone(data);ratio.miner.work.last5m.networkPercent=3;assert.equal(validSnapshot(ratio,donationAddress),false);
});
test('verified unseen addresses may show zero; unavailable accounts never fabricate zero',()=>{
 const data=fixture();data.miner.status='not-found';
 for(const key of ['earnedZat','creditedZat','availableZat','immatureZat','awaitingCreditZat','paidZat','pendingPayoutZat'])data.miner[key]='0';
 data.miner.remainingZat='5000000';data.miner.progressPercent=0;assert.equal(validSnapshot(data,donationAddress),true);
 assert.equal(validSnapshot({...data,status:'unavailable',miner:null},donationAddress),true);
 assert.equal(validSnapshot({...data,status:'ok',miner:null},donationAddress),false);
});
test('stale network observations cannot supply fresh-looking network shares',()=>{
 const data=fixture();data.network.status='stale';assert.equal(validSnapshot(data,donationAddress),false);
 for(const source of [data.pool.work,data.miner.work])for(const w of ['last5m','lastHour'])source[w].networkPercent=null;
 assert.equal(validSnapshot(data,donationAddress),true);
});
test('exact formatting retains every zatoshi and respects the supply bound',()=>{
 assert.equal(formatZcl('123456789','en-US'),'1.23456789');
 assert.equal(formatZcl('123456789','es-ES'),'1,23456789');
 assert.equal(formatZcl('2100000000000000','en-US'),'21,000,000');
 assert.equal(isAmount('2100000000000001'),false);assert.equal(formatZcl(null),'—');
});
test('chart stores observations once and preserves gaps, without backfilling earnings',()=>{
 let points=observe([],{at:'2026-09-13T12:00:00Z',value:'0'});
 points=observe(points,{at:'2026-09-13T12:00:00Z',value:'2000000'});assert.equal(points.length,1);assert.equal(points[0].value,'0');
 points=observe(points,{at:'2026-09-13T12:10:00Z',value:'2000000'});assert.equal(points.length,2);assert.equal(points[1].at,'2026-09-13T12:10:00Z');
 points=observe(points,{at:'2026-09-13T11:00:00Z',value:'999'});assert.equal(points.length,2);
});
test('HTTPS Date corrects local clock skew and stale cache ages are rejected',()=>{
 const headers={get:key=>key==='date'?'Sun, 13 Sep 2026 12:00:00 GMT':null};
 assert.equal(referenceTime({headers},0),Date.parse('2026-09-13T12:00:00Z'));
 assert.throws(()=>referenceTime({headers:{get:key=>key==='age'?'181':null}}));
});
