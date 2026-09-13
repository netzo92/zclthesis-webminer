const es=document.documentElement.lang==='es',$=id=>document.getElementById(id);
let worker,ticker,started,stopping=false,poolOpen=false,checkingPool=false;
const counts={solutions:0,submitted:0,accepted:0,rejected:0};
const status=text=>$('status').textContent=text;
// The owner explicitly approved publishing this recipient for blank-address donations.
const poolDonationAddress='t1Q8PRCDso9HoK36XeLCPym6vZmkwyNgS4d';
function renderAddressWarning(){
  const donating=!(typeof $('address').value==='string'&&$('address').value.trim());
  $('address-warning').hidden=!donating;
  $('donation-address').textContent=poolDonationAddress;
  $('donation-consent').required=donating;
  $('donation-consent').disabled=!!worker||!donating;
  $('start').textContent=donating?(es?'Iniciar minería como donación':'Start donation mining'):(es?'Iniciar minería':'Start mining');
}
$('address').addEventListener('input',()=>{
  $('donation-consent').checked=false;$('consent').checked=false;renderAddressWarning();
});
renderAddressWarning();
const messages={
  'Connecting to the pool':'Conectando al pool','Preparing GPU memory and shaders':'Preparando la memoria GPU y los shaders',
  'Stopped':'Detenido','Session ended':'Sesión finalizada','Mining stopped':'Minería detenida','Session time limit reached':'Se alcanzó el límite de tiempo',
  'Pool disconnected; mining stopped':'Pool desconectado; minería detenida',
  'This browser does not support WebGPU. Try current Chrome or Edge with hardware acceleration.':'Este navegador no admite WebGPU. Prueba Chrome o Edge actuales con aceleración por hardware.',
  'Pool connection unavailable. Check the pool synchronization status.':'Conexión al pool no disponible. Comprueba el estado de sincronización del pool.',
  'Pool authorization timed out.':'Se agotó el tiempo de espera para la autorización del pool.',
  'No compatible hardware GPU is available.':'No hay una GPU compatible disponible.',
  'Enter a valid ZCL transparent address.':'Introduce una dirección transparente ZCL válida.',
  'Choose a session from 1 to 60 minutes, or Until I stop.':'Elige una sesión de 1 a 60 minutos, o Hasta que la detenga.',
  'The mining pool is unavailable.':'El pool de minería no está disponible.'
};
function text(message){return es?(messages[message]||'La minería se detuvo por un error técnico. Consulta el estado del pool y comprueba que tu navegador y GPU sean compatibles.'):message;}
function finish(){clearInterval(ticker);worker?.terminate();worker=undefined;$('start').disabled=!poolOpen;$('stop').disabled=true;$('address').disabled=false;$('minutes').disabled=false;$('progress').value=0;$('donation-consent').checked=false;renderAddressWarning();}
function observedTime(response,localNow){
  const raw=response.headers?.get?.('date'),serverNow=Date.parse(raw);
  const rawAge=response.headers?.get?.('age'),age=rawAge==null?0:Number(rawAge)*1000;
  if(!Number.isFinite(age)||age<0||age>180000)throw new Error('cached');
  return typeof raw==='string'&&Number.isFinite(serverNow)?{now:serverNow+age,server:true}:{now:localNow,server:false};
}
function observationProblem(value,now){
  const age=now-Date.parse(value);
  if(typeof value!=='string'||!Number.isFinite(age))return 'invalid';
  if(age>180000)return 'stale';
  if(age< -300000)return 'future';
  return null;
}
function poolMessage(reason){
  const translations={
    ready:['The pool is ready to accept miners.','El pool está listo para aceptar mineros.'],
    stale:['The pool or node status is over 3 minutes old. Start is paused until fresh data arrives.','El estado del pool o del nodo tiene más de 3 minutos. El inicio está en pausa hasta recibir datos recientes.'],
    future:['The pool or node status has an inconsistent future timestamp. Retry after its clock is corrected.','El estado del pool o del nodo tiene una fecha futura incoherente. Reintenta cuando se corrija su reloj.'],
    invalid:['The pool returned an invalid status timestamp. Start is paused; retry the status check.','El pool devolvió una fecha de estado no válida. El inicio está en pausa; reintenta la comprobación.'],
    config:['The pool configuration does not match this ZCL miner and its 0.8% fee. Start is paused.','La configuración del pool no coincide con este minero ZCL y su comisión del 0,8%. El inicio está en pausa.'],
    syncing:['The pool node is synchronizing or checking its chain. Start will become available when it is ready.','El nodo del pool está sincronizando o comprobando su cadena. El inicio estará disponible cuando esté listo.'],
    paused:['The pool is temporarily not accepting miners. Its status will refresh automatically.','El pool no está aceptando mineros temporalmente. El estado se actualizará automáticamente.'],
    timeout:['The pool status request timed out after 8 seconds. Check your connection and retry.','La consulta del estado del pool agotó el tiempo de espera de 8 segundos. Comprueba tu conexión y reintenta.'],
    unavailable:['The pool status could not be loaded. Check your connection and retry.','El estado del pool no se pudo cargar. Comprueba tu conexión y reintenta.'],
    cached:['The pool response is an old cached copy. Retry to request current status.','La respuesta del pool es una copia antigua en caché. Reintenta para solicitar el estado actual.']
  };
  return translations[reason]?.[es?1:0]||translations.unavailable[es?1:0];
}
function renderPoolStats(pool,node){
  const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString(es?'es':'en',{maximumFractionDigits:2}):'—';
  $('pool-block').textContent=number(node?.chain?.height);
  $('pool-peers').textContent=number(node?.node?.connections);
  $('pool-network-rate').textContent=typeof node?.mining?.networkSolps==='number'?number(node.mining.networkSolps)+' Sol/s':'—';
  $('pool-fee').textContent=typeof pool?.feePercent==='number'?number(pool.feePercent)+'%':'—';
  $('pool-minimum').textContent=typeof pool?.payoutMinimumZcl==='string'&&/^\d+(?:\.\d+)?$/.test(pool.payoutMinimumZcl)?pool.payoutMinimumZcl+' ZCL':'—';
  const updated=Date.parse(pool?.generatedAt);
  $('pool-updated').textContent=Number.isFinite(updated)?(es?'Datos del pool: ':'Pool data: ')+new Date(updated).toISOString().replace('T',' ').replace('.000Z',' UTC'):'—';
}
async function checkPool(){
  if(checkingPool)return;
  checkingPool=true;$('pool-retry').disabled=true;
  const controller=new AbortController();let timer;
  try{
    const responses=Promise.all(['/api/pool.json','/api/node.json'].map(async url=>{
      const response=await fetch(url,{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('unavailable');
      return {response,value:await response.json()};
    }));
    const [poolResult,nodeResult]=await Promise.race([responses,new Promise((_,reject)=>{
      timer=setTimeout(()=>{reject(new Error('timeout'));controller.abort();},8000);
    })]);
    const pool=poolResult.value,node=nodeResult.value,localNow=Date.now();
    if(pool?.schemaVersion!==1||pool?.asset!=='ZCL'||node?.schemaVersion!==1||node?.asset!=='ZCL')throw new Error('config');
    const poolTime=observedTime(poolResult.response,localNow),nodeTime=observedTime(nodeResult.response,localNow);
    renderPoolStats(pool,node);
    const skew=[poolTime,nodeTime].some(clock=>clock.server&&Math.abs(clock.now-localNow)>300000);
    $('pool-clock').textContent=skew?(es?'El reloj de tu dispositivo difiere del servidor. Usamos la hora HTTPS del servidor para comprobar la actualidad de los datos.':'Your device clock differs from the server. Freshness is checked against the HTTPS server time.'):
      !poolTime.server||!nodeTime.server?(es?'Hora del servidor no disponible; comprobamos la actualidad con el reloj de este dispositivo.':'Server time is unavailable; freshness is checked against this device’s clock.') : '';
    const reason=observationProblem(pool?.generatedAt,poolTime.now)||observationProblem(node?.generatedAt,nodeTime.now)||
      (pool?.feePercent!==0.8||node?.asset!=='ZCL'?'config':node?.node?.synced!==true?'syncing':pool?.acceptingMiners!==true?'paused':'ready');
    poolOpen=reason==='ready';$('pool-readiness').textContent=poolMessage(reason);
  }catch(error){
    poolOpen=false;renderPoolStats(null,null);$('pool-clock').textContent='';
    $('pool-readiness').textContent=poolMessage(error.message);
  }finally{
    clearTimeout(timer);controller.abort();checkingPool=false;$('pool-retry').disabled=false;
    if(!worker)$('start').disabled=!poolOpen;
  }
}
$('pool-retry').addEventListener('click',checkPool);
checkPool();setInterval(()=>{if(!document.hidden)checkPool();},30000);
window.addEventListener('online',checkPool);
function stop(message){if(!worker)return;stopping=true;worker.postMessage({type:'stop'});status(message);finish();}
$('stop').addEventListener('click',()=>stop(es?'Detenido. Tu GPU no está minando.':'Stopped. Your GPU is not mining.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop(es?'Pestaña oculta: minería detenida.':'Tab hidden: mining stopped.');else checkPool();});
window.addEventListener('pagehide',()=>{worker?.terminate();});
$('mining-form').addEventListener('submit',event=>{
  event.preventDefault();if(worker||!poolOpen||!$('consent').checked)return;
  const suppliedAddress=$('address').value.trim(),donating=!suppliedAddress;
  if(donating&&!$('donation-consent').checked){status(es?'Confirma que quieres donar las recompensas de esta sesión al pool. No recibirás pagos.':'Confirm that you want to donate this session’s rewards to the pool. You will receive no payouts.');return;}
  const address=suppliedAddress||poolDonationAddress;
  if(!/^t1[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)){status(es?'Introduce una dirección transparente ZCL válida.':'Enter a valid ZCL transparent address.');return;}
  if(!navigator.gpu){status(text('This browser does not support WebGPU. Try current Chrome or Edge with hardware acceleration.'));return;}
  stopping=false;for(const key in counts){counts[key]=0;$(key).textContent='0';}
  $('address-line').textContent=(donating?(es?'Donación al pool; no recibirás pagos. Destino: ':'Donating to the pool; you receive no payouts. Destination: '):(es?'Dirección de pago: ':'Payout address: '))+address;
  started=Date.now();$('elapsed').textContent='0:00';ticker=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('elapsed').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');},1000);
  $('start').disabled=true;$('stop').disabled=false;$('address').disabled=true;$('minutes').disabled=true;$('donation-consent').disabled=true;
  worker=new Worker('/mine/src/miner-worker.mjs?v=20260912-unlimited',{type:'module'});
  worker.onerror=()=>{status(es?'Error del minero; minería detenida.':'Miner error; mining stopped.');finish();};
  worker.onmessage=({data})=>{
    if(data.type==='error'){status(text(data.message));stopping=true;finish();}
    else if(data.type==='stopped'){if(!stopping)status(text(data.message));finish();}
    else if(data.type==='status')status(text(data.message));
    else if(data.type==='authorized')status(es?'Dirección autorizada por el pool.':'Payout address authorized by the pool.');
    else if(data.type==='progress'){
      $('progress').value=data.total?data.completed/data.total:0;
      status(data.stage==='hash'?(es?'Calculando hashes en tu GPU…':'Computing hashes on your GPU…'):data.stage==='collision'?(es?'Ronda de colisión ':'Collision round ')+data.round+'/6':(es?'Comprobando soluciones…':'Checking solutions…'));
    }else if(data.type==='attempt'){counts.solutions+=data.solutions;$('solutions').textContent=counts.solutions;}
    else if(data.type==='submitted'){$('submitted').textContent=++counts.submitted;}
    else if(data.type==='share'){const key=data.accepted?'accepted':'rejected';$(key).textContent=++counts[key];}
  };
  const duration=$('minutes').value;
  worker.postMessage({type:'start',address,minutes:duration==='unlimited'?'unlimited':Number(duration),endpoint:'wss://pool.zclthesis.com/ws'});
});
