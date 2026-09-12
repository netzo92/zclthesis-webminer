import test from 'node:test';
import assert from 'node:assert/strict';
import {createMinerController} from '../src/miner-worker.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const start={type:'start',endpoint:'wss://pool.zclthesis.com/ws',address:'test-only',minutes:1};
const params=(id='1',previous='11')=>[id,'04000000',previous.repeat(32),'22'.repeat(32),'00'.repeat(32),'01020304','ffff001f',true,'192_7','ZcashPoW'];
function harness(overrides={}) {
  const messages=[],sockets=[],devices=[],solves=[],solvers=[],timers=new Set();
  let now=100;
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=0;this.sent=[];sockets.push(this);}
    open(){this.readyState=1;this.onopen?.();}
    send(raw){assert.equal(this.readyState,1);this.sent.push(JSON.parse(raw));}
    receive(message){this.onmessage?.({data:JSON.stringify(message)});}
    close(){this.readyState=3;this.onclose?.();}
  }
  const gpu={async requestAdapter(){return {limits:{},async requestDevice(){
    const device={limits:{},lost:deferred().promise,destroyed:0,destroy(){this.destroyed++;}};
    devices.push(device);return device;
  }};}};
  const makeSolver=async()=>{
    const solver={disposed:0,async solve(header,{signal}) {
      const work=deferred();work.header=header;work.signal=signal;solves.push(work);
      signal.addEventListener('abort',()=>work.reject(signal.reason),{once:true});
      return work.promise;
    },dispose(){this.disposed++;assert(solves.every(work=>work.signal.aborted||work.finished));}};
    solvers.push(solver);return solver;
  };
  const controller=createMinerController({postMessage:value=>messages.push(value),WebSocket:Socket,
    gpu,createSolver:makeSolver,preferredLimits:()=>({}),estimateRequirements:()=>({bytes:1}),
    crypto:{getRandomValues:bytes=>bytes.fill(7)},meetsTarget:async()=>true,
    now:()=>now,performanceNow:()=>now,
    setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn),...overrides});
  async function connect(complete=true,request=start) {
    await controller(request);const socket=sockets.at(-1);socket.open();
    socket.receive({type:'session',noncePrefix:'00000000'});
    if(complete) authorize(socket);
    await tick();return socket;
  }
  function authorize(socket){
    socket.receive({type:'authorized',address:'test-only'});
    socket.receive({type:'target',target:'ff'.repeat(32)});
    socket.receive({type:'job',params:params()});
  }
  function finish(work,proofs=[]){work.finished=true;work.resolve(proofs);}
  return {controller,messages,sockets,devices,solves,solvers,timers,connect,authorize,finish,
    advance:ms=>{now+=ms;},makeSolver};
}

test('Stop awaits active solve, releases GPU exactly once, and restart has fresh work',async()=>{
  const h=harness(),first=await h.connect();assert.equal(h.solves.length,1);
  const stopping=h.controller({type:'stop'});
  await h.controller(start); // A new allocation cannot overlap unfinished cleanup.
  assert.equal(h.sockets.length,1);
  await stopping;
  assert.equal(h.solves[0].signal.aborted,true);
  assert.equal(h.solvers[0].disposed,1);assert.equal(h.devices[0].destroyed,1);
  assert.equal(h.timers.size,0);
  const second=await h.connect(false);
  first.receive({type:'job',params:params('dead','ff')});
  first.receive({type:'authorized'}); // Late old callbacks cannot initialize a GPU.
  assert.equal(h.solves.length,1);assert.equal(h.devices.length,1);
  second.receive({type:'authorized'});await tick();
  assert.equal(h.solves.length,1); // No inherited target or job.
  second.receive({type:'target',target:'ff'.repeat(32)});
  second.receive({type:'job',params:params('2')});await tick();
  assert.equal(h.solves.length,2);
  await h.controller({type:'stop'});
  assert.equal(h.devices[1].destroyed,1);
});

test('Stop during asynchronous shader initialization disposes the late solver',async()=>{
  const pending=deferred();let disposed=0;
  const h=harness({createSolver:()=>pending.promise});await h.connect();
  const stopping=h.controller({type:'stop'});await tick();
  assert.equal(h.devices[0].destroyed,0);
  pending.resolve({solve(){assert.fail('Stopped initialization must never solve');},dispose(){disposed++;}});
  await stopping;assert.equal(disposed,1);assert.equal(h.devices[0].destroyed,1);
  assert.equal(h.messages.filter(x=>x.type==='stopped').length,1);
});

test('Stop while SHA256 is pending never submits the resulting proof',async()=>{
  const target=deferred();let targetCalls=0;
  const h=harness({meetsTarget:()=>{targetCalls++;return target.promise;}});
  const socket=await h.connect();h.finish(h.solves[0],[new Uint8Array(400)]);await tick();
  assert.equal(targetCalls,1);
  const stopping=h.controller({type:'stop'});target.resolve(true);await stopping;
  assert.equal(socket.sent.filter(x=>x.type==='submit').length,0);
  assert.equal(h.messages.filter(x=>x.type==='submitted').length,0);
});

