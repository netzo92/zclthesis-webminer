import http from 'node:http';
import net from 'node:net';
import {readFile} from 'node:fs/promises';
import {WebSocketServer,WebSocket} from 'ws';
import {isZclAddress,validSubmit} from './validation.mjs';
import {parseJob} from '../src/protocol.mjs';

// This is a restricted mining transport, with one fixed localhost Stratum upstream.
// It has no daemon RPC access, private keys, payout authority, or arbitrary proxy target.
const port=Number(process.env.ZCL_BRIDGE_PORT||8787),stratumPort=Number(process.env.ZCL_STRATUM_PORT||2192);
const origins=new Set((process.env.ZCL_MINER_ORIGINS||'https://pool.zclthesis.com').split(','));
const statusPath=process.env.ZCL_NODE_STATUS||'/var/lib/zcl-public/api/node.json';
const poolStatusPath=process.env.ZCL_POOL_STATUS||'/var/lib/zcl-public/api/pool.json';
// Optional private deployment setting for a bounded operator test before launch.
const testAddress=process.env.ZCL_TEST_PAYOUT_ADDRESS;
const server=http.createServer((_req,res)=>{res.writeHead(404);res.end();});
const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
const peers=new Map();
let pendingUpgrades=0;
server.on('upgrade',async(req,socket,head)=>{
  // Caddy must replace X-Forwarded-For with {http.request.remote.host}.
  // Reject chains and arbitrary strings rather than letting them split limits.
  const forwarded=req.headers['x-forwarded-for'];
  const onSocketError=()=>socket.destroy();socket.on('error',onSocketError);
  if(forwarded!==undefined&&(typeof forwarded!=='string'||!net.isIP(forwarded))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  const ip=forwarded||req.socket.remoteAddress;
  if(req.url!=='/ws'||!origins.has(req.headers.origin)||wss.clients.size+pendingUpgrades>=64||(peers.get(ip)||0)>=4){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  // Reserve before awaiting disk I/O. Aborted/invalid handshakes also release
  // their reservation, so they cannot permanently consume a visitor's limit.
  ++pendingUpgrades;peers.set(ip,(peers.get(ip)||0)+1);
  let released=false;
  const release=()=>{if(released)return;released=true;const count=(peers.get(ip)||1)-1;if(count)peers.set(ip,count);else peers.delete(ip);};
  socket.once('close',release);
  let testingOnly=false;
  try {
    const status=JSON.parse(await readFile(statusPath,'utf8')),age=Date.now()-Date.parse(status.generatedAt);
    if(status.node?.synced!==true||!Number.isFinite(age)||age>180000||age < -300000)throw new Error();
    let pool;try{pool=JSON.parse(await readFile(poolStatusPath,'utf8'));}catch{}
    if(pool?.acceptingMiners!==true||pool?.feePercent!==0.8){if(!isZclAddress(testAddress))throw new Error();testingOnly=true;}
    if(socket.destroyed)return;
    wss.handleUpgrade(req,socket,head,ws=>{
      socket.removeListener('error',onSocketError);socket.removeListener('close',release);
      ws.testingOnly=testingOnly;ws.once('close',release);wss.emit('connection',ws);
    });
  }
  catch {if(!socket.destroyed)socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');}
  finally {--pendingUpgrades;}
});
wss.on('connection',ws=>{
  let upstream,address,authorized=false,failed=false,buffer='',sequence=10,last=Date.now(),tokens=12;
  const jobs=new Map(),pending=new Map();
  const send=value=>{if(ws.readyState===WebSocket.OPEN){if(ws.bufferedAmount>65536){ws.terminate();return;}ws.send(JSON.stringify(value));}};
  const fail=message=>{if(failed)return;failed=true;send({type:'error',message});upstream?.destroy();ws.close(1008,'Mining session ended');};
  const rpc=(id,method,params)=>upstream.write(JSON.stringify({id,method,params})+'\n');
  const helloTimeout=setTimeout(()=>fail('Mining address was not supplied.'),10000);
  const lifetime=setTimeout(()=>fail('Session finished. Start a new session to continue.'),61*60*1000);
  let alive=true;
  const heartbeat=setInterval(()=>{if(!alive){ws.terminate();return;}alive=false;ws.ping();},30000);
  ws.on('pong',()=>{alive=true;});
  ws.on('error',()=>{});
  ws.on('close',()=>{clearTimeout(helloTimeout);clearTimeout(lifetime);clearInterval(heartbeat);upstream?.destroy();});
  ws.on('message',(raw,binary)=>{
    if(failed||ws.readyState!==WebSocket.OPEN)return;
    const now=Date.now();tokens=Math.min(12,tokens+(now-last)/1000);last=now;
    if(binary||--tokens<0){fail('Too many messages.');return;}
    let message;try{message=JSON.parse(raw.toString());}catch{fail('Invalid message.');return;}
    if(!address){
      if(message?.type!=='hello'||!isZclAddress(message.address)){fail('Enter a valid ZCL transparent address.');return;}
      if(ws.testingOnly&&message.address!==testAddress){fail('The pool is still completing its launch checks.');return;}
      clearTimeout(helloTimeout);address=message.address;
      upstream=net.createConnection({host:'127.0.0.1',port:stratumPort});
      upstream.setTimeout(120000);upstream.on('timeout',()=>fail('Pool connection timed out.'));
      upstream.on('error',()=>fail('The mining pool is unavailable.'));
      upstream.on('close',()=>{if(ws.readyState===WebSocket.OPEN)fail('Pool connection closed.');});
      upstream.on('connect',()=>rpc(1,'mining.subscribe',['zclthesis-webminer/0.1']));
      upstream.on('data',chunk=>{
        buffer+=chunk.toString();if(buffer.length>65536){fail('Invalid pool response.');return;}
        let newline;while((newline=buffer.indexOf('\n'))!==-1){
          const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
          try{
            const reply=JSON.parse(line);
            if(reply.id===1){
              if(reply.error||!Array.isArray(reply.result)||!/^[0-9a-f]{8}$/i.test(reply.result[1]))throw new Error();
              send({type:'session',noncePrefix:reply.result[1]});rpc(2,'mining.authorize',[address,'c=ZCL']);
            }else if(reply.id===2){authorized=reply.result===true&&!reply.error;if(!authorized){fail('The pool rejected this payout address.');return;}send({type:'authorized',address,feePercent:0.8});}
            else if(reply.method==='mining.set_target'){
              const target=reply.params?.[0];if(typeof target!=='string'||!/^[0-9a-f]{64}$/i.test(target))throw new Error();send({type:'target',target});
            }else if(reply.method==='mining.notify'){
              const job=parseJob(reply.params);jobs.set(job.id,{time:job.time,received:Date.now()});while(jobs.size>8)jobs.delete(jobs.keys().next().value);send({type:'job',params:reply.params});
            }else if(pending.has(reply.id)){
              send({type:'share',id:pending.get(reply.id),accepted:reply.result===true&&!reply.error,message:reply.error?'Pool rejected share.':undefined});pending.delete(reply.id);
            }
          }catch{fail('The pool returned incompatible mining work.');return;}
        }
      });return;
    }
    if(!authorized||!validSubmit(message,jobs)||message.time!==jobs.get(message.job).time||Date.now()-jobs.get(message.job).received>120000||pending.size>=16){fail('Invalid or expired share.');return;}
    const id=++sequence;pending.set(id,message.id);rpc(id,'mining.submit',[address,message.job,message.time,message.nonce,message.solution]);
  });
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({service:'zcl-miner-bridge',port:server.address().port,stratumPort})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{for(const ws of wss.clients)ws.terminate();wss.close();server.close();});
