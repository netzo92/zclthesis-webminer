// Explicit local test runner. It only controls our isolated localhost test page.
import {writeFile} from 'node:fs/promises';
const kind=process.argv[2];
if(!['hashes','reduced','chunked','abort','historical'].includes(kind)) throw new Error('Choose hashes, reduced, chunked, abort or historical.');
if(kind==='historical'&&process.env.ZCL_HISTORICAL_GPU_TEST!=='1') throw new Error('Historical GPU test requires explicit ZCL_HISTORICAL_GPU_TEST=1.');
const endpoint=process.env.ZCL_TEST_CDP_URL;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint??'')) throw new Error('Set ZCL_TEST_CDP_URL to the separate localhost test browser.');
const tabs=await(await fetch(`${endpoint}/json/list`)).json();
const tab=tabs.find(t=>t.url==='http://127.0.0.1:8766/tests/gpu.html');
if(!tab) throw new Error('Missing isolated solver test page.');
const ws=new WebSocket(tab.webSocketDebuggerUrl); await new Promise(resolve=>ws.onopen=resolve);
let id=0; const pending=new Map();
ws.onmessage=e=>{const message=JSON.parse(e.data);if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}};
const call=(method,params)=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));});
await call('Page.reload',{ignoreCache:true}); await new Promise(resolve=>setTimeout(resolve,800));
await call('Runtime.evaluate',{expression:`document.querySelector('#${kind}').click()`});
for(let second=0;second<600;second++) {
  await new Promise(resolve=>setTimeout(resolve,1000));
  const response=await call('Runtime.evaluate',{expression:'JSON.stringify(window.testResults)'});
  const result=JSON.parse(response.result.result.value);
  if(result.status!=='running') {
    if(process.env.ZCL_GPU_TEST_OUTPUT) await writeFile(process.env.ZCL_GPU_TEST_OUTPUT,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({...result,proofs:result.proofs?.length}));
    ws.close(); process.exit(result.status==='passed'?0:1);
  }
  if(second%10===0) {
    const progress=await call('Runtime.evaluate',{expression:'JSON.stringify(window.lastProgress??{})'});
    console.log(progress.result.result.value);
  }
}
await call('Runtime.evaluate',{expression:"document.querySelector('#stop').click()"});
ws.close(); throw new Error('Finite test timed out and stop was requested.');
