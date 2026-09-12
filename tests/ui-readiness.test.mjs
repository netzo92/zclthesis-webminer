import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('English and Spanish Start controls require fresh pool and node observations',async()=>{
  const now=Date.parse('2026-09-12T12:00:00Z');
  class Clock extends Date {static now(){return now;}}
  for(const lang of ['en','es']) {
    for(const source of ['pool','node']) {
      for(const offset of [0,-180000,300000,-180001,300001,undefined,null,'invalid']) {
        const generatedAt=typeof offset==='number'?new Date(now+offset).toISOString():offset;
        const pool={generatedAt:new Date(now).toISOString(),acceptingMiners:true,feePercent:0.8};
        const node={generatedAt:new Date(now).toISOString(),asset:'ZCL',node:{synced:true}};
        (source==='pool'?pool:node).generatedAt=generatedAt;
        const elements=new Map();
        const getElementById=id=>{if(!elements.has(id))elements.set(id,{disabled:true,addEventListener(){}});return elements.get(id);};
        vm.runInNewContext(app,{
          Date:Clock,document:{documentElement:{lang},getElementById,addEventListener(){}},
          window:{addEventListener(){}},setInterval(){},clearInterval(){},
          fetch:async url=>({ok:true,json:async()=>url.includes('pool.json')?pool:node}),
          Worker:class {constructor(){assert.fail('Readiness check must never start GPU work');}},
        });
        await new Promise(resolve=>setImmediate(resolve));
        const fresh=typeof offset==='number'&&offset>=-180000&&offset<=300000;
        assert.equal(getElementById('start').disabled,!fresh,`${lang} ${source} timestamp ${offset}`);
        assert.match(getElementById('pool-readiness').textContent,lang==='es'?/El pool/:/The pool/);
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
      setInterval(){},clearInterval(){},
      fetch:async url=>({ok:true,json:async()=>({generatedAt:new Date().toISOString(),
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
