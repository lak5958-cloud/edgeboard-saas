import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,unlink,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const immutable=/^imports\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+\.json\.gz$/;
const digest=bytes=>createHash('sha256').update(bytes).digest();
// Server-local, private and disposable. Never cache manifests or mutable legacy paths.
// Only compressed bytes live here; audit reports are still decoded one at a time.
export function privateByteCache({directory=join(tmpdir(),'edgeboard-private-bytes-v1'),maxBytes=128*1024*1024,maxObjectBytes=8*1024*1024}={}){
 const pending=new Map();
 async function prune(incoming){
  const rows=await Promise.all((await readdir(directory)).filter(n=>/^[a-f0-9]{64}\.bin$/.test(n)).map(async name=>{try{const s=await stat(join(directory,name));return {name,bytes:s.size,at:s.mtimeMs};}catch{return null;}}));
  const files=rows.filter(Boolean).sort((a,b)=>a.at-b.at);let total=files.reduce((n,f)=>n+f.bytes,0);
  for(const f of files){if(total+incoming<=maxBytes)break;await unlink(join(directory,f.name)).catch(()=>{});total-=f.bytes;}
 }
 return async function cached(namespace,path,load){
  if(!immutable.test(path))return load();
  const key=createHash('sha256').update(namespace+'\0'+path).digest('hex'),file=join(directory,key+'.bin');
  if(pending.has(key))return pending.get(key);
  const promise=(async()=>{
   try{
    const s=await stat(file);if(s.size>maxObjectBytes+32)throw Error('Oversized local entry');
    const stored=await readFile(file),bytes=stored.subarray(32);
    if(stored.length<34||!digest(bytes).equals(stored.subarray(0,32)))throw Error('Invalid local entry');
    return bytes;
   }catch{await unlink(file).catch(()=>{});}
   const bytes=await load();
   if(!Buffer.isBuffer(bytes)||bytes.length<2||bytes.length>maxObjectBytes||bytes.length+32>maxBytes||bytes[0]!==0x1f||bytes[1]!==0x8b)return bytes;
   let temporary;
   try{
    await mkdir(directory,{recursive:true,mode:0o700});await prune(bytes.length+32);
    temporary=file+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,Buffer.concat([digest(bytes),bytes]),{mode:0o600,flag:'wx'});await rename(temporary,file);
   }catch{if(temporary)await unlink(temporary).catch(()=>{});}// Cache failures cannot interrupt research.
   return bytes;
  })();
  pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
 };
}
export const cachedPrivateBytes=privateByteCache();
