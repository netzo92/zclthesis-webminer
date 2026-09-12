import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import WebSocket from 'ws';
const address='t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs'; // Public test key only.
const fixture=JSON.parse(await readFile(new URL('./zcl-mainnet-header.json',import.meta.url)));
const raw=Buffer.from(fixture.header_hex,'hex'),hex=(a,b)=>raw.subarray(a,b).toString('hex');
const params=['1',hex(0,4),hex(4,36),hex(36,68),hex(68,100),hex(100,104),hex(104,108),true,'192_7','ZcashPoW'];
test('restricted bridge authorizes the visitor address, transports canonical shares, and rejects proxy/control injection',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zcl-bridge-test-'));
  const status=path.join(dir,'node.json');await writeFile(status,JSON.stringify({generatedAt:new Date().toISOString(),node:{synced:true}}));
  const poolStatus=path.join(dir,'pool.json');await writeFile(poolStatus,JSON.stringify({acceptingMiners:true,feePercent:0.8}));
  const received=[];let connections=0;
  const upstream=net.createServer(socket=>{connections++;let buffer='';socket.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,index));buffer=buffer.slice(index+1);received.push(message);
    if(message.method==='mining.subscribe')socket.write(JSON.stringify({id:message.id,result:[null,hex(108,112)],error:null})+'\n');
    else if(message.method==='mining.authorize'){socket.write(JSON.stringify({id:message.id,result:true,error:null})+'\n');socket.write(JSON.stringify({id:null,method:'mining.set_target',params:['f'.repeat(64)]})+'\n');socket.write(JSON.stringify({id:null,method:'mining.notify',params})+'\n');}
    else if(message.method==='mining.submit')socket.write(JSON.stringify({id:message.id,result:true,error:null})+'\n');
  }});});upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const child=spawn(process.execPath,['bridge/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,ZCL_BRIDGE_PORT:'0',ZCL_STRATUM_PORT:String(upstream.address().port),ZCL_MINER_ORIGINS:'https://pool.zclthesis.com',ZCL_NODE_STATUS:status,ZCL_POOL_STATUS:poolStatus},stdio:['ignore','pipe','pipe']});
  const sockets=[];
  t.after(async()=>{for(const ws of sockets)ws.terminate();child.kill('SIGTERM');await once(child,'exit');upstream.close();await rm(dir,{recursive:true,force:true});});
  const chunk=await once(child.stdout,'data');const advertised=JSON.parse(chunk[0].toString());
  const endpoint='ws://127.0.0.1:'+advertised.port+'/ws';
  const connect=async(origin='https://pool.zclthesis.com')=>{const ws=new WebSocket(endpoint,{origin});sockets.push(ws);await once(ws,'open');return ws;};
  const ws=await connect(),messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw)));
  async function message(type){for(let i=0;i<100;i++){const found=messages.find(x=>x.type===type);if(found)return found;await new Promise(r=>setTimeout(r,10));}throw new Error('Missing '+type);}
  ws.send(JSON.stringify({type:'hello',address}));await message('job');assert.equal((await message('authorized')).address,address);
  assert.deepEqual(received[1].params,[address,'c=ZCL']);
  ws.send(JSON.stringify({type:'submit',id:7,job:'1',time:params[5],nonce:hex(112,140),solution:hex(140)}));assert.equal((await message('share')).accepted,true);
  assert.equal(received[2].method,'mining.submit');assert.equal(received[2].params[0],address);
  ws.send(JSON.stringify({type:'rpc',method:'sendmany',host:'169.254.169.254'}));await once(ws,'close');assert.equal(received.length,3);
  const bad=await connect();bad.send(JSON.stringify({type:'hello',address:address.slice(0,-1)+'a'}));await once(bad,'close');assert.equal(connections,1);
  await writeFile(status,JSON.stringify({generatedAt:new Date().toISOString(),node:{synced:false}}));
  const denied=new WebSocket(endpoint,{origin:'https://pool.zclthesis.com'});sockets.push(denied);denied.on('error',()=>{});const [response]=await once(denied,'unexpected-response'); // request object is first argument
  response.destroy();
  assert.equal(connections,1);
});
