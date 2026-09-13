import {donationAddress,isAddress,isAmount,isTime,formatZcl,validSnapshot,referenceTime,observe,validProjection,observeProjection} from './earnings-data.mjs';
const mount=document.getElementById('earnings-dashboard');
if(mount){
const es=document.documentElement.lang==='es',locale=es?'es-ES':'en-US',$=id=>document.getElementById('earnings-'+id);
const t=es?{
 title:'Tu minería, a la vista.',donateTitle:'Actividad de donación al pool.',address:'Dirección de pago seleccionada',donation:'DESTINO DE DONACIÓN AL POOL · NO RECIBES PAGOS',
 donationNote:'Esta dirección es compartida por los donantes. Los totales no son tus ingresos personales. La minería solo comienza tras aceptar las advertencias y pulsar Iniciar.',
 addressNote:'Totales de todos los mineros de esta dirección; puedes consultarlos sin iniciar la minería.',invalid:'Introduce una dirección pública ZCL válida para consultar sus recompensas.',
 loading:'Consultando el registro del pool…',unavailable:'Datos de recompensas no disponibles. Los guiones no significan cero.',failed:'No se pudo actualizar. Se conservan las últimas cifras verificadas con su fecha.',
 stale:'Datos desactualizados. Estas cifras corresponden a la última observación indicada.',partial:'Datos parciales o contabilidad pendiente de revisión. No se garantiza que los importes estén listos para pagarse.',
 live:'Registro actualizado. Consultar este panel no inicia la minería.',notFound:'Todavía no hay actividad registrada para esta dirección.',held:'Contabilidad en revisión.',locked:'Pagos bloqueados para esta dirección.',
 net:'Total neto asignado',paid:'Pagado',pending:'Reservado para pagos pendientes',awaiting:'Maduro, pendiente de acreditar',credited:'Acreditado en el historial conservado; incluye importes ya pagados.',
 immature:'Todavía no disponible para pagar.',remaining:'Falta para el umbral',threshold:'Umbral',reached:'Umbral alcanzado; el pago depende de las comprobaciones y del ciclo de pagos.',
 rewards:'Recompensas acreditadas de esta dirección',work:'Participaciones aceptadas · esta sesión',shares:'participaciones aceptadas',noPoints:'Esperando la primera observación verificada.',
 first:'Primera observación real; el gráfico crecerá con nuevas lecturas.',gap:'Los huecos indican interrupciones en las observaciones.',chartNote:'Observaciones tomadas con esta página abierta; no son fechas de creación de ingresos.',
 workNote:'Contador real de este navegador; no equivale a monedas ganadas. Hora del dispositivo en UTC.',noMining:'No hay minería activa en este navegador.',updated:'Registro observado',
 network:'de la red, estimado',netMissing:'Proporción de la red no disponible',hour:'Estimación de 1 h',rateNote:'Hashrate estimado a partir del trabajo aceptado en los últimos 5 minutos; puede variar mucho. La estimación de red usa los últimos 120 bloques. Los porcentajes no son una previsión de ingresos.',
 projection:'Asignación estimada si el pool encuentra el próximo bloque',projectionWait:'Estimación no disponible: se requiere una ronda verificada y actual, sin retenciones contables.',projectionStale:'Estimación oculta: la observación está desactualizada o no se pudo actualizar.',projectionNote:'Escenario condicional, no recompensas ganadas. Solo subsidio; excluye comisiones de transacción. Puede subir o bajar con el trabajo de la ronda.',projectionShared:'Dirección compartida: incluye a todos los donantes, al propietario y a los mineros nativos; no son tus ingresos personales.',projectionAddress:'Todos los mineros que usan la dirección seleccionada.',projectionRound:'Ronda observada',projectionInitial:'ronda inicial',projectionWork:'del trabajo registrado de la ronda',projectionSubsidy:'Subsidio del próximo bloque',projectionFee:'Comisión del pool',projectionDonation:'Donación adicional de la cuenta',
 poolNote:'Recompensas brutas de bloques antes de la comisión del 0,8%; incluye las inmaduras.',poolPartial:'Historial parcial del pool: ≥ indica un mínimo verificado.',poolUnavailable:'Recompensas del pool no disponibles.',poolStale:'Observación del pool desactualizada.',poolObserved:'Bloques del pool verificados',
}: {
 title:'Your mining, in view.',donateTitle:'Pool donation activity.',address:'Selected payout address',donation:'POOL DONATION DESTINATION · NO PAYOUTS TO YOU',
 donationNote:'This address is shared by donors. These totals are not your personal earnings. Mining starts only after you accept the warnings and press Start.',
 addressNote:'Totals for all miners using this address; you can view them without starting mining.',invalid:'Enter a valid public ZCL address to view its rewards.',
 loading:'Checking the pool ledger…',unavailable:'Reward data is unavailable. Dashes do not mean zero.',failed:'Refresh failed. Showing the last verified figures and their timestamp.',
 stale:'Stale data. These figures belong to the last observation shown.',partial:'Partial data or accounting under review. These amounts are not guaranteed to be ready for payment.',
 live:'Ledger is up to date. Viewing this dashboard does not start mining.',notFound:'No recorded activity for this address yet.',held:'Accounting is under review.',locked:'Payouts are locked for this address.',
 net:'Net allocated total',paid:'Paid',pending:'Reserved for pending payouts',awaiting:'Mature, awaiting credit',credited:'Credited in the retained history; includes amounts already paid.',
 immature:'Not available for payout yet.',remaining:'Remaining to threshold',threshold:'Threshold',reached:'Threshold reached; payment depends on checks and the payout cycle.',
 rewards:'Credited rewards for this address',work:'Accepted shares · this session',shares:'accepted shares',noPoints:'Waiting for the first verified observation.',
 first:'First real observation; the chart grows with new readings.',gap:'Gaps mark interruptions in observations.',chartNote:'Observations collected with this page open, not the times rewards were earned.',
 workNote:'The actual counter from this browser; it is not coins earned. Device time in UTC.',noMining:'This browser is not currently mining.',updated:'Ledger observed',
 network:'of the network, estimated',netMissing:'Network share unavailable',hour:'1-hour estimate',rateNote:'Hashrate is estimated from accepted work over the last 5 minutes and can vary widely. The network estimate uses the last 120 blocks. Percentages do not predict earnings.',
 projection:'Estimated allocation if the pool finds the next block',projectionWait:'Estimate unavailable: requires a fresh, verified round with no accounting hold.',projectionStale:'Estimate hidden: the observation is stale or could not be refreshed.',projectionNote:'Conditional scenario, not earned rewards. Subsidy only; excludes transaction fees. It can rise or fall as the round’s work changes.',projectionShared:'Shared address: includes all donors, the owner, and native miners; these are not your personal earnings.',projectionAddress:'All miners using the selected address.',projectionRound:'Round observed',projectionInitial:'initial round',projectionWork:'of recorded round work',projectionSubsidy:'Next-block subsidy',projectionFee:'Pool fee',projectionDonation:'Additional account donation',
 poolNote:'Gross block rewards before the 0.8% pool fee; includes immature rewards.',poolPartial:'Partial pool history: ≥ marks a verified minimum.',poolUnavailable:'Pool rewards unavailable.',poolStale:'Pool observation is stale.',poolObserved:'Pool blocks checked',
};
const z=value=>formatZcl(value,locale),num=value=>new Intl.NumberFormat(locale,{maximumSignificantDigits:6}).format(value);
const dates=new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:'UTC'});
const time=value=>dates.format(new Date(value))+' UTC';
const field=document.getElementById('address'),counter=document.getElementById('accepted'),stop=document.getElementById('stop');
let recipient='',snapshot=null,failed=false,clockOffset=0,request=null,editTimer,chartMode='work',manualMode=false;
let projectionHistory=null;
let rewards=[],work=[],selected=null,sessionActive=!stop.disabled,sessionRecipient=null;
const currentNow=()=>Date.now()+clockOffset;
const old=data=>!isTime(data?.generatedAt)||currentNow()-Date.parse(data.generatedAt)>180000||currentNow()-Date.parse(data.generatedAt)<-300000;
function projectionAvailable(){return !failed&&validProjection(snapshot,recipient,currentNow());}
function renderProjection(){
 const available=projectionAvailable(),p=available?snapshot.miner.projection:null;
 $('projection').dataset.status=available?'ok':'unavailable';
 $('projection-value').textContent=p?z(p.allocationZat):'—';
 $('projection-recipient').textContent=!field.value.trim()||recipient===donationAddress?t.projectionShared:t.projectionAddress;
 $('projection-detail').textContent=p?num(p.sharePercent)+'% '+t.projectionWork+' · '+t.projectionSubsidy+': '+z(p.subsidyZat)+' ZCL · '+t.projectionFee+': '+z(p.poolFeeZat)+' ZCL · '+t.projectionDonation+': '+z(p.additionalDonationZat)+' ZCL.':'';
 $('projection-status').textContent=p?t.projectionRound+': '+time(p.generatedAt)+' · '+(p.roundId==='initial'?t.projectionInitial:p.roundId.slice(0,12)+'…')+'. '+t.projectionNote:(failed||snapshot&&old(snapshot)?t.projectionStale:t.projectionWait);
}
function clearFigures(){
 for(const key of ['credited','available','immature','miner-rate','pool-rate','miner-percent','pool-percent','pool-allTime','pool-last24h','pool-lastHour'])$(key).textContent='—';
 for(const key of ['allTime','last24h','lastHour']){const node=$('pool-'+key+'-blocks');if(node)node.textContent=es?'— bloques':'— blocks';}
 for(const key of ['credited-detail','available-detail','immature-detail','remaining','miner-hour','pool-hour','network-note','updated'])$(key).textContent='';
 $('payout-progress').value=0;$('payout-progress').hidden=true;$('payout-progress').setAttribute('aria-valuetext',t.unavailable);
 $('pool-note').textContent=t.poolUnavailable;
}
function renderRecipient(){
 const supplied=field.value.trim(),donating=!supplied;
 mount.dataset.donation=String(donating);$('title').textContent=donating?t.donateTitle:t.title;
 $('recipient-label').textContent=donating?t.donation:t.address;
 $('recipient-note').textContent=donating?t.donationNote:t.addressNote;
 $('address').textContent=recipient||supplied;
}
function rates(data){
 const networkFresh=!old(data)&&data.network.status==='ok'&&!old(data.network)&&data.network.solps>0;
 for(const [key,source] of [['miner',data.miner?.work],['pool',data.pool?.work]]){
  const rate=source?.last5m,hour=source?.lastHour;
  $(key+'-rate').textContent=rate?num(rate.estimatedSolps)+' Sol/s':'—';
  $(key+'-percent').textContent=rate&&networkFresh&&rate.networkPercent!==null?num(rate.networkPercent)+'% '+t.network:t.netMissing;
  $(key+'-hour').textContent=hour?t.hour+': '+num(hour.estimatedSolps)+' Sol/s':'';
 }
 $('network-note').textContent=t.rateNote;
}
function poolRewards(data){
 const mined=data.pool?.mined,available=mined&&mined.asset==='ZCL'&&mined.schemaVersion===1&&isTime(mined.generatedAt)&&['ok','partial'].includes(mined.status)&&['allTime','last24h','lastHour'].every(key=>isAmount(mined[key]?.rewardZat));
 for(const key of ['allTime','last24h','lastHour']){
  const value=available?mined[key].rewardZat:null;
  $('pool-'+key).textContent=value!==null?mined.status==='partial'?(value==='0'?'—':'≥ '+z(value)):z(value):'—';
  const count=available?mined[key].blocks:null;
  const validCount=Number.isSafeInteger(count)&&count>=0;
  const label=es?(count===1?'bloque':'bloques'):(count===1?'block':'blocks');
  const display=validCount?(mined.status==='partial'?(count===0?'—':'≥ '+count.toLocaleString(locale)):count.toLocaleString(locale)):'—';
  const node=$('pool-'+key+'-blocks');if(node)node.textContent=display+' '+label;
 }
 $('pool-note').textContent=available?[t.poolNote,mined.status==='partial'?t.poolPartial:'',old(mined)?t.poolStale:'',t.poolObserved+': '+time(mined.generatedAt)+'.'].filter(Boolean).join(' '):t.poolUnavailable;
}
function render(){
 if(!manualMode)chartMode=projectionAvailable()&&BigInt(snapshot.miner.projection.allocationZat)>0n?'projection':snapshot?.miner&&BigInt(snapshot.miner.creditedZat)>0n?'rewards':'work';
 renderProjection();
 if(!snapshot||snapshot.status==='unavailable'){
  clearFigures();mount.dataset.state='unavailable';$('status').textContent=recipient?t.unavailable:t.invalid;renderChart();return;
 }
 const m=snapshot.miner,stale=old(snapshot),partial=snapshot.status==='partial'||m.status==='partial'||m.accountingHeld;
 mount.dataset.state=failed||stale?'stale':partial?'partial':'ok';
 $('credited').textContent=z(m.creditedZat);$('available').textContent=z(m.availableZat);$('immature').textContent=z(m.immatureZat);
 $('credited-detail').textContent=t.credited+' '+t.net+': '+z(m.earnedZat)+' ZCL.';
 $('available-detail').textContent=t.paid+': '+z(m.paidZat)+' ZCL · '+t.pending+': '+z(m.pendingPayoutZat)+' ZCL.';
 $('immature-detail').textContent=t.immature+' '+t.awaiting+': '+z(m.awaitingCreditZat)+' ZCL.';
 $('payout-progress').hidden=false;$('payout-progress').value=m.progressPercent;
 $('payout-progress').setAttribute('aria-valuetext',z(m.availableZat)+' / '+z(m.thresholdZat)+' ZCL · '+num(m.progressPercent)+'%');
 $('remaining').textContent=t.threshold+': '+z(m.thresholdZat)+' ZCL · '+(m.thresholdReached?t.reached:t.remaining+': '+z(m.remainingZat)+' ZCL ('+num(m.progressPercent)+'%).');
 rates(snapshot);poolRewards(snapshot);
 $('status').textContent=[failed?t.failed:stale?t.stale:partial?t.partial:t.live,partial&&(failed||stale)?t.partial:'',m.status==='not-found'?t.notFound:'',m.accountingHeld?t.held:'',m.payoutLocked?t.locked:''].filter(Boolean).join(' ');
 $('updated').textContent=t.updated+': '+time(snapshot.generatedAt)+'.';renderChart();
}
function svg(tag,attrs={}){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));return el;}
function chartAmount(point){return chartMode==='work'?BigInt(point.value).toLocaleString(locale)+' '+t.shares:z(point.value)+' ZCL';}
function renderChart(){
 const projecting=chartMode==='projection',projectionReady=projectionAvailable();
 const points=projecting?(projectionReady?projectionHistory?.points||[]:[]):chartMode==='work'?(recipient===sessionRecipient||sessionRecipient===null?work:[]):rewards;
 $('chart').dataset.mode=chartMode;
 const drawing=$('svg');drawing.replaceChildren();
 for(const button of mount.querySelectorAll('[data-earnings-mode]'))button.setAttribute('aria-pressed',String(button.dataset.earningsMode===chartMode));
 const last=points.at(-1),value=last?chartAmount(last):'—';
 $('chart-value').textContent=(projecting?t.projection:chartMode==='work'?t.work:t.rewards)+' · '+value;
 const caption=[chartMode==='rewards'&&(failed||!snapshot||snapshot.status==='unavailable'||old(snapshot))?t.stale:'',projecting?t.projectionNote+' '+t.chartNote:chartMode==='work'?t.workNote:t.chartNote,projecting&&!projectionReady?t.projectionWait:'',chartMode==='work'&&!sessionActive?t.noMining:'',points.length===1?t.first:'',t.gap].filter(Boolean).join(' ');
 const inspector=$('chart-inspect');inspector.max=Math.max(0,points.length-1);inspector.disabled=points.length<2;
 if(!points.length){$('chart-caption').textContent=t.noPoints+' '+caption;$('chart-table').replaceChildren();return;}
 const chosen=selected!==null&&selected<points.length?selected:points.length-1;inspector.value=chosen;
 inspector.setAttribute('aria-valuetext',time(points[chosen].at)+' · '+chartAmount(points[chosen]));
 $('chart-caption').textContent=time(points[chosen].at)+' · '+chartAmount(points[chosen])+'. '+caption;
 const values=points.map(p=>Number(p.value)/(chartMode==='work'?1:1e8)),maximum=Math.max(...values,chartMode==='work'?1:0.00000001)*1.12;
 const start=Date.parse(points[0].at),span=Math.max(30000,Date.parse(last.at)-start),X=p=>64+(Date.parse(p.at)-start)/span*680,Y=v=>158-v/maximum*133;
 for(const factor of [0,.5,1]){
  const y=Y(maximum*factor);drawing.append(svg('line',{x1:64,x2:744,y1:y,y2:y,class:'chart-grid'}));
  const label=svg('text',{x:54,y:y+3,'text-anchor':'end',class:'chart-axis'});
  label.textContent=new Intl.NumberFormat(locale,{notation:'compact',maximumSignificantDigits:3}).format(maximum*factor);drawing.append(label);
 }
 let path='';points.forEach((p,i)=>{const gap=i&&Date.parse(p.at)-Date.parse(points[i-1].at)>90000;path+=(i===0||gap?'M':'L')+X(p).toFixed(2)+' '+Y(values[i]).toFixed(2)+' ';});
 drawing.append(svg('path',{d:path,class:'chart-line'}));
 drawing.append(svg('circle',{cx:X(points[chosen]),cy:Y(values[chosen]),r:5,class:'chart-dot'}));
 for(const [p,anchor]of [[points[0],'start'],[last,'end']]){const label=svg('text',{x:anchor==='start'?64:744,y:181,'text-anchor':anchor,class:'chart-axis'});label.textContent=time(p.at);drawing.append(label);}
 $('chart-table').replaceChildren();for(const point of points.slice(-15).reverse()){
  const row=document.createElement('tr');for(const value of [time(point.at),chartAmount(point)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}$('chart-table').append(row);
 }
}
function sampleWork(reset=false){
 const count=Number(counter.textContent);if(!Number.isSafeInteger(count)||count<0)return;
 if(reset||work.length&&BigInt(count)<BigInt(work.at(-1).value)){work=[];selected=null;sessionRecipient=recipient;}
 const increased=work.length&&BigInt(count)>BigInt(work.at(-1).value);
 work=observe(work,{at:new Date().toISOString(),value:String(count)});
 if(increased&&chartMode==='work'){$('chart').dataset.pulse='true';setTimeout(()=>{$('chart').dataset.pulse='false';},650);}
 renderChart();
}
async function refresh(){
 if(!recipient||document.hidden)return;
 request?.abort();const controller=new AbortController();request=controller;const expected=recipient;
 const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch('/api/miner.json?address='+encodeURIComponent(expected),{cache:'no-store',signal:controller.signal,credentials:'omit'});
  if(!response.ok)throw Error('Ledger unavailable');
  const data=await response.json();if(request!==controller||recipient!==expected)return;
  const reference=referenceTime(response);if(!validSnapshot(data,expected)||Date.parse(data.generatedAt)>reference+300000)throw Error('Invalid ledger data');
  clockOffset=reference-Date.now();snapshot=data;failed=false;
  if(data.status==='unavailable')window.ZclTreasury?.unavailable();else window.ZclTreasury?.update(data.pool?.treasury,reference);
  if(projectionAvailable()){
   const previous=projectionHistory,p=data.miner.projection;
   projectionHistory=observeProjection(previous,p,recipient);
   const changed=previous?.address===recipient&&previous.roundId===p.roundId&&previous.points.at(-1)?.value!==p.allocationZat&&Date.parse(projectionHistory.points.at(-1).at)>Date.parse(previous.points.at(-1).at);
   if(previous?.roundId!==p.roundId)selected=null;
   if(changed){$('projection').dataset.pulse='true';if(chartMode==='projection')$('chart').dataset.pulse='true';setTimeout(()=>{$('projection').dataset.pulse='false';$('chart').dataset.pulse='false';},650);}
  }
  if(data.status!=='unavailable'&&!old(data)){
   rewards=observe(rewards,{at:data.generatedAt,value:data.miner.creditedZat});
  }
  render();
 }catch{
  if(request!==controller||recipient!==expected)return;
  failed=true;render();window.ZclTreasury?.failure();
 }finally{clearTimeout(timer);if(request===controller)request=null;}
}
function selectRecipient(){
 const supplied=field.value.trim(),next=isAddress(supplied||donationAddress)?supplied||donationAddress:'';
 if(recipient===next&&snapshot){renderRecipient();return;}
 request?.abort();request=null;recipient=next;snapshot=null;failed=false;rewards=[];projectionHistory=null;selected=null;

 renderRecipient();clearFigures();renderProjection();mount.dataset.state=next?'loading':'unavailable';$('status').textContent=next?t.loading:t.invalid;renderChart();refresh();
}
for(const button of mount.querySelectorAll('[data-earnings-mode]'))button.addEventListener('click',()=>{chartMode=button.dataset.earningsMode;manualMode=true;selected=null;renderChart();});
$('chart-inspect').addEventListener('input',event=>{selected=Number(event.target.value);renderChart();});
field.addEventListener('input',()=>{clearTimeout(editTimer);request?.abort();request=null;snapshot=null;rewards=[];projectionHistory=null;recipient='';clearFigures();renderProjection();renderChart();$('status').textContent=t.loading;editTimer=setTimeout(selectRecipient,500);});
new MutationObserver(()=>sampleWork()).observe(counter,{childList:true,characterData:true,subtree:true});
new MutationObserver(()=>{const active=!stop.disabled;if(active&&!sessionActive){sessionRecipient=recipient;sampleWork(true);}sessionActive=active;renderChart();}).observe(stop,{attributes:true,attributeFilter:['disabled']});
selectRecipient();sampleWork(true);
setInterval(()=>{if(!document.hidden){sampleWork();render();refresh();}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
window.addEventListener('pagehide',()=>{request?.abort();clearTimeout(editTimer);});
}

// On-demand explanations only; no mining, counter or payout actions.
const shareHelp=[];
for(const trigger of document.querySelectorAll('[data-share-help]')){
 const tip=document.getElementById(trigger.getAttribute('aria-describedby'));
 if(!tip)continue;
 let pinned=false,hovered=false,leaveTimer;
 const close=()=>{clearTimeout(leaveTimer);pinned=false;tip.hidden=true;trigger.setAttribute('aria-expanded','false');};
 const position=()=>{
  const rect=trigger.getBoundingClientRect(),width=tip.offsetWidth,height=tip.offsetHeight;
  if(rect.bottom<0||rect.top>innerHeight){close();return;}
  const left=Math.max(16,Math.min(rect.left,innerWidth-width-16));
  const top=rect.bottom+8+height<=innerHeight-16?rect.bottom+8:Math.max(16,rect.top-height-8);
  tip.style.left=left+'px';tip.style.top=top+'px';
 };
 const open=()=>{
  clearTimeout(leaveTimer);for(const help of shareHelp)if(help.trigger!==trigger)help.close();
  tip.hidden=false;trigger.setAttribute('aria-expanded','true');position();
 };
 const leave=()=>{hovered=false;leaveTimer=setTimeout(()=>{if(!hovered&&!pinned&&document.activeElement!==trigger)close();},120);};
 for(const node of [trigger,tip]){
  node.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hovered=true;open();}});
  node.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')leave();});
 }
 trigger.addEventListener('focus',open);
 trigger.addEventListener('blur',()=>{if(!hovered)close();});
 trigger.addEventListener('click',()=>{if(pinned)close();else{pinned=true;open();}});
 shareHelp.push({trigger,tip,close,position});
}
document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const help of shareHelp)help.close();});
document.addEventListener('pointerdown',event=>{for(const help of shareHelp)if(!help.trigger.contains(event.target)&&!help.tip.contains(event.target))help.close();});
for(const event of ['resize','scroll'])window.addEventListener(event,()=>{for(const help of shareHelp)if(!help.tip.hidden)help.position();},event==='scroll');
window.addEventListener('pagehide',()=>{for(const help of shareHelp)help.close();});

