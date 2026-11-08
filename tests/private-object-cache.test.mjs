import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {privateByteCache} from '../lib/private-object-cache.mjs';

const path='imports/synthetic/stats.json.gz',bytes=gzipSync(JSON.stringify({value:42}));
test('immutable compressed downloads survive new cache instances, isolate projects, and coalesce requests',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'edgeboard-cache-test-'));let downloads=0;
 const load=async()=>{downloads++;return bytes;};
 try{
  const cache=privateByteCache({directory});
  assert.deepEqual(await Promise.all([cache('project-a',path,load),cache('project-a',path,load)]),[bytes,bytes]);
  assert.equal(downloads,1);
  assert.deepEqual(await privateByteCache({directory})('project-a',path,load),bytes);assert.equal(downloads,1);
  await cache('project-b',path,load);assert.equal(downloads,2);
  const files=await readdir(directory);assert.equal(files.length,2);
  for(const file of files)assert.equal((await stat(join(directory,file))).mode&0o777,0o600);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('mutable paths, missing responses and oversized objects are never retained; corrupt local bytes are downloaded again',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'edgeboard-cache-test-'));let downloads=0;
 const load=async()=>{downloads++;return bytes;};
 try{
  const cache=privateByteCache({directory});
  for(const mutable of ['manifest.json','evidence.json','../imports/x/a.json.gz']){await cache('p',mutable,load);await cache('p',mutable,load);}
  assert.equal(downloads,6);assert.equal((await readdir(directory)).length,0);
  await cache('p',path,async()=>null);assert.equal((await readdir(directory)).length,0);
  await privateByteCache({directory,maxObjectBytes:2})('p',path,load);assert.equal((await readdir(directory)).length,0);
  await cache('p',path,load);const file=join(directory,(await readdir(directory))[0]),stored=await readFile(file);stored[stored.length-1]^=1;await writeFile(file,stored);
  const before=downloads;assert.deepEqual(await cache('p',path,load),bytes);assert.equal(downloads,before+1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('local cache stays within its byte budget and filesystem failures leave the data available',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'edgeboard-cache-test-'));
 try{
  const cache=privateByteCache({directory,maxBytes:bytes.length+32});
  await cache('p',path,async()=>bytes);await cache('p','imports/synthetic/second.json.gz',async()=>bytes);
  assert.equal((await readdir(directory)).length,1);
  const blocked=join(directory,'blocked');await writeFile(blocked,'file');
  assert.deepEqual(await privateByteCache({directory:blocked})('p',path,async()=>bytes),bytes);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('refresh invalidation checks the new manifest while reusing unchanged immutable files',async()=>{
 const {snapshot,clearSnapshotCache}=await import('../lib/cloud.mjs');
 const original=globalThis.fetch,prior={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.SUPABASE_URL='https://bandwidth-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const run=Date.now().toString(),first={path:`imports/test-${run}/unchanged.json.gz`,bytes:bytes.length,rawBytes:Buffer.byteLength(JSON.stringify({value:42})),sha256:createHash('sha256').update(bytes).digest('hex')};
 const second={...first,path:`imports/test-${run}/changed.json.gz`};let current=first,manifests=0,objects=0;
 globalThis.fetch=async url=>{if(new URL(url).pathname.endsWith('manifest.json')){manifests++;return Response.json({files:{'bandwidth.json':current}});}objects++;return new Response(bytes);};
 try{
  clearSnapshotCache();await snapshot('bandwidth.json',null);
  clearSnapshotCache({manifestOnly:true});await snapshot('bandwidth.json',null);
  assert.equal(manifests,2);assert.equal(objects,1);
  current=second;clearSnapshotCache({manifestOnly:true});await snapshot('bandwidth.json',null);
  assert.equal(objects,2);assert.equal(manifests,3);
 }finally{
  globalThis.fetch=original;clearSnapshotCache();
  for(const [key,value] of [['SUPABASE_URL',prior.url],['SUPABASE_SERVICE_ROLE_KEY',prior.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
test('player directories read only roster data and workload checks omit unrelated odds and fantasy files',async()=>{
 const {bundle,clearSnapshotCache}=await import('../lib/cloud.mjs');
 const original=globalThis.fetch,prior={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.SUPABASE_URL='https://bundle-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
 const roster=[{id:'123',subject:'Synthetic Player',league:'NFL',team:'PHI',position:'WR'}],reads=[];
 globalThis.fetch=async url=>{const file=new URL(url).pathname.split('/').pop();reads.push(file);if(file==='manifest.json')return Response.json({publishedAt:'2026-11-08T13:00:00Z',files:{}});if(file==='roster-cache.json')return Response.json(roster);return Response.json([]);};
 try{
  clearSnapshotCache();const directory=await bundle({rostersOnly:true});
  assert.deepEqual(directory.rosters,roster);assert.equal(directory.live.generatedAt,'2026-11-08T13:00:00Z');
  assert.deepEqual(reads.sort(),['manifest.json','roster-cache.json']);
  reads.length=0;clearSnapshotCache();const workload=await bundle({workloadOnly:true});
  assert.deepEqual(workload.rosters,roster);assert.deepEqual(reads.sort(),['evidence.auto.json','evidence.json','evidence.players.json','manifest.json','roster-cache.json']);
 }finally{
  globalThis.fetch=original;clearSnapshotCache();
  for(const [key,value] of [['SUPABASE_URL',prior.url],['SUPABASE_SERVICE_ROLE_KEY',prior.key]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
