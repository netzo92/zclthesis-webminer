import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {isZclAddress} from '../bridge/validation.mjs';

const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function readinessHarness({lang='en',localNow=Date.parse('2026-09-12T12:00:00Z'),serverDate,
  age,exportOffset=0,edit=()=>{},hang=false}={}){
  const elements=new Map(),listeners=new Map(),timers=[];
  const getElementById=id=>{if(!elements.has(id))elements.set(id,{disabled:true,textContent:'',value:'',
    addEventListener(type,fn){listeners.set(id+':'+type,fn);}});return elements.get(id);};
  class Clock extends Date{static now(){return localNow;}}
  const reference=serverDate?Date.parse(serverDate):localNow;
  const pool={schemaVersion:1,asset:'ZCL',generatedAt:new Date(reference+exportOffset).toISOString(),
    acceptingMiners:true,feePercent:0.8,payoutMinimumZcl:'0.05'};
  const node={schemaVersion:1,asset:'ZCL',generatedAt:new Date(reference+exportOffset).toISOString(),
    node:{synced:true,connections:5},chain:{height:3248574},mining:{networkSolps:11548}};
  edit(pool,node);
  const requests=[];
  const harness={elements,listeners,timers,pool,node,requests,hang,get:getElementById};
  vm.runInNewContext(app,{Date:Clock,AbortController,
    document:{documentElement:{lang},getElementById,addEventListener(){}},window:{addEventListener(){}},
    setInterval(){},clearInterval(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},clearTimeout(){},
    fetch:async(url,options)=>{requests.push(options);if(harness.hang)return new Promise(()=>{});
      return {ok:true,headers:{get:name=>name==='date'?serverDate:name==='age'?age:null},json:async()=>url.includes('pool.json')?pool:node};},
    Worker:class{constructor(){assert.fail('Status checks must never start GPU work');}}
  });
  return harness;
}

test('fresh HTTPS server time corrects device clock skew without accepting stale exports',async()=>{
  const serverDate='Sat, 12 Sep 2026 12:00:00 GMT';
  for(const lang of ['en','es'])for(const skew of [-86400000,86400000]){
    const h=readinessHarness({lang,serverDate,localNow:Date.parse(serverDate)+skew});
    await tick();assert.equal(h.get('start').disabled,false);
    assert.match(h.get('pool-clock').textContent,lang==='en'?/device clock differs/:/reloj de tu dispositivo difiere/);
    assert.equal(h.requests.every(x=>x.cache==='no-store'),true);
    for(const exportOffset of [-180001,300001]){
      const bad=readinessHarness({lang,serverDate,localNow:Date.parse(serverDate)+skew,exportOffset});
      await tick();assert.equal(bad.get('start').disabled,true);
      assert.doesNotMatch(bad.get('pool-readiness').textContent,/launch|lanzamiento/);
    }
  }
});

test('invalid schemas, assets, fees, synchronization and admission stay closed with specific reasons',async()=>{
  for(const [edit,message] of [
    [(p)=>{p.schemaVersion=2;},/configuration/],[(p)=>{p.asset='BTC';},/configuration/],
    [(_,n)=>{delete n.schemaVersion;},/configuration/],[(_,n)=>{n.asset='ZEC';},/configuration/],
    [(p)=>{p.feePercent=1;},/configuration/],[(_,n)=>{n.node.synced=false;},/synchronizing/],
    [(p)=>{p.acceptingMiners=false;},/temporarily not accepting/]]){
    const h=readinessHarness({edit});await tick();assert.equal(h.get('start').disabled,true);
    assert.match(h.get('pool-readiness').textContent,message);
  }
  const staleCache=readinessHarness({serverDate:'Sat, 12 Sep 2026 12:00:00 GMT',age:'181'});
  await tick();assert.equal(staleCache.get('start').disabled,true);assert.match(staleCache.get('pool-readiness').textContent,/cached/);
});

test('a stalled check times out after eight seconds and manual retry recovers without mining',async()=>{
  const h=readinessHarness({hang:true});await tick();
  assert.equal(h.timers[0].ms,8000);assert.equal(h.get('pool-retry').disabled,true);
  h.timers[0].fn();await tick();
  assert.equal(h.get('start').disabled,true);assert.equal(h.get('pool-retry').disabled,false);
  assert.match(h.get('pool-readiness').textContent,/timed out after 8 seconds/);
  assert.equal(h.requests.every(x=>x.signal.aborted),true);
  h.hang=false;await h.listeners.get('pool-retry:click')();
  assert.equal(h.get('start').disabled,false);assert.match(h.get('pool-readiness').textContent,/ready to accept/);
  assert.equal(h.get('pool-network-rate').textContent,'11,548 Sol/s');
  assert.equal(h.get('pool-minimum').textContent,'0.05 ZCL');
});

