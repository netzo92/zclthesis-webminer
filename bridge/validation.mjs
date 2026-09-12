import {createHash,timingSafeEqual} from 'node:crypto';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function isFreshTimestamp(value,now=Date.now()) {
  if(typeof value!=='string')return false;
  const age=now-Date.parse(value);
  return Number.isFinite(age)&&age<=180000&&age>=-300000;
}
export function isZclAddress(address) {
  if(typeof address!=='string'||address.length!==35||!address.startsWith('t1'))return false;
  let value=0n;for(const c of address){const digit=alphabet.indexOf(c);if(digit<0)return false;value=value*58n+BigInt(digit);}
  let raw=value.toString(16);if(raw.length%2)raw='0'+raw;
  const bytes=Buffer.from(raw,'hex');if(bytes.length!==26||bytes[0]!==0x1c||bytes[1]!==0xb8)return false;
  const body=bytes.subarray(0,22),checksum=createHash('sha256').update(createHash('sha256').update(body).digest()).digest().subarray(0,4);
  return timingSafeEqual(checksum,bytes.subarray(22));
}
export function validSubmit(message,jobs) {
  return message&&message.type==='submit'&&Number.isSafeInteger(message.id)&&message.id>=0&&message.id<=2**31&&
    typeof message.job==='string'&&jobs.has(message.job)&&typeof message.time==='string'&&
    /^[0-9a-f]{8}$/i.test(message.time)&&typeof message.nonce==='string'&&/^[0-9a-f]{56}$/i.test(message.nonce)&&
    typeof message.solution==='string'&&/^fd9001[0-9a-f]{800}$/i.test(message.solution);
}
