// Wagner bucket/DAG layout derived from John Tromp's MIT Equihash solver.
// Blake2b uses paired u32 arithmetic because WGSL has no runtime u64 type.
import {IV, SIGMA} from './solver-reference.mjs';

const hex = x => `0x${x.toString(16)}u`;
function common(p) {
  return `
struct Params { words: array<vec4<u32>,16> }
@group(0) @binding(0) var<uniform> config: Params;
fn param(i:u32)->u32 { return config.words[i/4u][i%4u]; }
const NBUCKETS:u32=${p.buckets}u;
const SLOTS:u32=64u;
const DIGIT:u32=${p.digit}u;
const BUCKET_BITS:u32=${p.bucketBits}u;
const LEAVES:u32=${p.leaves}u;
const HASHES_PER_BLAKE:u32=${p.hashesPerBlake}u;
const HASH_WORDS:u32=${p.n / 32}u;
fn swap32(x:u32)->u32 { return (x>>24u)|((x>>8u)&0xff00u)|((x<<8u)&0xff0000u)|(x<<24u); }
fn add64(a:vec2<u32>,b:vec2<u32>)->vec2<u32> {
  let low=a.x+b.x; return vec2<u32>(low,a.y+b.y+select(0u,1u,low<a.x));
}
fn rotr(a:vec2<u32>,n:u32)->vec2<u32> {
  if(n==32u) { return a.yx; }
  if(n<32u) { return (a>>vec2<u32>(n))|(a.yx<<vec2<u32>(32u-n)); }
  return (a.yx>>vec2<u32>(n-32u))|(a<<vec2<u32>(64u-n));
}
fn mix(v:ptr<function,array<vec2<u32>,16>>,a:u32,b:u32,c:u32,d:u32,x:vec2<u32>,y:vec2<u32>) {
  (*v)[a]=add64(add64((*v)[a],(*v)[b]),x); (*v)[d]=rotr((*v)[d]^(*v)[a],32u);
  (*v)[c]=add64((*v)[c],(*v)[d]); (*v)[b]=rotr((*v)[b]^(*v)[c],24u);
  (*v)[a]=add64(add64((*v)[a],(*v)[b]),y); (*v)[d]=rotr((*v)[d]^(*v)[a],16u);
  (*v)[c]=add64((*v)[c],(*v)[d]); (*v)[b]=rotr((*v)[b]^(*v)[c],63u);
}
const SIGMA=array<u32,192>(${Array.from({length:12},(_,r)=>SIGMA[r%10]).flat().map(x=>`${x}u`).join(',')});
fn blake(group:u32)->array<u32,16> {
  var h:array<vec2<u32>,8>;
  var v:array<vec2<u32>,16>;
  var m:array<vec2<u32>,16>;
  for(var i=0u;i<8u;i++) { h[i]=vec2<u32>(param(i*2u),param(i*2u+1u)); v[i]=h[i]; }
  ${IV.map((x,i)=>`v[${i+8}]=vec2<u32>(${hex(x&0xffffffffn)},${hex(x>>32n)});`).join('\n')}
  v[12].x=v[12].x^144u; v[14]=v[14]^vec2<u32>(0xffffffffu);
  m[0]=vec2<u32>(param(16u),param(17u)); m[1]=vec2<u32>(param(18u),group);
  for(var r=0u;r<12u;r++) {
    let s=r*16u;
    mix(&v,0u,4u,8u,12u,m[SIGMA[s]],m[SIGMA[s+1u]]);
    mix(&v,1u,5u,9u,13u,m[SIGMA[s+2u]],m[SIGMA[s+3u]]);
    mix(&v,2u,6u,10u,14u,m[SIGMA[s+4u]],m[SIGMA[s+5u]]);
    mix(&v,3u,7u,11u,15u,m[SIGMA[s+6u]],m[SIGMA[s+7u]]);
    mix(&v,0u,5u,10u,15u,m[SIGMA[s+8u]],m[SIGMA[s+9u]]);
    mix(&v,1u,6u,11u,12u,m[SIGMA[s+10u]],m[SIGMA[s+11u]]);
    mix(&v,2u,7u,8u,13u,m[SIGMA[s+12u]],m[SIGMA[s+13u]]);
    mix(&v,3u,4u,9u,14u,m[SIGMA[s+14u]],m[SIGMA[s+15u]]);
  }
  var result:array<u32,16>;
  for(var i=0u;i<8u;i++) { let word=h[i]^v[i]^v[i+8u]; result[i*2u]=word.x; result[i*2u+1u]=word.y; }
  return result;
}
`;
}
function counters() {
  return `struct Counters { values:array<atomic<u32>> }
@group(0) @binding(1) var<storage,read_write> counts:Counters;\n`;
}
function outputs(groupSize, firstBinding) {
  return `struct Words { values:array<u32> }
${Array.from({length:groupSize},(_,i)=>`@group(0) @binding(${firstBinding+i}) var<storage,read_write> out${i}:Words;`).join('\n')}
fn store(bucket:u32,slot:u32,word:u32,value:u32) {
  let relative=bucket-param(24u); let chunk=relative/param(37u);
  let offset=((relative%param(37u))*SLOTS+slot)*param(27u)+word;
  switch chunk {
    ${Array.from({length:groupSize},(_,i)=>`case ${i}u: { out${i}.values[offset]=value; }`).join('\n')}
    default: {}
  }
}\n`;
}
export function initialShader(p, groupSize) {
  return common(p)+counters()+outputs(groupSize,2)+`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let group=param(20u)+gid.x; if(group>=param(21u)) { return; }
  let digest=blake(group);
  for(var leaf=0u;leaf<HASHES_PER_BLAKE;leaf++) {
    let index=group*HASHES_PER_BLAKE+leaf; if(index>=LEAVES) { continue; }
    var words:array<u32,7>;
    for(var w=0u;w<HASH_WORDS;w++) { words[w]=swap32(digest[leaf*HASH_WORDS+w]); }
    let bucket=words[0]>>(32u-BUCKET_BITS);
    if(bucket<param(24u)||bucket>=param(25u)) { continue; }
    let slot=atomicAdd(&counts.values[bucket],1u);
    if(slot>=SLOTS) { atomicAdd(&counts.values[2u*NBUCKETS],1u); continue; }
    for(var w=0u;w<param(31u);w++) {
      store(bucket,slot,w,(words[w]<<BUCKET_BITS)|(words[w+1u]>>(32u-BUCKET_BITS)));
    }
    store(bucket,slot,param(29u),index);
  }
}`;
}
export function roundShader(p, groupSize) {
  return common(p)+counters()+outputs(groupSize,3)+`
@group(0) @binding(2) var<storage,read> inputWords:Words;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let bucket=param(20u)+gid.x; if(bucket>=param(21u)) { return; }
  let size=min(atomicLoad(&counts.values[param(32u)*NBUCKETS+bucket]),SLOTS);
  let base=(bucket-param(23u))*SLOTS*param(26u);
  for(var a=0u;a<size;a++) {
    let aoff=base+a*param(26u);
    for(var b=a+1u;b<size;b++) {
      let boff=base+b*param(26u);
      let first=inputWords.values[aoff]^inputWords.values[boff];
      if((first>>28u)!=0u) { continue; }
      let destination=(first<<(4u))>>(32u-BUCKET_BITS);
      if(destination<param(24u)||destination>=param(25u)) { continue; }
      var words:array<u32,7>; var nonzero=0u;
      for(var w=0u;w<param(30u);w++) { words[w]=inputWords.values[aoff+w]^inputWords.values[boff+w]; nonzero=nonzero|words[w]; }
      // Exact duplicate subtrees produce a zero xor and would flood bucket0.
      if(nonzero==0u) { continue; }
      let slot=atomicAdd(&counts.values[param(33u)*NBUCKETS+destination],1u);
      if(slot>=SLOTS) { atomicAdd(&counts.values[2u*NBUCKETS],1u); continue; }
      for(var w=0u;w<param(31u);w++) {
        store(destination,slot,w,(words[w]<<DIGIT)|(words[w+1u]>>(32u-DIGIT)));
      }
      store(destination,slot,param(29u),(bucket<<12u)|(a<<6u)|b);
    }
  }
}`;
}
export function finalShader(p, maxRoots) {
  return common(p)+counters()+`
struct Words { values:array<u32> }
struct Roots { count:atomic<u32>, overflow:atomic<u32>, values:array<u32> }
@group(0) @binding(2) var<storage,read> inputWords:Words;
@group(0) @binding(3) var<storage,read_write> roots:Roots;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  let bucket=param(20u)+gid.x; if(bucket>=param(21u)) { return; }
  let size=min(atomicLoad(&counts.values[param(32u)*NBUCKETS+bucket]),SLOTS);
  let base=(bucket-param(23u))*SLOTS*param(26u);
  for(var a=0u;a<size;a++) {
    for(var b=a+1u;b<size;b++) {
      if(inputWords.values[base+a*param(26u)]!=inputWords.values[base+b*param(26u)]) { continue; }
      let slot=atomicAdd(&roots.count,1u);
      if(slot<${maxRoots}u) { roots.values[slot]=(bucket<<12u)|(a<<6u)|b; }
      else { atomicAdd(&roots.overflow,1u); }
    }
  }
}`;
}
export function hashTestShader(p) {
  return common(p)+`
struct Words { values:array<u32> }
@group(0) @binding(1) var<storage,read_write> result:Words;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid:vec3<u32>) {
  if(gid.x>=param(21u)) { return; }
  let digest=blake(param(20u)+gid.x);
  for(var i=0u;i<${p.digestBytes / 4}u;i++) { result.values[gid.x*${p.digestBytes / 4}u+i]=digest[i]; }
}`;
}
