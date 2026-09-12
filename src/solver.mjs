import {parameters, midstate, packProof, verifyProof} from './solver-reference.mjs';
import {initialShader, roundShader, finalShader, hashTestShader} from './solver-shaders.mjs';

export {parameters, verifyProof, packProof} from './solver-reference.mjs';

export function preferredLimits(limits) {
  return {
    maxBufferSize: limits.maxBufferSize,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxStorageBuffersPerShaderStage: Math.min(16, limits.maxStorageBuffersPerShaderStage),
  };
}
export function estimateRequirements(limits, options = {}) {
  const p = parameters(options.n, options.k);
  const cap = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize, options.chunkBytes??Infinity);
  if (!Number.isFinite(cap) || limits.maxStorageBuffersPerShaderStage < 4) throw new Error('Insufficient WebGPU storage bindings.');
  const arenas = p.strides.map(stride => {
    const perBucket = stride * p.slots * 4;
    const bucketsPerChunk = Math.min(p.buckets, 2 ** Math.floor(Math.log2(cap / perBucket)));
    if (bucketsPerChunk < 1) throw new Error('WebGPU cannot fit a single Equihash bucket.');
    return {stride, bucketsPerChunk, chunks: Math.ceil(p.buckets / bucketsPerChunk),
      chunkBytes: bucketsPerChunk * perBucket, bytes: p.buckets * perBucket};
  });
  const counterBytes = (2 * p.buckets + 1) * 4;
  if (counterBytes > cap) throw new Error('WebGPU cannot fit the Equihash bucket counters.');
  return {parameters:p, arenas, counterBytes, bytes: arenas.reduce((sum,a)=>sum+a.bytes,0)+counterBytes,
    outputGroupSize: Math.min(14, limits.maxStorageBuffersPerShaderStage - 2)};
}

function checkedAbort(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Mining stopped.', 'AbortError');
}
function fillHeader(words, header, p) {
  const state = midstate(header, p.n, p.k);
  state.forEach((x, i) => { words[2*i]=Number(x&0xffffffffn); words[2*i+1]=Number(x>>32n); });
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  for (let i=0;i<3;i++) words[16+i]=view.getUint32(128+i*4,true);
}
async function compile(device, source, label) {
  const module=device.createShaderModule({code:source,label});
  const info=await module.getCompilationInfo();
  const errors=info.messages.filter(m=>m.type==='error');
  if(errors.length) throw new Error(`${label}: ${errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('; ')}`);
  return device.createComputePipelineAsync({label,layout:'auto',compute:{module,entryPoint:'main'}});
}

