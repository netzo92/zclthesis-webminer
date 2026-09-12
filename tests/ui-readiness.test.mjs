import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const app=await readFile(new URL('../public/app.mjs',import.meta.url),'utf8');
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
