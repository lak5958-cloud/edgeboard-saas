import {appendFrozenIndex} from './frozen-ledger.mjs';
import {collectOutsideFeed} from './outside-feed.mjs';
import {buildGameMarkets} from './game-markets.mjs';
import {withCurrentProfiles} from './profiles.mjs';
import {gzipSync} from 'node:zlib';import {randomUUID,createHash} from 'node:crypto';
import {sb,snapshot,bundle,supaHeaders,required,clearSnapshotCache} from './cloud.mjs';
import {fetchOdds} from './odds-provider.mjs';import {collectSports} from './sports-collector.mjs';import {buildDailyPicks} from './daily-picks.mjs';
export async function providerJSON(url,headers={}){const r=await fetch(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Object.assign(Error('Provider HTTP '+r.status),{providerStatus:r.status});return r.json();}
// Only publish a complete response. Authentication and rate limits are not retried.
export async function refreshOdds(key,get){
 const failure=e=>{
  const status=e?.providerStatus;
  const code=Number.isInteger(status)?'http-'+status:e?.code==='odds-pagination'?'pagination':e?.code==='odds-timeout'||e?.name==='TimeoutError'?'timeout':'response-error';
  const detail=status===401||status===403?'Provider denied the configured key or access':status===429?'Provider rate limit or quota reached':Number.isInteger(status)?'Provider returned HTTP '+status:code==='pagination'?'Provider pagination did not complete':code==='timeout'?'Provider request timed out':'Provider response could not be read';
  return {status:'error',code,message:detail+'. Earlier odds and timestamps retained.'};
 };
 try{return await fetchOdds(key,{get,deadline:Date.now()+30000});}
 catch(e){
  const first=failure(e),status=e?.providerStatus;
  if(![400,413,422,500,502,503,504].includes(status)&&!['pagination','timeout'].includes(first.code))return first;
  try{
   const fallback=await fetchOdds(key,{get,includeAlts:false,deadline:Date.now()+20000});
   if(!fallback.board?.quotes.length)return first;
   return {...fallback,status:'limited',code:first.code,message:'Standard odds refreshed. Alternate-line request failed ('+first.code+').'};
  }catch(second){return failure(second);}
 }
}
export async function publishUpdates(updates,token){
 const prior=await snapshot('manifest.json',null);if(!prior?.files)throw Error('A source snapshot must be imported first.');const id='refresh-'+Date.now()+'-'+randomUUID(),manifest={...prior,snapshotID:id,publishedAt:new Date().toISOString(),files:{...prior.files}};
 for(const [file,value] of Object.entries(updates)){const raw=Buffer.from(JSON.stringify(value));if(raw.length>100*1024*1024)throw Error('Expanded snapshot exceeds size limit');const bytes=gzipSync(raw),hash=createHash('sha256').update(bytes).digest('hex');if(prior.files[file]?.sha256===hash)continue;const path=`imports/${id}/${file}.gz`;await sb('/storage/v1/object/edgeboard/'+path,{method:'POST',headers:{'Content-Type':'application/gzip'},body:bytes});manifest.files[file]={path,bytes:bytes.length,rawBytes:raw.length,sha256:hash};}
 const savedAt=new Date().toISOString(),slateDate=new Date(savedAt).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),entries=['daily-picks.json','daily-game-markets.json'].filter(file=>updates[file]&&manifest.files[file]?.path?.startsWith(`imports/${id}/`)).map(file=>({path:manifest.files[file].path,savedAt,slateDate,kind:file==='daily-picks.json'?'players':'games',modelVersion:updates[file].modelVersion||'season-team-guard-v2'}));
 if(entries.length){const index=appendFrozenIndex(await snapshot('frozen-index.json',[]),entries),raw=Buffer.from(JSON.stringify(index)),bytes=gzipSync(raw),path=`imports/${id}/frozen-index.json.gz`;await sb('/storage/v1/object/edgeboard/'+path,{method:'POST',headers:{'Content-Type':'application/gzip'},body:bytes});manifest.files['frozen-index.json']={path,bytes:bytes.length,rawBytes:raw.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
 // Check lease again before atomic publication; the DB lease exceeds function max duration.
 const valid=await sb('/rest/v1/refresh_jobs?id=eq.main&token=eq.'+token+'&select=token');if(!valid.length)throw Error('Refresh lease lost; publication canceled');
 await sb('/storage/v1/object/edgeboard/manifest.json',{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'true'},body:JSON.stringify(manifest)});clearSnapshotCache();return manifest.snapshotID;
}
export async function runRefresh({stats=true,maxEvents=40}={}){
 const token=randomUUID(),startedAt=new Date().toISOString(),deadline=Date.now()+215000;
 const locked=await sb('/rest/v1/rpc/acquire_refresh',{method:'POST',body:JSON.stringify({lease_token:token})});if(!locked)return {running:true,message:'A refresh is already running.'};
 let result;
 try{
  clearSnapshotCache();const data=await bundle({includeHistory:true}),updates={},old=await snapshot('refresh-state.json',{});let odds;
  odds=await refreshOdds(process.env.SPORTSGAMEODDS_API_KEY,providerJSON);
  if(odds.board){updates['live-data.json']=odds.board;data.live=odds.board;}

  if(stats){const collected=await collectSports(data,old,{get:providerJSON,maxEvents,deadline:deadline-35000});Object.assign(updates,collected.updates);result={processed:collected.processed,pendingGames:collected.state.pending,issues:collected.errors};data.autoRecords=updates['evidence.auto.json'];data.historicalRecords=collected.historicalRecords||data.historicalRecords||{};data.records=[...data.baseRecords,...data.autoRecords,...Object.values(data.historicalRecords).flat()];data.rosters=updates['roster-cache.json'];data.context={...updates['context.auto.json'],rosters:data.rosters,teamGames:updates['team-history.json'].games};data.schedule=updates['future-schedule.json'];data.fantasyLogs=updates['fantasy-game-logs.json'];}
  data.records=withCurrentProfiles(data.records,data.rosters);
  if(Date.now()<deadline-45000){const priorFeed=await snapshot('outside-feed.json',{});if(!priorFeed.checkedAt||Date.now()-Date.parse(priorFeed.checkedAt)>3600000)updates['outside-feed.json']=await collectOutsideFeed(priorFeed);}
  if(Date.now()<deadline-30000)updates['daily-game-markets.json']=buildGameMarkets(data,{deadline:deadline-25000});
  if(Date.now()<deadline-20000)updates['daily-picks.json']=await buildDailyPicks(data,{deadline:deadline-10000});
  if(updates['daily-picks.json'])updates['daily-picks.json'].oddsStatus={status:odds.status,message:odds.message||null};
  result={...result,startedAt,finishedAt:new Date().toISOString(),odds:{status:odds.status,message:odds.message||null,code:odds.code||null,quotes:odds.board?.quotes.length??null},status:odds.status==='ok'&&!result?.issues?.length?'ok':'partial',statsEnabled:stats};
  result.ok=true;result.summary=`${result.processed||0} box scores refreshed; ${result.pendingGames??0} pending. Odds: ${odds.status}. ${odds.message||''}`;updates['refresh-status.json']=result;await publishUpdates(updates,token);await sb('/rest/v1/rpc/finish_refresh',{method:'POST',body:JSON.stringify({lease_token:token,job_result:result})});return result;
 }catch{const fail={startedAt,finishedAt:new Date().toISOString(),status:'error',message:'Refresh could not publish. Previously published data is retained.'};await sb('/rest/v1/rpc/finish_refresh',{method:'POST',body:JSON.stringify({lease_token:token,job_result:fail})}).catch(()=>{});throw Object.assign(Error(fail.message),{status:503});}
}
