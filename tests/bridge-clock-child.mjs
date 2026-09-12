// Test-only virtual clock. The production bridge has no test mode or clock API.
// Socket traffic remains real and local; only its JS deadlines are advanced.
import {mock} from 'node:test';
import WebSocket from 'ws';

mock.timers.enable({apis:['setTimeout','setInterval']});
let elapsed=0;
const emit=WebSocket.prototype.emit;
WebSocket.prototype.emit=function(event,...args){
  const result=emit.call(this,event,...args);
  // Acknowledge after the bridge's real pong handler has set alive=true.
  if(event==='pong')process.send?.({type:'pong',elapsed});
  return result;
};
process.on('message',message=>{
  if(message?.type!=='advance'||!Number.isSafeInteger(message.ms)||message.ms<0)throw new Error('Invalid test clock request');
  elapsed+=message.ms;
  mock.timers.tick(message.ms);
  process.send?.({type:'advanced',id:message.id,elapsed});
});
await import('../bridge/server.mjs');