test('a new previous hash cancels the old solve and submits only replacement work',async()=>{
  const h=harness(),socket=await h.connect(),old=h.solves[0];
  socket.receive({type:'job',params:params('2','ab')});await tick();
  assert.equal(old.signal.aborted,true);assert.equal(h.solves.length,2);
  assert.equal(Buffer.from(h.solves[1].header.subarray(4,36)).toString('hex'),'ab'.repeat(32));
  h.finish(h.solves[1],[new Uint8Array(400)]);await tick();
  const submissions=socket.sent.filter(x=>x.type==='submit');
  assert.equal(submissions.length,1);assert.equal(submissions[0].job,'2');
  assert.equal(submissions[0].solution.length,806);assert.equal(submissions[0].solution.slice(0,6),'fd9001');
  // Sending a solution is not a pool acceptance acknowledgement.
  assert.equal(h.messages.filter(x=>x.type==='share').length,0);
  socket.receive({type:'share',id:1,accepted:false,message:'Stale job'});
  assert.equal(h.messages.find(x=>x.type==='share').accepted,false);
  await h.controller({type:'stop'});
});

test('a solver failure stops the session and permits a later fresh start',async()=>{
  const h=harness();await h.connect();h.solves[0].finished=true;h.solves[0].reject(new Error('GPU failed'));await tick();
  assert(h.messages.some(x=>x.type==='error'&&x.message==='GPU failed'));
  assert.equal(h.devices[0].destroyed,1);
  await h.connect();assert.equal(h.sockets.length,2);await h.controller({type:'stop'});
});

test('session deadline is checked after solving even if the timer is delayed',async()=>{
  const h=harness(),socket=await h.connect();h.advance(60001);
  h.finish(h.solves[0],[new Uint8Array(400)]);await tick();
  assert.equal(socket.sent.filter(x=>x.type==='submit').length,0);
  assert.equal(h.devices[0].destroyed,1);assert.equal(h.timers.size,0);
});

test('an explicitly unlimited session keeps submitting beyond an hour and a month until Stop',async()=>{
  const h=harness(),socket=await h.connect(true,{...start,minutes:'unlimited'});
  assert.equal(h.timers.size,0,'unlimited sessions must not schedule a timeout');
  for(const elapsed of [62*60000,31*24*60*60000]) {
    h.advance(elapsed);
    h.finish(h.solves.at(-1),[new Uint8Array(400)]);await tick();
    assert.equal(socket.readyState,1);assert.equal(h.devices[0].destroyed,0);
  }
  assert.equal(socket.sent.filter(x=>x.type==='submit').length,2);
  assert.equal(h.solves.length,3,'new work continues after each completed solve');
  await h.controller({type:'stop'});
  assert.equal(h.solves.at(-1).signal.aborted,true);
  assert.equal(socket.readyState,3);assert.equal(h.solvers[0].disposed,1);
  assert.equal(h.devices[0].destroyed,1);assert.equal(h.timers.size,0);
  assert.equal(h.messages.filter(x=>x.type==='stopped').length,1);
});

test('an unlimited session releases its GPU on disconnection and never reconnects itself',async()=>{
  const h=harness(),socket=await h.connect(true,{...start,minutes:'unlimited'});
  h.advance(62*60000);socket.close();await tick();
  assert.equal(h.solves[0].signal.aborted,true);assert.equal(h.solvers[0].disposed,1);
  assert.equal(h.devices[0].destroyed,1);assert.equal(h.sockets.length,1);
  assert(h.messages.some(x=>x.type==='stopped'&&x.message==='Pool disconnected; mining stopped'));
});

test('only the explicit unlimited choice bypasses a finite duration',async()=>{
  const h=harness();
  for(const minutes of [undefined,null,'',0,-1,61,Infinity,'Infinity',NaN,'forever']) {
    await h.controller({...start,minutes});
  }
  assert.equal(h.sockets.length,0);assert.equal(h.timers.size,0);
  assert.equal(h.messages.filter(x=>x.type==='error').length,10);
});

test('duplicate authorization cannot allocate a second solver',async()=>{
  const h=harness(),socket=await h.connect();socket.receive({type:'authorized'});await tick();
  assert.equal(h.devices.length,1);assert.equal(h.devices[0].destroyed,1);
  assert(h.messages.some(x=>x.type==='error'&&x.message.includes('Duplicate')));
});

test('only the exact fixed secure pool URL is allowed',async()=>{
  const h=harness();
  for(const endpoint of ['ws://pool.zclthesis.com/ws','wss://elsewhere.test/ws',
    'wss://pool.zclthesis.com/ws?target=other','wss://user@pool.zclthesis.com/ws',
    'wss://pool.zclthesis.com/ws#other']) await h.controller({...start,endpoint});
  assert.equal(h.sockets.length,0);assert.equal(h.messages.filter(x=>x.type==='error').length,5);
});
