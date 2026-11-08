import {appendFrozenIndex} from './frozen-ledger.mjs';
import {collectOutsideFeed} from './outside-feed.mjs';
import {buildGameMarkets} from './game-markets.mjs';
import {withCurrentProfiles} from './profiles.mjs';
import {gzipSync} from 'node:zlib';import {randomUUID,createHash} from 'node:crypto';
import {sb,snapshot,bundle,supaHeaders,required,clearSnapshotCache} from './cloud.mjs';
import {fetchOdds} from './odds-provider.mjs';import {collectSports} from './sports-collector.mjs';import {buildDailyPicks} from './daily-picks.mjs';
export async function providerJSON(url,headers={}){const r=await fetch(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Object.assign(Error('Provider HTTP '+r.status),{providerStatus:r.status});return r.json();}
// Only publish a complete response. Authentication and rate limits are not retried.
export async function refreshOdds(key,get,options={}){
 const failure=e=>{
  const status=e?.providerStatus;
  const code=e?.code==='odds-budget'?'odds-budget':Number.isInteger(status)?'http-'+status:e?.code==='odds-pagination'?'pagination':e?.code==='odds-timeout'||e?.name==='TimeoutError'?'timeout':'response-error';
  const detail=status===401||status===403?'Provider denied the configured key or access':status===429?'Provider rate limit or quota reached':Number.isInteger(status)?'Provider returned HTTP '+status:code==='pagination'?'Provider pagination did not complete':code==='timeout'?'Provider request timed out':'Provider response could not be read';
  return {status:'error',code,message:detail+'. Earlier odds and timestamps retained.'};
 };
 try{return await fetchOdds(key,{...options,get,deadline:Date.now()+30000});}
 catch(e){
  const first=failure(e),status=e?.providerStatus;
  if(![400,413,422,500,502,503,504].includes(status)&&!['pagination','timeout'].includes(first.code))return first;
  try{
   const fallback=await fetchOdds(key,{...options,get,includeAlts:false,deadline:Date.now()+20000});
   if(!fallback.board?.quotes.length)return first;
   return {...fallback,status:'limited',code:first.code,message:'Standard odds refreshed. Alternate-line request failed ('+first.code+').'};
  }catch(second){return failure(second);}
 }
}
// Shared UTC budget buckets include scheduled and owner-triggered refreshes.
export async function budgetedOddsRefresh(key,get,reserve,env=process.env,now=new Date(),{manual=false,slateEnd=null}={}){
 const settings=[['SPORTSGAMEODDS_DAILY_REFRESH_CAP','pull'],['SPORTSGAMEODDS_DAILY_REQUEST_CAP','request']];
 const caps={};
 for(const [name,scope] of settings){
  const raw=env[name]?.trim();
  if(!raw)continue;
  const limit=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(limit)||limit<1||limit>10000)return {status:'error',code:'budget-config',message:name+' must be an integer from 1 to 10000.'};
  caps[scope]=limit;
 }
 if(!key)return refreshOdds(key,get);
 const skipped={status:'limited',code:'daily-budget',message:'Daily odds budget reached. Saved prices keep their original timestamps. The budget resets at midnight UTC.'};
 const hours=env.SPORTSGAMEODDS_REFRESH_HOURS_ET?.trim();
 if(hours){
  const slots=hours.split(',').map(x=>x.trim());
  if(slots.some(x=>!/^\d{1,2}$/.test(x)||Number(x)>23))return {status:'error',code:'budget-config',message:'SPORTSGAMEODDS_REFRESH_HOURS_ET must contain comma-separated hours from 0 to 23.'};
  const easternHour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now));
  if((!manual&&!slots.map(Number).includes(easternHour))||!(await reserve('slot',1,3600)))return {status:'limited',code:'scheduled-odds',message:'Odds pulls are limited to configured Eastern hours. Saved prices keep their original timestamps.'};
 }
 if(slateEnd&&manual&&!(await reserve('manual',2)))return {...skipped,message:'The two owner odds refreshes for this UTC day have been used.'};
 if(caps.pull&&!(await reserve('pull',caps.pull)))return skipped;
 let remaining=Infinity;
 if(slateEnd){
  try{
   const usage=await get('https://api.sportsgameodds.com/v2/account/usage',{'x-api-key':key});
   const limits=usage?.data?.rateLimits?.['per-month'];
   const quantity=value=>typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
   const used=quantity(limits?.['current-entities']),max=quantity(limits?.['max-entities']);
   if(usage.success===false||!Number.isSafeInteger(used)||used<0||!(max==='unlimited'||Number.isSafeInteger(max)&&max>0))throw Error('Invalid quota response');
   remaining=Math.min(2500,max==='unlimited'?Infinity:max)-used-(manual?0:100);
  }catch{return {status:'error',code:'usage-unavailable',message:'Could not verify the odds quota. Saved prices retain their original timestamps.'};}
 }
 const quota={status:'limited',code:'monthly-budget',message:'Odds quota reserve reached. Saved prices retain their original timestamps.'};
 if(remaining<10)return quota;
 let quotaBlocked=false;
 const odds=await refreshOdds(key,async (...args)=>{
  if(remaining<10){quotaBlocked=true;throw Object.assign(Error('Odds quota reserve reached'),{code:'odds-budget'});}
  if(caps.request&&!(await reserve('request',caps.request)))throw Object.assign(Error('Daily odds request budget reached'),{code:'odds-budget'});
  remaining-=10;
  const response=await get(...args);
  if(Array.isArray(response?.data))remaining+=10-Math.max(1,response.data.length);
  return response;
 },{now,slateEnd});
 if(quotaBlocked)return quota;
 return odds.code==='odds-budget'?skipped:odds;
}
const easternDate=date=>new Date(date).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
export function easternSlateEnd(now){
 const tomorrow=new Date(easternDate(now)+'T04:00:00Z');
 tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'longOffset'}).formatToParts(tomorrow).find(p=>p.type==='timeZoneName').value.slice(3);
 return new Date(tomorrow.toISOString().slice(0,10)+'T00:00:00'+offset);
}
export function slateIsOver(data,now){
 const day=easternDate(now),today=[...(data.live.games||[]),...(data.schedule?.games||[])].filter(g=>Number.isFinite(Date.parse(g.start))&&easternDate(g.start)===day);
 return today.length>0&&today.every(g=>Date.parse(g.start)<=now.getTime());
}
const eveningOddsPolicy={SPORTSGAMEODDS_REFRESH_HOURS_ET:'17,18,19,20,21,22',SPORTSGAMEODDS_DAILY_REFRESH_CAP:'8',SPORTSGAMEODDS_DAILY_REQUEST_CAP:'20'};
export async function publishUpdates(updates,token){
 const prior=await snapshot('manifest.json',null);if(!prior?.files)throw Error('A source snapshot must be imported first.');const id='refresh-'+Date.now()+'-'+randomUUID(),manifest={...prior,snapshotID:id,publishedAt:new Date().toISOString(),files:{...prior.files}};
 for(const [file,value] of Object.entries(updates)){const raw=Buffer.from(JSON.stringify(value));if(raw.length>100*1024*1024)throw Error('Expanded snapshot exceeds size limit');const bytes=gzipSync(raw),hash=createHash('sha256').update(bytes).digest('hex');if(prior.files[file]?.sha256===hash)continue;const path=`imports/${id}/${file}.gz`;await sb('/storage/v1/object/edgeboard/'+path,{method:'POST',headers:{'Content-Type':'application/gzip'},body:bytes});manifest.files[file]={path,bytes:bytes.length,rawBytes:raw.length,sha256:hash};}
 const savedAt=new Date().toISOString(),slateDate=new Date(savedAt).toLocaleDateString('en-CA',{timeZone:'America/New_York'}),entries=['daily-picks.json','daily-game-markets.json'].filter(file=>updates[file]&&manifest.files[file]?.path?.startsWith(`imports/${id}/`)).map(file=>({path:manifest.files[file].path,savedAt,slateDate,kind:file==='daily-picks.json'?'players':'games',modelVersion:updates[file].modelVersion||'season-team-guard-v2'}));
 if(entries.length){const index=appendFrozenIndex(await snapshot('frozen-index.json',[]),entries),raw=Buffer.from(JSON.stringify(index)),bytes=gzipSync(raw),path=`imports/${id}/frozen-index.json.gz`;await sb('/storage/v1/object/edgeboard/'+path,{method:'POST',headers:{'Content-Type':'application/gzip'},body:bytes});manifest.files['frozen-index.json']={path,bytes:bytes.length,rawBytes:raw.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
 // Check lease again before atomic publication; the DB lease exceeds function max duration.
 const valid=await sb('/rest/v1/refresh_jobs?id=eq.main&token=eq.'+token+'&select=token');if(!valid.length)throw Error('Refresh lease lost; publication canceled');
 await sb('/storage/v1/object/edgeboard/manifest.json',{method:'POST',headers:{'Content-Type':'application/json','x-upsert':'true'},body:JSON.stringify(manifest)});clearSnapshotCache({manifestOnly:true});return manifest.snapshotID;
}
export async function runRefresh({stats=true,maxEvents=40,manual=false}={}){
 const token=randomUUID(),startedAt=new Date().toISOString(),deadline=Date.now()+215000;
 const locked=await sb('/rest/v1/rpc/acquire_refresh',{method:'POST',body:JSON.stringify({lease_token:token})});if(!locked)return {running:true,message:'A refresh is already running.'};
 let result;
 try{
  clearSnapshotCache({manifestOnly:true});const data=await bundle({includeHistory:true}),updates={},old=await snapshot('refresh-state.json',{});let odds;
  const now=new Date(startedAt);
  odds=!manual&&slateIsOver(data,now)?{status:'limited',code:'slate-over',message:'Today’s known games have started. Saved prices retain their original timestamps.'}:await budgetedOddsRefresh(process.env.SPORTSGAMEODDS_API_KEY,providerJSON,(scope,max,window=86400)=>sb('/rest/v1/rpc/consume_budget',{method:'POST',body:JSON.stringify({budget_key:'edgeboard-sgo-daily-'+scope,max_uses:max,window_seconds:window})}),eveningOddsPolicy,now,{manual,slateEnd:easternSlateEnd(now)});
  if(odds.board?.quotes.length){updates['live-data.json']=odds.board;data.live=odds.board;}

  if(stats){const collected=await collectSports(data,old,{get:providerJSON,maxEvents,deadline:deadline-35000});Object.assign(updates,collected.updates);result={processed:collected.processed,pendingGames:collected.state.pending,issues:collected.errors};data.autoRecords=updates['evidence.auto.json'];data.historicalRecords=collected.historicalRecords||data.historicalRecords||{};data.records=[...data.baseRecords,...data.autoRecords,...Object.values(data.historicalRecords).flat()];data.rosters=updates['roster-cache.json'];data.context={...updates['context.auto.json'],rosters:data.rosters,teamGames:updates['team-history.json'].games};data.schedule=updates['future-schedule.json'];data.fantasyLogs=updates['fantasy-game-logs.json'];}
  data.records=withCurrentProfiles(data.records,data.rosters);
  if(Date.now()<deadline-45000){const priorFeed=await snapshot('outside-feed.json',{});if(!priorFeed.checkedAt||Date.now()-Date.parse(priorFeed.checkedAt)>3600000)updates['outside-feed.json']=await collectOutsideFeed(priorFeed);}
  if(Date.now()<deadline-30000)updates['daily-game-markets.json']=buildGameMarkets(data,{deadline:deadline-25000});
  if(Date.now()<deadline-20000){
   const sourced=await snapshot('context.user.json',{});
   const context={...data.context,factors:[...(data.context.factors||[]),...(Array.isArray(sourced?.factors)?sourced.factors:[])],lineups:[...(data.context.lineups||[]),...(Array.isArray(sourced?.lineups)?sourced.lineups:[])]};
   updates['daily-picks.json']=await buildDailyPicks({...data,archiveContext:context},{deadline:deadline-10000});
  }
  if(updates['daily-picks.json'])updates['daily-picks.json'].oddsStatus={status:odds.status,message:odds.message||null};
  result={...result,startedAt,finishedAt:new Date().toISOString(),odds:{status:odds.status,message:odds.message||null,code:odds.code||null,quotes:odds.board?.quotes.length??null},status:odds.status==='ok'&&!result?.issues?.length?'ok':'partial',statsEnabled:stats};
  result.ok=true;result.summary=`${result.processed||0} box scores refreshed; ${result.pendingGames??0} pending. Odds: ${odds.status}. ${odds.message||''}`;updates['refresh-status.json']=result;await publishUpdates(updates,token);await sb('/rest/v1/rpc/finish_refresh',{method:'POST',body:JSON.stringify({lease_token:token,job_result:result})});return result;
 }catch{const fail={startedAt,finishedAt:new Date().toISOString(),status:'error',message:'Refresh could not publish. Previously published data is retained.'};await sb('/rest/v1/rpc/finish_refresh',{method:'POST',body:JSON.stringify({lease_token:token,job_result:fail})}).catch(()=>{});throw Object.assign(Error(fail.message),{status:503});}
}
