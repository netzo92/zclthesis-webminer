import {createSolver,preferredLimits,estimateRequirements} from './solver.mjs';
import {parseJob,makeHeader,hex,unhex,meetsTarget} from './protocol.mjs';

// Injectable dependencies permit finite lifecycle tests without a GPU or pool.
// Every asynchronous callback and GPU resource belongs to exactly one session.
export function createMinerController(options={}) {
  const env={
    postMessage:message=>globalThis.postMessage(message),
    WebSocket:globalThis.WebSocket, gpu:globalThis.navigator?.gpu,
    crypto:globalThis.crypto, createSolver, preferredLimits, estimateRequirements,
    meetsTarget, now:()=>Date.now(), performanceNow:()=>performance.now(),
    setTimeout:(fn,ms)=>setTimeout(fn,ms), clearTimeout:id=>clearTimeout(id),
    ...options,
  };
  let current;
  const send=(type,detail={})=>env.postMessage({...detail,type});
  function stop(session,reason='Stopped') {
    if(!session) return Promise.resolve();
    if(session.stopping) return session.stopping;
    session.active=false;
    env.clearTimeout(session.timer);
    session.abort?.abort();
    // Install stopping before close, which can synchronously invoke onclose.
    session.stopping=Promise.resolve().then(async()=>{
      session.socket?.close();
      await Promise.allSettled([...session.tasks]);
      try {session.solver?.dispose();}
      finally {
        session.device?.destroy();
        if(current===session) {current=undefined;send('stopped',{message:reason});}
      }
    });
    return session.stopping;
  }
  function task(session,operation) {
    const promise=Promise.resolve().then(operation).catch(error=>{
      if(session.active) {send('error',{message:error.message});void stop(session,'Mining stopped');}
    }).finally(()=>session.tasks.delete(promise));
    session.tasks.add(promise);
    return promise;
  }
  function eligible(session,work) {
    return session.active&&env.now()<session.deadline&&
      session.socket?.readyState===env.WebSocket.OPEN&&
      session.job?.previousHash===work.previousHash;
  }
  function loop(session) {
    if(session.loopRunning||!session.active||!session.solver||!session.job||
       !session.target||!session.noncePrefix||!session.authorized) return;
    session.loopRunning=true;
    task(session,async()=>{
      try {
        while(session.active&&env.now()<session.deadline) {
          const work=session.job,workTarget=session.target;
          const nonce=env.crypto.getRandomValues(new Uint8Array(28));
          const header=makeHeader(work,session.noncePrefix,nonce);
          const abort=new AbortController();session.abort=abort;
          const started=env.performanceNow();session.solveStarted??=started;
          let previousProgress=0,proofs,completion;
          try {
            proofs=await session.solver.solve(header,{signal:abort.signal,onProgress:progress=>{
              if(progress.stage==='complete') completion=progress;
              if(session.active&&(env.performanceNow()-previousProgress>500||progress.stage==='complete')) {
                send('progress',progress);previousProgress=env.performanceNow();
              }
            }});
          } catch(error) {
            if(abort.signal.aborted) {if(session.active) continue;break;}
            throw error;
          }
          if(!session.active) break;
          const finished=env.performanceNow();
          send('attempt',{id:++session.attemptId,solutions:proofs.length,seconds:(finished-started)/1000,
            elapsedSeconds:(finished-session.solveStarted)/1000,
            droppedRows:completion?.droppedRows??null,droppedCandidates:completion?.droppedCandidates??null});
          for(const proof of proofs) {
            if(!eligible(session,work)||abort.signal.aborted) break;
            const qualifies=await env.meetsTarget(header,proof,workTarget);
            // Stop, disconnection or a new block can arrive during SHA256.
            if(qualifies&&eligible(session,work)&&!abort.signal.aborted) {
              session.socket.send(JSON.stringify({type:'submit',id:++session.shareId,
                job:work.id,time:work.time,nonce:hex(nonce),solution:'fd9001'+hex(proof)}));
              send('submitted');
            }
          }
        }
      } finally {
        session.loopRunning=false;
        if(session.active&&env.now()>=session.deadline) void stop(session,'Session time limit reached');
      }
    });
  }
  function receive(session,data) {
    if(!session.active) return;
    try {
      const message=JSON.parse(data);
      if(message.type==='session') {
        unhex(message.noncePrefix,4);
        if(session.noncePrefix!==undefined) throw new Error('Unexpected mining session replacement.');
        session.noncePrefix=message.noncePrefix;loop(session);
      } else if(message.type==='authorized') {
        if(session.authorized) throw new Error('Duplicate pool authorization.');
        session.authorized=true;send('authorized',message);
        send('status',{message:'Preparing GPU memory and shaders'});
        task(session,async()=>{
          const adapter=await env.gpu.requestAdapter({powerPreference:'high-performance'});
          if(!session.active) return;
          if(!adapter) throw new Error('No compatible hardware GPU is available.');
          session.device=await adapter.requestDevice({requiredLimits:env.preferredLimits(adapter.limits)});
          if(!session.active) return;
          session.device.lost.then(info=>{
            if(session.active) {send('error',{message:'GPU device lost: '+info.message});void stop(session,'GPU stopped');}
          });
          send('requirements',{bytes:env.estimateRequirements(session.device.limits).bytes});
          session.solver=await env.createSolver(session.device);
          if(session.active) loop(session);
        });
      } else if(message.type==='target') {
        unhex(message.target,32);session.target=message.target;loop(session);
      } else if(message.type==='job') {
        const next=parseJob(message.params);
        if(session.job&&next.previousHash!==session.job.previousHash) session.abort?.abort();
        session.job=next;send('work',{id:next.id});loop(session);
      } else if(message.type==='share') send('share',message);
      else if(message.type==='error') throw new Error(message.message);
    } catch(error) {send('error',{message:error.message});void stop(session,'Mining stopped');}
  }
  return async function handleMessage(data) {
    if(data?.type==='stop') {await stop(current);return;}
    if(data?.type!=='start'||current) return;
    try {
      const endpoint=new URL(data.endpoint);
      if(endpoint.protocol!=='wss:'||endpoint.hostname!=='pool.zclthesis.com'||endpoint.pathname!=='/ws'||endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash) throw new Error('Invalid pool endpoint.');
      if(!env.gpu) throw new Error('This browser does not support WebGPU. Try current Chrome or Edge with hardware acceleration.');
      const unlimited=data.minutes==='unlimited',minutes=Number(data.minutes);
      if(!unlimited&&(!Number.isFinite(minutes)||minutes<1||minutes>60)) throw new Error('Choose a session from 1 to 60 minutes, or Until I stop.');
      const session={active:true,deadline:unlimited?Infinity:env.now()+minutes*60000,tasks:new Set(),shareId:0,attemptId:0};
      current=session;
      if(!unlimited) session.timer=env.setTimeout(()=>void stop(session,'Session time limit reached'),minutes*60000);
      send('status',{message:'Connecting to the pool'});
      session.socket=new env.WebSocket(endpoint);
      session.socket.onopen=()=>{
        if(session.active) session.socket.send(JSON.stringify({type:'hello',address:data.address}));
      };
      session.socket.onclose=()=>{if(session.active) void stop(session,'Pool disconnected; mining stopped');};
      session.socket.onerror=()=>{
        if(session.active) {send('error',{message:'Pool connection unavailable. Check the pool synchronization status.'});void stop(session,'Pool disconnected; mining stopped');}
      };
      session.socket.onmessage=event=>receive(session,event.data);
    } catch(error) {send('error',{message:error.message});await stop(current,'Mining stopped');}
  };
}

if(typeof self!=='undefined'&&typeof self.postMessage==='function') {
  const handleMessage=createMinerController();
  self.onmessage=({data})=>void handleMessage(data);
}
