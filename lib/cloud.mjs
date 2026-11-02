import {decodeSnapshot,manifestEntry} from './snapshot-pages.mjs';
export class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
export function required(name){if(!process.env[name])throw new AppError(503,`${name} is not configured. This feature is not connected yet.`);return process.env[name];}
export async function request(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!r.ok)throw new AppError(r.status>=500?503:400,'Connected service rejected the request. Check its configuration or your inputs.');return data;}
export function supaHeaders(admin=false){const key=required(admin?'SUPABASE_SERVICE_ROLE_KEY':'SUPABASE_ANON_KEY');return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}
export const sb=(route,options={},admin=true)=>request(required('SUPABASE_URL')+route,{...options,headers:{...supaHeaders(admin),...options.headers}});
const cache=new Map(),pending=new Map();
export function clearSnapshotCache(){cache.clear();}
async function objectBytes(file){
 const r=await fetch(required('SUPABASE_URL')+'/storage/v1/object/authenticated/edgeboard/'+file.split('/').map(encodeURIComponent).join('/'),{headers:supaHeaders(true),signal:AbortSignal.timeout(30000)});
 if(r.status===404)return null;if(!r.ok&&r.status===400){let error;try{error=await r.json()}catch{}if(String(error?.statusCode)==='404'||error?.error==='not_found')return null;}if(!r.ok)throw new AppError(503,'Private snapshot storage could not be read.');return Buffer.from(await r.arrayBuffer());
}
async function manifest(){const cached=cache.get('__manifest');if(cached&&Date.now()-cached.at<60000)return cached.value;if(pending.has('__manifest'))return pending.get('__manifest');const promise=(async()=>{const bytes=await objectBytes('manifest.json');const value=bytes?decodeSnapshot(bytes):null;cache.set('__manifest',{at:Date.now(),value});return value;})();pending.set('__manifest',promise);try{return await promise}finally{pending.delete('__manifest')}}
export async function snapshot(file,fallback){
 if(!process.env.SUPABASE_URL)return fallback;
 const m=await manifest(),entry=manifestEntry(m,file),id=entry?.path||file;
 const cached=cache.get(file);if(cached&&cached.id===id&&Date.now()-cached.at<60000)return cached.value;
 if(pending.has(id))return pending.get(id);
 const promise=(async()=>{const bytes=await objectBytes(id);if(!bytes){if(entry)throw new AppError(503,'The published snapshot is incomplete.');cache.set(file,{at:Date.now(),id,value:fallback});return fallback;}let value;try{value=decodeSnapshot(bytes,entry);}catch{throw new AppError(503,'Stored research data failed its integrity check.');}cache.set(file,{at:Date.now(),id,value});return value;})();
 pending.set(id,promise);try{return await promise}finally{pending.delete(id)}
}
export async function bundle(){const files=['live-data.json','evidence.json','evidence.auto.json','evidence.players.json','roster-cache.json','context.auto.json','team-history.json','future-schedule.json','fantasy-game-logs.json'];const a=await Promise.all(files.map(f=>snapshot(f,['live-data.json','context.auto.json','team-history.json','future-schedule.json'].includes(f)?{}:[])));const profiles=new Map(a[4].map(p=>[p.league+'|'+p.subject,p]));const baseRecords=[...a[1],...a[3]];return {live:a[0],baseRecords,autoRecords:a[2],records:[...baseRecords,...a[2]].map(r=>({...r,profile:profiles.get(r.league+'|'+r.subject)||r.profile})),rosters:a[4],context:{...a[5],rosters:a[4],teamGames:a[6].games||[]},schedule:a[7],fantasyLogs:a[8]};}