test('both pages place live stats above the mining form and version changed assets',async()=>{
  for(const lang of ['en','es']){
    const html=await readFile(new URL(lang==='en'?'../public/index.html':'../public/es/index.html',import.meta.url),'utf8');
    assert.ok(html.indexOf('id="pool-heading"')<html.indexOf('id="mining-form"'));
    assert.match(html,/style\.css\?v=20260913-share-help/);assert.match(html,/app\.mjs\?v=20260913-address-warning/);
    assert.match(html,lang==='en'?/Network hashrate/:/Hashrate de la red/);
  }
});
test('empty payout warnings follow the address field and require a fresh donation acknowledgment',async()=>{
  for(const lang of ['en','es']){
    const h=readinessHarness({lang});await tick();
    assert.equal(h.get('address-warning').hidden,false);
    for(const [value,hidden] of [['   ',false],['t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs',true],['',false]]){
      h.get('address').value=value;h.listeners.get('address:input')();
      assert.equal(h.get('address-warning').hidden,hidden);
      assert.equal(h.get('donation-consent').required,!hidden);
      assert.equal(h.get('donation-consent').disabled,hidden);
      assert.equal(h.get('donation-consent').checked,false);
      assert.equal(h.get('consent').checked,false);
      assert.equal(h.get('address').value,value,'warning does not overwrite the input field');
    }
    const html=await readFile(new URL(lang==='en'?'../public/index.html':'../public/es/index.html',import.meta.url),'utf8');
    assert.doesNotMatch(html,/<input id="address"[^>]* required /);
    assert.match(html,/<input id="donation-consent" type="checkbox" required>/);
    assert.match(html,lang==='en'?/NO ADDRESS ENTERED — DONATE TO POOL/:/SIN DIRECCIÓN — DONAR AL POOL/);
    assert.match(html,lang==='en'?/You will receive no mining payouts/:/No recibirás pagos de minería/);
    assert.match(html,/<code id="donation-address">t1Q8PRCDso9HoK36XeLCPym6vZmkwyNgS4d<\/code>/);
  }
});

test('blank-address donations need both consents, bind the approved recipient, and never replace an entered address',async()=>{
  const recipient='t1Q8PRCDso9HoK36XeLCPym6vZmkwyNgS4d';
  const personalAddress='t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs';
  assert.equal(isZclAddress(recipient),true,'the approved recipient passes the actual bridge checksum validator');
  for(const lang of ['en','es']){
    const elements=new Map(),listeners=new Map(),workers=[];
    const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,textContent:'',
      addEventListener(type,handler){listeners.set(id+':'+type,handler);}});return elements.get(id);};
    const document={documentElement:{lang},hidden:false,getElementById:get,
      addEventListener(type,handler){listeners.set('document:'+type,handler);}};
    class Worker{constructor(){this.messages=[];workers.push(this);}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}}
    vm.runInNewContext(app,{Date,document,navigator:{gpu:{}},Worker,
      window:{addEventListener(){}},setInterval(){},clearInterval(){},setTimeout,clearTimeout,AbortController,
      fetch:async url=>({ok:true,json:async()=>({schemaVersion:1,asset:'ZCL',generatedAt:new Date().toISOString(),
        ...(url.includes('pool.json')?{acceptingMiners:true,feePercent:0.8}:{node:{synced:true}})})}),
    });
    await tick();get('minutes').value='unlimited';
    const submit=()=>listeners.get('mining-form:submit')({preventDefault(){}});
    assert.equal(workers.length,0);
    get('consent').checked=true;submit();assert.equal(workers.length,0,'GPU consent alone cannot donate');
    get('consent').checked=false;get('donation-consent').checked=true;submit();
    assert.equal(workers.length,0,'donation consent alone cannot start GPU use');
    get('consent').checked=true;submit();assert.equal(workers.length,1);
    assert.equal(workers[0].messages[0].address,recipient);
    assert.equal(workers[0].messages[0].minutes,'unlimited');
    assert.equal(get('donation-address').textContent,recipient);
    assert.match(get('address-line').textContent,lang==='en'?/Donating to the pool; you receive no payouts/:/Donación al pool; no recibirás pagos/);
    assert.equal(get('donation-consent').disabled,true);
    listeners.get('stop:click')();assert.equal(workers[0].terminated,true);
    assert.equal(get('donation-consent').checked,false);
    submit();assert.equal(workers.length,1,'a stopped donation needs fresh acknowledgment');
    get('address').value='   ';listeners.get('address:input')();
    get('consent').checked=true;submit();assert.equal(workers.length,1,'whitespace requires donation acknowledgment');
    get('donation-consent').checked=true;submit();assert.equal(workers.length,2);
    assert.equal(workers[1].messages[0].address,recipient);
    document.hidden=true;listeners.get('document:visibilitychange')();assert.equal(workers[1].terminated,true);
    document.hidden=false;listeners.get('document:visibilitychange')();await tick();
    assert.equal(workers.length,2,'returning to a tab never restarts a donation');
    get('address').value='not-a-zcl-address';listeners.get('address:input')();
    get('consent').checked=true;get('donation-consent').checked=true;submit();
    assert.equal(workers.length,2,'malformed entered addresses never become donations');
    get('address').value=personalAddress;listeners.get('address:input')();
    get('consent').checked=true;submit();assert.equal(workers.length,3);
    assert.equal(workers[2].messages[0].address,personalAddress);
    assert.equal(get('address-warning').hidden,true);
    assert.equal(get('donation-consent').checked,false);
    assert.match(get('address-line').textContent,lang==='en'?/^Payout address: /:/^Dirección de pago: /);
    listeners.get('stop:click')();
  }
});
test('English and Spanish Start controls require fresh pool and node observations',async()=>{
  const now=Date.parse('2026-09-12T12:00:00Z');
  class Clock extends Date {static now(){return now;}}
  for(const lang of ['en','es']) {
    for(const source of ['pool','node']) {
      for(const offset of [0,-180000,300000,-180001,300001,undefined,null,'invalid']) {
        const generatedAt=typeof offset==='number'?new Date(now+offset).toISOString():offset;
        const pool={schemaVersion:1,asset:'ZCL',generatedAt:new Date(now).toISOString(),acceptingMiners:true,feePercent:0.8};
        const node={schemaVersion:1,generatedAt:new Date(now).toISOString(),asset:'ZCL',node:{synced:true}};
        (source==='pool'?pool:node).generatedAt=generatedAt;
        const elements=new Map();
        const getElementById=id=>{if(!elements.has(id))elements.set(id,{disabled:true,addEventListener(){}});return elements.get(id);};
        vm.runInNewContext(app,{
          Date:Clock,document:{documentElement:{lang},getElementById,addEventListener(){}},
          window:{addEventListener(){}},setInterval(){},clearInterval(){},setTimeout,clearTimeout,AbortController,
          fetch:async url=>({ok:true,json:async()=>url.includes('pool.json')?pool:node}),
          Worker:class {constructor(){assert.fail('Readiness check must never start GPU work');}},
        });
        await new Promise(resolve=>setImmediate(resolve));
        const fresh=typeof offset==='number'&&offset>=-180000&&offset<=300000;
        assert.equal(getElementById('start').disabled,!fresh,`${lang} ${source} timestamp ${offset}`);
        assert.match(getElementById('pool-readiness').textContent,/pool/);
      }
    }
  }
});

