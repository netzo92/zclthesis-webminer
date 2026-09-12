import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';

const address='t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs'; // Public test key only.
const params=['1','04000000','11'.repeat(32),'22'.repeat(32),'00'.repeat(32),'01020304','ffff001f',true,'192_7','ZcashPoW'];

function inbox(emitter,event,decode=value=>value){
  const values=[];
  emitter.on(event,value=>values.push(decode(value)));
  return async predicate=>{
    for(let attempt=0;attempt<200;attempt++){
      const index=values.findIndex(predicate);
      if(index>=0)return values.splice(index,1)[0];
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    throw new Error('Expected test event was not received');
  };
}

test('authorized healthy sessions outlive 61 minutes; missing hello, stalled authorization and dead sockets still close',{timeout:15000},async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zcl-bridge-lifetime-'));
  const status=path.join(dir,'node.json'),poolStatus=path.join(dir,'pool.json');
  await writeFile(status,JSON.stringify({generatedAt:new Date().toISOString(),node:{synced:true}}));
  await writeFile(poolStatus,JSON.stringify({generatedAt:new Date().toISOString(),acceptingMiners:true,feePercent:0.8}));
  let authorize=true,activeUpstream;
  const tcpSockets=new Set(),requests=[];
  const upstream=net.createServer(socket=>{
    activeUpstream=socket;tcpSockets.add(socket);socket.on('close',()=>tcpSockets.delete(socket));socket.on('error',()=>{});
    let buffer='';
    socket.on('data',chunk=>{
      buffer+=chunk;let end;
      while((end=buffer.indexOf('\n'))!==-1){
        const request=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);requests.push(request);
        const send=value=>socket.write(JSON.stringify(value)+'\n');
        if(request.method==='mining.subscribe')send({id:request.id,result:[null,'00000000'],error:null});
        if(request.method==='mining.authorize'&&authorize){
          send({id:request.id,result:true,error:null});
          send({id:null,method:'mining.set_target',params:['ff'.repeat(32)]});
          send({id:null,method:'mining.notify',params});
        }
        if(request.method==='mining.submit')send({id:request.id,result:true,error:null});
      }
    });
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const child=spawn(process.execPath,['tests/bridge-clock-child.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,
    ZCL_BRIDGE_PORT:'0',ZCL_STRATUM_PORT:String(upstream.address().port),ZCL_MINER_ORIGINS:'https://pool.zclthesis.com',
    ZCL_NODE_STATUS:status,ZCL_POOL_STATUS:poolStatus,ZCL_TEST_PAYOUT_ADDRESS:''},stdio:['ignore','pipe','pipe','ipc']});
  const control=inbox(child,'message');
  const clients=[];let stderr='',sequence=0;
  child.stderr.on('data',chunk=>stderr+=chunk);
  t.after(async()=>{
    for(const client of clients)client.terminate();for(const socket of tcpSockets)socket.destroy();
    if(child.exitCode===null){child.kill('SIGTERM');if(child.connected)child.disconnect();await once(child,'exit');}
    upstream.close();await rm(dir,{recursive:true,force:true});
  });
  const [startup]=await once(child.stdout,'data');
  const endpoint='ws://127.0.0.1:'+JSON.parse(startup.toString()).port+'/ws';
  const advance=async ms=>{const id=++sequence;child.send({type:'advance',id,ms});return control(value=>value.type==='advanced'&&value.id===id);};
  async function connect(options={}){
    const client=new WebSocket(endpoint,{origin:'https://pool.zclthesis.com',...options});clients.push(client);
    const message=inbox(client,'message',raw=>JSON.parse(raw));
    client.on('error',()=>{});await once(client,'open');return {client,message};
  }
  const healthy=await connect();
  healthy.client.send(JSON.stringify({type:'hello',address}));
  assert.equal((await healthy.message(value=>value.type==='authorized')).address,address);
  await healthy.message(value=>value.type==='job');
  const earlyClosure=once(healthy.client,'close').then(()=>({type:'closed'}));
  let elapsed=0;
  for(let tick=1;tick<=124;tick++){
    ({elapsed}=await advance(30000));
    const heartbeat=await Promise.race([control(value=>value.type==='pong'&&value.elapsed===elapsed),earlyClosure]);
    assert.equal(heartbeat.type,'pong',`Healthy authorized session closed at ${elapsed} virtual ms`);
    assert.equal(healthy.client.readyState,WebSocket.OPEN);
    // Real local upstream traffic and forwarding continue between virtual
    // heartbeat ticks, without generating or verifying any mining proof.
    const next=[...params];next[0]=(tick+1).toString(16);
    activeUpstream.write(JSON.stringify({id:null,method:'mining.notify',params:next})+'\n');
    assert.equal((await healthy.message(value=>value.type==='job'&&value.params[0]===next[0])).params[0],next[0]);
  }
  assert.equal(elapsed,62*60*1000);
  assert.equal(healthy.client.readyState,WebSocket.OPEN);
  const latestJob=(125).toString(16);
  // Synthetic message to this test's fake upstream only: proves forwarding
  // remains authorized beyond the old deadline, without doing GPU work.
  healthy.client.send(JSON.stringify({type:'submit',id:7,job:latestJob,time:params[5],nonce:'00'.repeat(28),solution:'fd9001'+'00'.repeat(400)}));
  assert.equal((await healthy.message(value=>value.type==='share')).accepted,true);
  assert.deepEqual(requests.at(-1).params,[address,latestJob,params[5],'00'.repeat(28),'fd9001'+'00'.repeat(400)]);
  const healthyClosed=once(healthy.client,'close');healthy.client.close();await healthyClosed;

  const silent=await connect(),silentClosed=once(silent.client,'close');
  await advance(10000);assert.match((await silent.message(value=>value.type==='error')).message,/address was not supplied/);await silentClosed;

  authorize=false;
  const stalled=await connect(),stalledClosed=once(stalled.client,'close');
  stalled.client.send(JSON.stringify({type:'hello',address}));
  await stalled.message(value=>value.type==='session');
  // A peer that sends messages but never authorizes must not keep a slot.
  activeUpstream.write(JSON.stringify({id:null,method:'mining.set_target',params:['ff'.repeat(32)]})+'\n');
  await stalled.message(value=>value.type==='target');
  await advance(30000);assert.match((await stalled.message(value=>value.type==='error')).message,/authorization timed out/);await stalledClosed;

  authorize=true;
  const dead=await connect({autoPong:false}),deadClosed=once(dead.client,'close');
  dead.client.send(JSON.stringify({type:'hello',address}));await dead.message(value=>value.type==='authorized');
  const ping=once(dead.client,'ping');await advance(30000);await ping;
  await advance(30000);const [code]=await deadClosed;assert.equal(code,1006);
  assert.equal(child.exitCode,null,stderr);
  // Closing all of the above releases the existing per-IP reservations.
  const recovered=await connect();const recoveredClosed=once(recovered.client,'close');recovered.client.close();await recoveredClosed;
});
