import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';
import {isFreshTimestamp,validSubmit} from '../bridge/validation.mjs';
const address='t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs'; // Public test key only.
const params=['1','04000000','11'.repeat(32),'22'.repeat(32),'00'.repeat(32),'01020304','ffff001f',true,'192_7','ZcashPoW'];
const fresh=()=>({generatedAt:new Date().toISOString(),node:{synced:true}});
const freshPool=()=>({generatedAt:new Date().toISOString(),acceptingMiners:true,feePercent:0.8});

test('status freshness uses finite timestamps with exact three-minute age and five-minute future bounds',()=>{
  const now=Date.parse('2026-09-12T12:00:00Z');
  for(const offset of [-180000,0,300000])assert.equal(isFreshTimestamp(new Date(now+offset).toISOString(),now),true);
  for(const offset of [-180001,300001])assert.equal(isFreshTimestamp(new Date(now+offset).toISOString(),now),false);
  for(const value of [undefined,null,0,{},[],'','invalid'])assert.equal(isFreshTimestamp(value,now),false);
});

test('JSON objects in every submit field are rejected without primitive coercion',()=>{
  const good={type:'submit',id:1,job:'1',time:'01020304',nonce:'00'.repeat(28),solution:'fd9001'+'00'.repeat(400)};
  const jobs=new Map([['1',{}]]);
  for(const field of Object.keys(good)) for(const bad of [null,[],{},JSON.parse('{"toString":null,"valueOf":null}')]) {
    assert.doesNotThrow(()=>assert.equal(Boolean(validSubmit({...good,[field]:bad},jobs)),false));
  }
});

test('bridge rejects closed/stale/foreign-origin launches and survives malformed and aborted clients',{timeout:15000},async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zcl-bridge-security-'));
  const status=path.join(dir,'node.json'),poolStatus=path.join(dir,'pool.json');
  const saveNode=value=>writeFile(status,JSON.stringify(value));
  const savePool=value=>writeFile(poolStatus,JSON.stringify(value));
  await saveNode(fresh());await savePool(freshPool());
  let connections=0;const received=[],tcpSockets=new Set();
  const upstream=net.createServer(socket=>{
    connections++;tcpSockets.add(socket);socket.on('close',()=>tcpSockets.delete(socket));socket.on('error',()=>{});
    let buffer='';socket.on('data',chunk=>{
      buffer+=chunk;let end;
      while((end=buffer.indexOf('\n'))>=0){
        const request=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);received.push(request);
        const send=value=>socket.write(JSON.stringify(value)+'\n');
        if(request.method==='mining.subscribe')send({id:request.id,result:[null,'00000000'],error:null});
        if(request.method==='mining.authorize'){
          send({id:request.id,result:true,error:null});
          send({id:null,method:'mining.set_target',params:['ff'.repeat(32)]});
          send({id:null,method:'mining.notify',params});
        }
      }
    });
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const child=spawn(process.execPath,['bridge/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,
    ZCL_BRIDGE_PORT:'0',ZCL_STRATUM_PORT:String(upstream.address().port),ZCL_MINER_ORIGINS:'https://pool.zclthesis.com',
    ZCL_NODE_STATUS:status,ZCL_POOL_STATUS:poolStatus,ZCL_TEST_PAYOUT_ADDRESS:''},stdio:['ignore','pipe','pipe']});
  const sockets=[];let stderr='';child.stderr.on('data',chunk=>stderr+=chunk);
  t.after(async()=>{
    for(const socket of sockets)socket.terminate();for(const socket of tcpSockets)socket.destroy();
    if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
    upstream.close();await rm(dir,{recursive:true,force:true});
  });
  const [startup]=await once(child.stdout,'data');const port=JSON.parse(startup.toString()).port;
  const endpoint='ws://127.0.0.1:'+port+'/ws';
  function client(origin='https://pool.zclthesis.com',headers={}) {
    const ws=new WebSocket(endpoint,{origin,headers});sockets.push(ws);ws.on('error',()=>{});return ws;
  }
  async function denied(code,origin,headers) {
    const ws=client(origin,headers);
    const statusCode=await new Promise((resolve,reject)=>{
      ws.once('open',()=>reject(new Error('Unexpected accepted launch')));
      ws.once('unexpected-response',(req,res)=>{res.resume();req.destroy();resolve(res.statusCode);});
    });
    assert.equal(statusCode,code);
  }
  await denied(403,'https://foreign.example');
  await denied(403,undefined,{'x-forwarded-for':'1.2.3.4, 5.6.7.8'});
  await savePool({...freshPool(),acceptingMiners:false});await denied(503);
  await savePool({...freshPool(),feePercent:1});await denied(503);
  // A fresh node must not make stale, missing or future-dated pool flags valid.
  for(const generatedAt of [undefined,null,'invalid',new Date(Date.now()-181000).toISOString(),new Date(Date.now()+301000).toISOString()]) {
    await savePool({...freshPool(),generatedAt});await denied(503);
  }
  await rm(poolStatus);await denied(503);
  await savePool(freshPool());
  for(const generatedAt of ['invalid',new Date(Date.now()-181000).toISOString(),new Date(Date.now()+301000).toISOString()]) {
    await saveNode({generatedAt,node:{synced:true}});await denied(503);
  }
  await saveNode({...fresh(),node:{synced:false}});await denied(503);
  assert.equal(connections,0);
  await saveNode(fresh());

  // Invalid WebSocket handshakes must not leak all four per-IP reservations.
  for(let i=0;i<5;i++) await new Promise((resolve,reject)=>{
    const socket=net.createConnection({port,host:'127.0.0.1'});socket.on('error',reject);socket.on('data',()=>{});socket.on('close',resolve);
    socket.on('connect',()=>socket.end('GET /ws HTTP/1.1\r\nHost: localhost\r\nOrigin: https://pool.zclthesis.com\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: invalid\r\nSec-WebSocket-Version: 13\r\n\r\n'));
  });
  const ws=client();await once(ws,'open');
  const job=new Promise(resolve=>ws.on('message',raw=>{if(JSON.parse(raw).type==='job')resolve();}));
  ws.send(JSON.stringify({type:'hello',address}));await job;
  const closed=once(ws,'close');
  ws.send(JSON.stringify({type:'submit',id:1,job:'1',time:{toString:null,valueOf:null},nonce:'00'.repeat(28),solution:'fd9001'+'00'.repeat(400)}));
  await closed;assert.equal(received.filter(x=>x.method==='mining.submit').length,0);
  assert.equal(child.exitCode,null,stderr);

  const open=[];
  for(let i=0;i<4;i++){const ws=client();await once(ws,'open');open.push(ws);}
  await denied(403);
  for(const ws of open){const closed=once(ws,'close');ws.close();await closed;}
  const recovered=client();await once(recovered,'open');
  const oversizedClosed=once(recovered,'close');
  recovered.send(JSON.stringify({type:'hello',address,padding:'x'.repeat(3000)}));
  const [code]=await oversizedClosed;assert.equal(code,1009);
  assert.equal(connections,1);assert.equal(child.exitCode,null,stderr);
});