test('both language forms pass the explicit duration and preserve Stop and hidden-tab controls',async()=>{
  for(const lang of ['en','es']) for(const duration of ['60','unlimited']) {
    const elements=new Map(),listeners=new Map(),workers=[];
    const getElementById=id=>{
      if(!elements.has(id))elements.set(id,{value:'',disabled:false,checked:false,textContent:'',
        addEventListener(type,handler){listeners.set(id+':'+type,handler);}});
      return elements.get(id);
    };
    class Worker {
      constructor(){this.messages=[];this.terminated=false;workers.push(this);}
      postMessage(message){this.messages.push(message);}
      terminate(){this.terminated=true;}
    }
    const document={documentElement:{lang},hidden:false,getElementById,
      addEventListener(type,handler){listeners.set('document:'+type,handler);}};
    vm.runInNewContext(app,{Date,document,navigator:{gpu:{}},Worker,
      window:{addEventListener(type,handler){listeners.set('window:'+type,handler);}},
      setInterval(){},clearInterval(){},setTimeout,clearTimeout,AbortController,
      fetch:async url=>({ok:true,json:async()=>({schemaVersion:1,asset:'ZCL',generatedAt:new Date().toISOString(),
        ...(url.includes('pool.json')?{acceptingMiners:true,feePercent:0.8}:{asset:'ZCL',node:{synced:true}})})}),
    });
    await tick();assert.equal(workers.length,0);
    getElementById('address').value='t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs';
    getElementById('minutes').value=duration;
    const submit=()=>listeners.get('mining-form:submit')({preventDefault(){}});
    submit();assert.equal(workers.length,0,'selecting a duration does not bypass consent');
    getElementById('consent').checked=true;submit();
    assert.equal(workers.length,1);
    assert.equal(workers[0].messages[0].minutes,duration==='unlimited'?'unlimited':60);
    assert.equal(getElementById('minutes').disabled,true);assert.equal(getElementById('stop').disabled,false);
    listeners.get('stop:click')();
    assert.equal(workers[0].messages.at(-1).type,'stop');assert.equal(workers[0].terminated,true);
    assert.equal(getElementById('minutes').disabled,false);assert.equal(getElementById('stop').disabled,true);
    await tick();assert.equal(workers.length,1,'stopped sessions do not auto-restart');
    submit();assert.equal(workers.length,2);
    document.hidden=true;listeners.get('document:visibilitychange')();
    assert.equal(workers[1].terminated,true);assert.equal(workers[1].messages.at(-1).type,'stop');
    document.hidden=false;listeners.get('document:visibilitychange')();
    assert.equal(workers.length,2,'returning to the tab does not auto-restart');
  }
});
