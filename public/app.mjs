const es=document.documentElement.lang==='es',$=id=>document.getElementById(id);
let worker,ticker,started,stopping=false,poolOpen=false;
const counts={solutions:0,submitted:0,accepted:0,rejected:0};
const status=text=>$('status').textContent=text;
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
function finish(){clearInterval(ticker);worker?.terminate();worker=undefined;$('start').disabled=!poolOpen;$('stop').disabled=true;$('address').disabled=false;$('minutes').disabled=false;$('progress').value=0;}
async function checkPool(){
  try{
    const [poolResponse,nodeResponse]=await Promise.all([fetch('/api/pool.json',{cache:'no-store'}),fetch('/api/node.json',{cache:'no-store'})]);
    if(!poolResponse.ok||!nodeResponse.ok)throw new Error();
    const [pool,node]=await Promise.all([poolResponse.json(),nodeResponse.json()]);
    const now=Date.now(),fresh=[pool.generatedAt,node.generatedAt].every(value=>{
      const age=now-Date.parse(value);
      return typeof value==='string'&&Number.isFinite(age)&&age>=-300000&&age<=180000;
    });
    poolOpen=pool.acceptingMiners===true&&pool.feePercent===0.8&&node.asset==='ZCL'&&node.node?.synced===true&&fresh;
    $('pool-readiness').textContent=poolOpen?(es?'El pool está listo para aceptar mineros.':'The pool is ready to accept miners.'):(es?'El pool está completando sus comprobaciones de lanzamiento y la sincronización. La minería aún no está abierta.':'The pool is completing launch checks and synchronization. Mining is not open yet.');
  }catch{poolOpen=false;$('pool-readiness').textContent=es?'El estado del pool no está disponible. Espera a que se confirme antes de empezar.':'Pool status is unavailable. Wait for readiness to be confirmed before starting.';}
  if(!worker)$('start').disabled=!poolOpen;
}
checkPool();setInterval(()=>{if(!document.hidden)checkPool();},30000);
function stop(message){if(!worker)return;stopping=true;worker.postMessage({type:'stop'});status(message);finish();}
$('stop').addEventListener('click',()=>stop(es?'Detenido. Tu GPU no está minando.':'Stopped. Your GPU is not mining.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop(es?'Pestaña oculta: minería detenida.':'Tab hidden: mining stopped.');});
window.addEventListener('pagehide',()=>{worker?.terminate();});
$('mining-form').addEventListener('submit',event=>{
  event.preventDefault();if(worker||!poolOpen||!$('consent').checked)return;
  const address=$('address').value.trim();if(!/^t1[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)){status(es?'Introduce una dirección transparente ZCL válida.':'Enter a valid ZCL transparent address.');return;}
  if(!navigator.gpu){status(text('This browser does not support WebGPU. Try current Chrome or Edge with hardware acceleration.'));return;}
  stopping=false;for(const key in counts){counts[key]=0;$(key).textContent='0';}
  $('address-line').textContent=(es?'Dirección de pago: ':'Payout address: ')+address;
  started=Date.now();$('elapsed').textContent='0:00';ticker=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);$('elapsed').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');},1000);
  $('start').disabled=true;$('stop').disabled=false;$('address').disabled=true;$('minutes').disabled=true;
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
