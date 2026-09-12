export const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export function unhex(value, bytes) {
  if(typeof value!=='string'||value.length!==bytes*2||!/^[0-9a-f]+$/i.test(value)) throw new Error('Invalid mining field.');
  return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));
}
export function parseJob(params) {
  if(!Array.isArray(params)||params.length!==10||typeof params[0]!=='string'||!/^[0-9a-f]{1,8}$/i.test(params[0])||typeof params[7]!=='boolean'||params[8]!=='192_7'||params[9]!=='ZcashPoW') throw new Error('The pool did not provide ZCL Equihash 192,7 work.');
  const sizes=[4,32,32,32,4,4];
  const prefix=new Uint8Array(108); let offset=0;
  sizes.forEach((size,i)=>{prefix.set(unhex(params[i+1],size),offset);offset+=size;});
  return {id:params[0],prefix,time:params[5],previousHash:params[2]};
}
export function makeHeader(job,noncePrefix,nonce) {
  if(!(nonce instanceof Uint8Array)||nonce.length!==28) throw new Error('Invalid nonce.');
  const result=new Uint8Array(140);result.set(job.prefix);result.set(unhex(noncePrefix,4),108);result.set(nonce,112);return result;
}
export async function meetsTarget(header,proof,target,subtle=globalThis.crypto.subtle) {
  unhex(target,32);
  if(header.length!==140||proof.length!==400) throw new Error('Invalid header or proof size.');
  const block=new Uint8Array(543);block.set(header);block.set([0xfd,0x90,0x01],140);block.set(proof,143);
  const first=await subtle.digest('SHA-256',block);
  const hash=new Uint8Array(await subtle.digest('SHA-256',first));
  return BigInt('0x'+hex(hash.reverse()))<=BigInt('0x'+target);
}
