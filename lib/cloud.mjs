import {seasonYear} from './seasons.mjs';
import {withCurrentProfiles} from './profiles.mjs';
import {decodeSnapshot,manifestEntry} from './snapshot-pages.mjs';
export class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
export function required(name){if(!process.env[name])throw new AppError(503,`${name} is not configured. This feature is not connected yet.`);return process.env[name];}
export async function request(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!r.ok){if(new URL(url).hostname==='api.openai.com'){const code=data?.error?.code;const messages={insufficient_quota:'OpenAI API credits or spending quota are unavailable. Check API billing and project limits.',invalid_api_key:'OpenAI rejected the configured API key. Replace the Production key in Vercel.',model_not_found:'The configured OpenAI model is unavailable to this API project.',unsupported_parameter:'OpenAI rejected a model parameter. The statistical analysis remains available.'};if(messages[code])throw new AppError(503,messages[code]);const safe=/^[a-z_]{1,60}$/.test(String(code||data?.error?.type||''))?String(code||data.error.type):'request_rejected';throw new AppError(503,`OpenAI rejected the request (HTTP ${r.status}, ${safe}). Check API project permissions and model access.`);}throw new AppError(r.status>=500?503:400,'Connected service rejected the request. Check its configuration or your inputs.');}return data;}
export function supaHeaders(admin=false){const key=required(admin?'SUPABASE_SERVICE_ROLE_KEY':'SUPABASE_ANON_KEY');return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};}
export const sb=(route,options={},admin=true)=>request(required('SUPABASE_URL')+route,{...options,headers:{...supaHeaders(admin),...options.headers}});
const cache=new Map(),pending=new Map();
export function clearSnapshotCache(){cache.clear();}
async function objectBytes(file){
 const r=await fetch(required('SUPABASE_URL')+'/storage/v1/object/authenticated/edgeboard/'+file.split('/').map(encodeURIComponent).join('/')+(file==='manifest.json'?'?v='+Date.now():''),{cache:'no-store',headers:supaHeaders(true),signal:AbortSignal.timeout(30000)});
 if(r.status===404)return null;if(!r.ok&&r.status===400){let error;try{error=await r.json()}catch{}if(String(error?.statusCode)==='404'||error?.error==='not_found')return null;}if(!r.ok)throw new AppError(503,'Private snapshot storage could not be read.');return Buffer.from(await r.arrayBuffer());
}
async function manifest(){const cached=cache.get('__manifest');if(cached&&Date.now()-cached.at<60000)return cached.value;if(pending.has('__manifest'))return pending.get('__manifest');const promise=(async()=>{const bytes=await objectBytes('manifest.json');const value=bytes?decodeSnapshot(bytes):null;cache.set('__manifest',{at:Date.now(),value});return value;})();pending.set('__manifest',promise);try{return await promise}finally{pending.delete('__manifest')}}
export async function snapshotRevision({fresh=false}={}){if(!process.env.SUPABASE_URL)return 'empty';if(fresh)cache.delete('__manifest');const m=await manifest();return String(m?.snapshotID||m?.publishedAt||'empty');}
export async function snapshot(file,fallback){
 if(!process.env.SUPABASE_URL)return fallback;
 const m=await manifest(),entry=manifestEntry(m,file),id=entry?.path||file;
 const cached=cache.get(file);if(cached&&cached.id===id&&(entry||Date.now()-cached.at<60000))return cached.value;
 if(pending.has(id))return pending.get(id);
 const promise=(async()=>{const bytes=await objectBytes(id);if(!bytes){if(entry)throw new AppError(503,'The published snapshot is incomplete.');cache.set(file,{at:Date.now(),id,value:fallback});return fallback;}let value;try{value=decodeSnapshot(bytes,entry);}catch{throw new AppError(503,'Stored research data failed its integrity check.');}cache.set(file,{at:Date.now(),id,value});return value;})();
 pending.set(id,promise);try{return await promise}finally{pending.delete(id)}
}
export async function bundle({researchOnly=false,includeHistory=false}={}){
 const year=seasonYear('NFL',new Date().toISOString().slice(0,10)),historyYears=includeHistory?[year-1,year-2]:[],files=['live-data.json','evidence.json','evidence.auto.json','evidence.players.json','roster-cache.json','context.auto.json','team-history.json','future-schedule.json','fantasy-game-logs.json',...historyYears.map(y=>`evidence.nfl-${y}.json`)];
 const a=await Promise.all(files.map((f,i)=>researchOnly&&i>=7&&i<=8?null:snapshot(f,['live-data.json','context.auto.json','team-history.json','future-schedule.json'].includes(f)?{}:[]))),baseRecords=[...a[1],...a[3]],historicalRecords=Object.fromEntries(historyYears.map((y,i)=>[y,a[9+i]]));
 return {live:a[0],baseRecords,autoRecords:a[2],historicalRecords,records:withCurrentProfiles([...baseRecords,...a[2],...Object.values(historicalRecords).flat()],a[4]),rosters:a[4],context:{...a[5],rosters:a[4],teamGames:a[6].games||[]},schedule:a[7],fantasyLogs:a[8]};
}
