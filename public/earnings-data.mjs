// Public ledger observations only; this module never starts a miner or estimates money.
export const donationAddress='t1Q8PRCDso9HoK36XeLCPym6vZmkwyNgS4d';
export const isAmount=value=>typeof value==='string'&&/^(?:0|[1-9][0-9]{0,15})$/.test(value)&&BigInt(value)<=2100000000000000n;
export const isTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
export const isAddress=value=>typeof value==='string'&&/^t1[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
export function formatZcl(value,locale='en-US'){
  if(!isAmount(value))return '—';
  const digits=value.padStart(9,'0'),whole=BigInt(digits.slice(0,-8)).toLocaleString(locale),fraction=digits.slice(-8).replace(/0+$/,'');
  return whole+(fraction?(locale.startsWith('es')?',':'.')+fraction:'');
}
function workWindow(value,seconds){
  return value&&value.seconds===seconds&&['difficultyWeight','estimatedSolps'].every(key=>typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]>=0)&&
    (value.networkPercent===null||(typeof value.networkPercent==='number'&&Number.isFinite(value.networkPercent)&&value.networkPercent>=0));
}
function work(value){return value===null||(value&&workWindow(value.last5m,300)&&workWindow(value.lastHour,3600));}
export function validSnapshot(data,address){
  if(!data||data.schemaVersion!==1||data.asset!=='ZCL'||!isTime(data.generatedAt)||data.address!==address||!['ok','partial','unavailable'].includes(data.status))return false;
  if(data.status==='unavailable')return data.miner===null;
  if(!data.network||!['ok','stale','unavailable'].includes(data.network.status)||data.network.basis!=='last-120-blocks'||
     !(data.network.generatedAt===null||isTime(data.network.generatedAt))||
     !(data.network.solps===null||(typeof data.network.solps==='number'&&Number.isFinite(data.network.solps)&&data.network.solps>0))||
     !data.pool||!work(data.pool.work))return false;
  const m=data.miner;
  if(!m||!['ok','not-found','partial'].includes(m.status)||!work(m.work)||
     !['earnedZat','creditedZat','availableZat','immatureZat','awaitingCreditZat','paidZat','pendingPayoutZat','thresholdZat','remainingZat'].every(key=>isAmount(m[key]))||
     !['thresholdReached','accountingHeld','payoutLocked'].every(key=>typeof m[key]==='boolean')||
     typeof m.progressPercent!=='number'||!Number.isFinite(m.progressPercent)||m.progressPercent<0||m.progressPercent>100||BigInt(m.thresholdZat)<=0n)return false;
  if(BigInt(m.earnedZat)!==BigInt(m.creditedZat)+BigInt(m.immatureZat)+BigInt(m.awaitingCreditZat))return false;
  for(const window of ['last5m','lastHour']){
    if(m.work&&data.pool.work&&['difficultyWeight','estimatedSolps'].some(key=>m.work[window][key]>data.pool.work[window][key]+1e-8))return false;
    for(const source of [m.work,data.pool.work])if(source){
      const point=source[window];
      if(data.network.status!=='ok'&&point.networkPercent!==null)return false;
      if(point.networkPercent!==null){
        if(!(data.network.solps>0))return false;
        const expected=point.estimatedSolps/data.network.solps*100;
        if(Math.abs(point.networkPercent-expected)>Math.max(0.000001,expected*0.000001))return false;
      }
    }
  }
  const available=BigInt(m.availableZat),threshold=BigInt(m.thresholdZat);
  if(BigInt(m.remainingZat)!==(available>=threshold?0n:threshold-available)||m.thresholdReached!==(available>=threshold))return false;
  // Chart labels preserve zatoshis. Floating point is used only for the bounded progress bar.
  const progress=Math.min(100,Number(available)*100/Number(threshold));
  if(Math.abs(m.progressPercent-progress)>0.011)return false;
  return true;
}
export function referenceTime(response,localNow=Date.now()){
  const server=Date.parse(response.headers?.get?.('date'));
  const raw=response.headers?.get?.('age'),age=raw==null?0:Number(raw)*1000;
  if(!Number.isFinite(age)||age<0||age>180000)throw Error('Stale response');
  return Number.isFinite(server)?server+age:localNow;
}
export function observe(points,point,{maxPoints=180,maxAge=5400000}={}){
  if(!isTime(point.at)||!isAmount(point.value))return points;
  const latest=points.at(-1);
  if(latest&&Date.parse(point.at)<=Date.parse(latest.at))return points;
  return [...points,point].filter(p=>Date.parse(p.at)>=Date.parse(point.at)-maxAge).slice(-maxPoints);
}