// Public treasury reporting is separate from the visitor's mining destination.
(() => {
  'use strict';
  const root=document.getElementById('pool-treasury');if(!root)return;
  const es=document.documentElement.lang==='es',locale=es?'es-ES':'en-US';
  const recipient='t1Q8PRCDso9HoK36XeLCPym6vZmkwyNgS4d';
  const $=name=>document.getElementById('treasury-'+name);
  const text=es?{
    current:'Transferencias confirmadas según el registro del pool.',
    partial:'Registro parcial: ≥ indica un mínimo verificado. Los guiones no significan cero.',
    unavailable:'No se pueden verificar los ingresos de la tesorería. Los guiones no significan cero.',
    stale:'Observación desactualizada; se muestra la última verificación con su fecha.',
    failed:'No se pudo actualizar. Se conservan las últimas cifras verificadas con su fecha.',
    held:'La contabilidad requiere revisión.',canonical:'La comprobación de bloques está incompleta o no disponible.',
    checked:'Registro verificado',rounds:'Rondas sin verificar',payments:'Pagos sin verificar',
    mature:'Maduras',immature:'Inmaduras',operator:'Transferencias al operador',shared:'Pagos de minería a la dirección compartida',
    empty:'Todavía no hay ingresos confirmados registrados.',unknown:'No hay ingresos positivos verificados para representar.',
  }:{
    current:'Transfers confirmed in the pool journal.',
    partial:'Partial journal: ≥ marks a verified minimum. Dashes do not mean zero.',
    unavailable:'Treasury receipts cannot be verified. Dashes do not mean zero.',
    stale:'Stale observation; showing the last verification and its timestamp.',
    failed:'Refresh failed. Showing the last verified figures and their timestamp.',
    held:'Accounting requires review.',canonical:'The block check is incomplete or unavailable.',
    checked:'Journal checked',rounds:'Unverified rounds',payments:'Unverified payments',
    mature:'Mature',immature:'Immature',operator:'Operator transfers',shared:'Mining payouts to the shared address',
    empty:'No confirmed receipts recorded yet.',unknown:'No verified positive receipts to visualize.',
  };
  const time=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));
  const amount=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,15})$/.test(value)&&BigInt(value)<=2100000000000000n;
  const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;
  const date=new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:'UTC'});
  function exact(value,partial=false){
    if(partial&&value==='0')return '—';
    const digits=value.padStart(9,'0'),whole=BigInt(digits.slice(0,-8)).toLocaleString(locale),fraction=digits.slice(-8).replace(/0+$/,'');
    return (partial?'≥ ':'')+whole+(fraction?(es?',':'.')+fraction:'');
  }
  function valid(data){
    if(!data||data.schemaVersion!==1||data.asset!=='ZCL'||data.unit!=='zatoshi'||data.recipient!==recipient||!time(data.generatedAt)||
       !['ok','partial','unavailable'].includes(data.status)||data.coverageBasis!=='retained-pool-ledger'||
       data.allocationBasis!=='retained-ledger-block-status'||data.receivedBasis!=='confirmed-payout-journal'||data.coverageStartedAt!==null||
       !['ok','partial','stale','unavailable'].includes(data.canonicalStatus))return false;
    if(data.status==='unavailable')return data.received===null&&data.allocated===null;
    if(typeof data.accountingHeld!=='boolean'||!['unknownRounds','unknownPayments','excludedOrphanRounds'].every(key=>count(data[key])))return false;
    if(data.status==='ok'&&(data.canonicalStatus!=='ok'||data.accountingHeld||data.unknownRounds||data.unknownPayments))return false;
    if(!data.received||!['totalZat','operatorTransfersZat','sharedMiningZat'].every(key=>amount(data.received[key]))||
       BigInt(data.received.totalZat)!==BigInt(data.received.operatorTransfersZat)+BigInt(data.received.sharedMiningZat))return false;
    return ['operatorFees','otherRetained','sharedMining'].every(key=>{
      const allocation=data.allocated?.[key];
      return allocation&&['totalZat','matureZat','immatureZat'].every(name=>amount(allocation[name]))&&
        BigInt(allocation.totalZat)===BigInt(allocation.matureZat)+BigInt(allocation.immatureZat);
    });
  }
  let snapshot=null,failed=false,clockOffset=0,busy=false;
  const now=()=>Date.now()+clockOffset;
  const stale=data=>now()-Date.parse(data.generatedAt)>180000||now()-Date.parse(data.generatedAt)<-60000||data.canonicalStatus==='stale';
  function paint(){
    const unavailable=!snapshot||snapshot.status==='unavailable';
    if(unavailable){
      root.dataset.status='unavailable';for(const key of ['total','operator','shared','fees'])$(key).textContent='—';
      $('fee-detail').textContent='';$('updated').textContent='';$('status').textContent=text.unavailable;
      $('composition').setAttribute('hidden','');$('composition-note').textContent=text.unknown;return;
    }
    const partial=snapshot.status==='partial',old=stale(snapshot),received=snapshot.received,fees=snapshot.allocated.operatorFees;
    root.dataset.status=failed||old?'stale':partial?'partial':'ok';
    for(const [id,value]of [['total',received.totalZat],['operator',received.operatorTransfersZat],['shared',received.sharedMiningZat],['fees',fees.totalZat]])$(id).textContent=exact(value,partial);
    $('fee-detail').textContent=text.mature+': '+exact(fees.matureZat,partial)+' ZCL · '+text.immature+': '+exact(fees.immatureZat,partial)+' ZCL';
    const messages=[failed?text.failed:old?text.stale:partial?text.partial:text.current];
    if(partial&&(failed||old))messages.push(text.partial);
    if(snapshot.accountingHeld)messages.push(text.held);
    if(snapshot.canonicalStatus!=='ok')messages.push(text.canonical);
    if(snapshot.unknownRounds)messages.push(text.rounds+': '+snapshot.unknownRounds.toLocaleString(locale)+'.');
    if(snapshot.unknownPayments)messages.push(text.payments+': '+snapshot.unknownPayments.toLocaleString(locale)+'.');
    $('status').textContent=messages.join(' ');
    $('updated').textContent=text.checked+': '+date.format(new Date(snapshot.generatedAt))+' UTC.';
    const total=BigInt(received.totalZat),width=total>0n?Number(BigInt(received.operatorTransfersZat)*3600000n/total)/10000:0;
    $('composition').removeAttribute('hidden');$('operator-bar').setAttribute('width',String(width));
    $('shared-bar').setAttribute('x',String(width));$('shared-bar').setAttribute('width',total>0n?String(360-width):'0');
    $('composition-note').textContent=total>0n?text.operator+': '+exact(received.operatorTransfersZat,partial)+' ZCL · '+text.shared+': '+exact(received.sharedMiningZat,partial)+' ZCL':partial?text.unknown:text.empty;
  }
  function unavailable(){snapshot=null;failed=false;paint();}
  function update(data,reference=Date.now()){
    if(!valid(data)||!Number.isFinite(reference)||Date.parse(data.generatedAt)>reference+60000){unavailable();return;}
    clockOffset=reference-Date.now();
    const increased=snapshot?.status==='ok'&&data.status==='ok'&&!stale(snapshot)&&!stale(data)&&BigInt(data.received.totalZat)>BigInt(snapshot.received.totalZat);
    snapshot=data;failed=false;paint();
    if(increased){root.dataset.receipt='new';setTimeout(()=>{root.dataset.receipt='';},700);}
  }
  function failure(){failed=true;paint();}
  window.ZclTreasury=Object.freeze({update,failure,unavailable});
  async function refresh(){
    if(busy||document.hidden)return;busy=true;
    try{
      const response=await fetch(root.dataset.endpoint,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Treasury source unavailable');
      const data=await response.json();if(data?.schemaVersion!==1||data.asset!=='ZCL')throw Error('Invalid source');
      const server=Date.parse(response.headers.get('date')),ageHeader=response.headers.get('age'),age=ageHeader===null?0:Number(ageHeader)*1000;
      if(!Number.isFinite(age)||age<0||age>180000)throw Error('Stale source');
      if(data.status==='unavailable')unavailable();else update(data.pool?.treasury,Number.isFinite(server)?server+age:Date.now());
    }catch{failure();}finally{busy=false;}
  }
  if(root.dataset.endpoint)refresh();
  setInterval(()=>{if(document.hidden)return;paint();if(root.dataset.endpoint)refresh();},30000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)return;paint();if(root.dataset.endpoint)refresh();});
})();
