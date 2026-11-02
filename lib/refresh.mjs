import {withCurrentProfiles} from './profiles.mjs';
import {gzipSync} from 'node:zlib';import {randomUUID,createHash} from 'node:crypto';
import {sb,snapshot,bundle,supaHeaders,required,clearSnapshotCache} from './cloud.mjs';
import {fetchOdds} from './odds-provider.mjs';import {collectSports} from './sports-collector.mjs';import {buildDailyPicks} from './daily-picks.mjs';
export async function providerJSON(url,headers={}){const r=await fetch(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Provider HTTP '+r.status);return r.json();}
export async function publishUpdates(updates,token){
 const prior=await snapshot('manifest.json',null);if(!prior?.files)throw Error('A source snapshot must be imported first.');const id='refresh-'+Date.now()+'-'+randomUUID(),manifest={...prior,snapshotID:id,publishedAt:new Date().toISOString(),files:{...prior.files}};
 for(const [file,value] of Object.entries(updates)){const raw=Buffer.from(JSON.stringify(value));if(raw.length>100*1024*1024)throw Error('Expanded snapshot exceeds size limit');const bytes=gzipSync(raw),hash=createHash('sha256').update(bytes).digest('hex');if(prior.files[file]?.sha256===hash)continue;const path=`imports/${id}/${file}.gz`;await sb('/storage/v1/object/edgeboard/'+path,{method:'POST',headers:{'Content-Type':'application/gzip'},body:bytes});manifest.files[file]={path,bytes:bytes.length,rawBytes:raw.length,sha256:hash};}
 // Check lease again before atomic publication; the DB lease exceeds function max duration.
 const valid=await sb('/rest/v1/refresh_jobs?id=eq.main&token=eq.'+token+'&select=token');if(!valid.length)throw Error('Refresh lease lost; publication canceled');
 await sb('/storage/v1/object/edgeboard/manifest.json',{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'true'},body:JSON.stringify(manifest)});clearSnapshotCache();return manifest.snapshotID;
}
export async function runRefresh({stats=true,maxEvents=40}={}){
 const token=randomUUID(),startedAt=new Date().toISOString(),deadline=Date.now()+215000;
 const locked=await sb('/rest/v1/rpc/acquire_refresh',{method:'POST',body:JSON.stringify({lease_token:token})});if(!locked)return {running:true,message:'A refresh is already running.'};
 let result;
 try{
  clearSnapshotCache();const data=await bundle(),updates={},old=await snapshot('refresh-state.json',{});let odds;
  try{odds=await fetchOdds(process.env.SPORTSGAMEODDS_API_KEY,{get:providerJSON});if(odds.board){updates['live-data.json']=odds.board;data.live=odds.board;}}catch{odds={status:'error',message:'Odds provider request failed; earlier board and timestamps retained. Verify the provider key, plan coverage and quota.'};}
  if(stats){const collected=await collectSports(data,old,{get:providerJSON,maxEvents,deadline:deadline-35000});Object.assign(updates,collected.updates);result={processed:collected.processed,pendingGames:collected.state.pending,issues:collected.errors};data.autoRecords=updates['evidence.auto.json'];data.records=[...data.baseRecords,...data.autoRecords];data.rosters=updates['roster-cache.json'];data.context={...updates['context.auto.json'],rosters:data.rosters,teamGames:updates['team-history.json'].games};data.schedule=updates['future-schedule.json'];data.fantasyLogs=updates['fantasy-game-logs.json'];}
  data.records=withCurrentProfiles(data.records,data.rosters);
  if(Date.now()<deadline-20000)updates['daily-picks.json']=await buildDailyPicks(data,{deadline:deadline-10000});
  result={...result,startedAt,finishedAt:new Date().toISOString(),odds:{status:odds.status,message:odds.message||null,quotes:odds.board?.quotes.length??null},status:odds.status==='ok'&&!result?.issues?.length?'ok':'partial',statsEnabled:stats};
  result.ok=true;result.summary=`${result.processed||0} box scores refreshed; ${result.pendingGames??0} pending. Odds: ${odds.status}. ${odds.message||''}`;updates['refresh-status.json']=result;await publishUpdates(updates,token);await sb('/rest/v1/rpc/finish_refresh',{method:'POST',body:JSON.stringify({lease_token:token,job_result:result})});return result;
 }catch{const fail={startedAt,finishedAt:new Date().toISOString(),status:'error',message:'Refresh could not publish. Previously published data is retained.'};await sb('/rest/v1/rpc/finish_refresh',{method:'POST',body:JSON.stringify({lease_token:token,job_result:fail})}).catch(()=>{});throw Object.assign(Error(fail.message),{status:503});}
}