/** One real Equihash run for a fixed 140-byte header/nonce. Never auto-starts. */
export async function createSolver(device, options = {}) {
  const requirements=estimateRequirements(device.limits,options), p=requirements.parameters;
  const maxRoots=options.maxRoots??1024;
  if(!Number.isInteger(maxRoots)||maxRoots<1||maxRoots>4096) throw new Error('maxRoots must be between 1 and 4096.');
  const groupSize=requirements.outputGroupSize;
  const owned=new Set();
  let gpuError=null,released=false;
  const onGpuError=event=>{gpuError=event.error;};
  device.addEventListener('uncapturederror',onGpuError);
  device.lost.then(info=>{if(!released) gpuError=new Error(`GPU device lost: ${info.message}`);});
  function buffer(size,usage,label) {
    const result=device.createBuffer({size,usage,label}); owned.add(result); return result;
  }
  function dispose() { released=true;device.removeEventListener('uncapturederror',onGpuError);for(const b of owned) b.destroy(); owned.clear(); }
  device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
  let resources;
  try {
    const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;
    const arenas=requirements.arenas.map((a,side)=>({...a,buffers:Array.from({length:a.chunks},(_,i)=>
      buffer(a.chunkBytes,storage,`equihash arena ${side} chunk ${i}`))}));
    const counts=buffer(requirements.counterBytes,storage,'equihash counters');
    const roots=buffer((maxRoots+2)*4,storage,'equihash candidates');
    const uniform=buffer(256,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'equihash parameters');
    const dummies=Array.from({length:groupSize},(_,i)=>buffer(4,storage,`unused output ${i}`));
    resources={arenas,counts,roots,uniform,dummies};
  } catch(error) {
    await device.popErrorScope(); await device.popErrorScope(); dispose(); throw error;
  }
  const validation=await device.popErrorScope(), memory=await device.popErrorScope();
  if(validation||memory) {
    dispose(); throw new Error(`This GPU/browser cannot allocate the real ${p.n},${p.k} solver (${(requirements.bytes/2**30).toFixed(2)} GiB): ${(validation??memory).message}`);
  }
  let pipelines;
  try {
    const built=await Promise.all([
      compile(device,initialShader(p,groupSize),'Equihash Blake2b'),
      compile(device,roundShader(p,groupSize),'Equihash collision round'),
      compile(device,finalShader(p,maxRoots),'Equihash final collision'),
    ]);
    pipelines={initial:built[0],round:built[1],final:built[2]};
  } catch(error) { dispose(); throw error; }
  const {arenas,counts,roots,uniform,dummies}=resources;
  let running=false, disposed=false;
  function bindings(pipeline,items) {
    return device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:
      items.map((b,binding)=>({binding,resource:{buffer:b}}))});
  }
  async function dispatch(pipeline,group,words,count,signal) {
    checkedAbort(signal);
    if(gpuError) throw gpuError;
    device.queue.writeBuffer(uniform,0,words);
    const encoder=device.createCommandEncoder();
    const pass=encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0,group);
    pass.dispatchWorkgroups(Math.ceil(count/64)); pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone(); checkedAbort(signal);
    if(gpuError) throw gpuError;
  }
  async function readCopies(copies,signal) {
    checkedAbort(signal);
    const readback=buffer(copies.length*4,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'proof readback');
    try {
      const encoder=device.createCommandEncoder();
      copies.forEach(([source,offset],i)=>encoder.copyBufferToBuffer(source,offset,readback,i*4,4));
      device.queue.submit([encoder.finish()]); await readback.mapAsync(GPUMapMode.READ);
      const values=new Uint32Array(readback.getMappedRange().slice(0)); readback.unmap(); checkedAbort(signal); return values;
    } finally { readback.destroy(); owned.delete(readback); }
  }
  function pair(tag) { return [{bucket:tag>>>12,slot:(tag>>>6)&63},{bucket:tag>>>12,slot:tag&63}]; }
  function flatten(node) {
    if(node.index!==undefined) return [node.index];
    const a=flatten(node.children[0]),b=flatten(node.children[1]);
    return a[0]<b[0]?[...a,...b]:[...b,...a];
  }
  async function candidates(signal) {
    const metadata=await readCopies([[roots,0],[roots,4]],signal);
    const count=Math.min(metadata[0],maxRoots);
    if(!count) return {proofs:[],candidateCount:metadata[0],overflow:metadata[1]};
    const tags=await readCopies(Array.from({length:count},(_,i)=>[roots,8+i*4]),signal);
    const trees=Array.from(tags,tag=>({children:pair(tag)}));
    let layer=trees.flatMap(t=>t.children);
    for(let round=p.k-1;round>=0;round--) {
      const arena=arenas[round&1],tagOffset=Math.ceil((p.n-(round+1)*p.digit+4)/32);
      const locations=layer.map(node=> {
        const chunk=Math.floor(node.bucket/arena.bucketsPerChunk);
        const offset=((node.bucket%arena.bucketsPerChunk)*p.slots*arena.stride+node.slot*arena.stride+tagOffset)*4;
        return [arena.buffers[chunk],offset];
      });
      const values=await readCopies(locations,signal);
      layer.forEach((node,i)=> { if(round===0) node.index=values[i]; else node.children=pair(values[i]); });
      if(round>0) layer=layer.flatMap(node=>node.children);
    }
    return {proofs:trees.map(tree=>flatten(tree)),candidateCount:metadata[0],overflow:metadata[1]};
  }
  async function solve(header,{signal,onProgress=()=>{}}={}) {
    if(disposed) throw new Error('Solver has been disposed.');
    if(running) throw new Error('A solve is already running.');
    checkedAbort(signal);
    // Own a copy so callers cannot mutate the nonce while GPU work is queued.
    if(!(header instanceof Uint8Array)||header.length!==140) throw new Error('Header must be exactly 140 bytes.');
    header=header.slice(); running=true;
    const words=new Uint32Array(64); fillHeader(words,header,p);
    try {
      let encoder=device.createCommandEncoder(); encoder.clearBuffer(counts); encoder.clearBuffer(roots);
      device.queue.submit([encoder.finish()]);
      const output=arenas[0],blakeCount=Math.ceil(p.leaves/p.hashesPerBlake);
      let completed=0,total=blakeCount*Math.ceil(output.chunks/groupSize);
      for(let groupStart=0;groupStart<output.chunks;groupStart+=groupSize) {
        const active=output.buffers.slice(groupStart,groupStart+groupSize);
        const group=bindings(pipelines.initial,[uniform,counts,...active,...dummies.slice(active.length)]);
        words[24]=groupStart*output.bucketsPerChunk; words[25]=Math.min(p.buckets,(groupStart+groupSize)*output.bucketsPerChunk);
        words[27]=output.stride; words[29]=output.stride-1; words[31]=output.stride-1; words[37]=output.bucketsPerChunk;
        for(let start=0;start<blakeCount;start+=65536) {
          words[20]=start; words[21]=Math.min(start+65536,blakeCount);
          await dispatch(pipelines.initial,group,words,words[21]-start,signal);
          completed+=words[21]-start; onProgress({stage:'hash',completed,total,n:p.n,k:p.k});
        }
      }
      for(let round=1;round<p.k;round++) {
        checkedAbort(signal);
        const input=arenas[(round-1)&1],output=arenas[round&1];
        encoder=device.createCommandEncoder(); encoder.clearBuffer(counts,(round&1)*p.buckets*4,p.buckets*4);
        device.queue.submit([encoder.finish()]);
        words[22]=round; words[26]=input.stride; words[27]=output.stride;
        words[28]=words[30]=Math.ceil((p.n-round*p.digit+4)/32);
        words[29]=words[31]=Math.ceil((p.n-(round+1)*p.digit+4)/32);
        words[32]=(round-1)&1; words[33]=round&1; words[37]=output.bucketsPerChunk;
        completed=0; total=p.buckets*Math.ceil(output.chunks/groupSize);
        for(let groupStart=0;groupStart<output.chunks;groupStart+=groupSize) {
          const active=output.buffers.slice(groupStart,groupStart+groupSize);
          words[24]=groupStart*output.bucketsPerChunk; words[25]=Math.min(p.buckets,(groupStart+groupSize)*output.bucketsPerChunk);
          for(let chunk=0;chunk<input.chunks;chunk++) {
            const group=bindings(pipelines.round,[uniform,counts,input.buffers[chunk],...active,...dummies.slice(active.length)]);
            words[23]=chunk*input.bucketsPerChunk;
            const end=Math.min(p.buckets,words[23]+input.bucketsPerChunk);
            for(let start=words[23];start<end;start+=4096) {
              words[20]=start; words[21]=Math.min(start+4096,end);
              await dispatch(pipelines.round,group,words,words[21]-start,signal);
              completed+=words[21]-start; onProgress({stage:'collision',round,completed,total,n:p.n,k:p.k});
            }
          }
        }
      }
      const input=arenas[(p.k-1)&1]; words[26]=input.stride; words[32]=(p.k-1)&1;
      for(let chunk=0;chunk<input.chunks;chunk++) {
        const group=bindings(pipelines.final,[uniform,counts,input.buffers[chunk],roots]);
        words[23]=chunk*input.bucketsPerChunk;
        const end=Math.min(p.buckets,words[23]+input.bucketsPerChunk);
        for(let start=words[23];start<end;start+=4096) {
          words[20]=start; words[21]=Math.min(start+4096,end);
          await dispatch(pipelines.final,group,words,words[21]-start,signal);
        }
      }
      const result=await candidates(signal), accepted=[],seen=new Set();
      for(const indices of result.proofs) {
        checkedAbort(signal);
        const proof=packProof(indices,p.n,p.k),key=Array.from(proof).join(',');
        if(!seen.has(key)&&verifyProof(header,proof,p.n,p.k)) { seen.add(key); accepted.push(proof); }
      }
      const dropped=(await readCopies([[counts,2*p.buckets*4]],signal))[0];
      onProgress({stage:'complete',solutions:accepted.length,candidates:result.candidateCount,
        droppedRows:dropped,droppedCandidates:result.overflow,n:p.n,k:p.k});
      return accepted;
    } finally { running=false; }
  }
  return {requirements,solve,dispose() { if(running) throw new Error('Stop the active solve before disposal.'); disposed=true; dispose(); }};
}

/** Bounded correctness utility: GPU hashes known indices, never searches nonces. */
export async function testGpuHashes(device,header,{n=192,k=7,start=0,count=1}={}) {
  if(!Number.isInteger(count)||count<1||count>1024) throw new Error('Hash test is limited to 1024 groups.');
  const p=parameters(n,k),words=new Uint32Array(64); fillHeader(words,header,p);
  words[20]=start; words[21]=count;
  const pipeline=await compile(device,hashTestShader(p),'Blake2b vector test');
  const uniform=device.createBuffer({size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const output=device.createBuffer({size:count*p.digestBytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const readback=device.createBuffer({size:count*p.digestBytes,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  try {
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[uniform,output].map((buffer,binding)=>({binding,resource:{buffer}}))});
    device.queue.writeBuffer(uniform,0,words);
    const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0,group); pass.dispatchWorkgroups(Math.ceil(count/64)); pass.end();
    encoder.copyBufferToBuffer(output,0,readback,0,count*p.digestBytes); device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const result=new Uint8Array(readback.getMappedRange().slice(0)); readback.unmap(); return result;
  } finally { uniform.destroy(); output.destroy(); readback.destroy(); }
}
