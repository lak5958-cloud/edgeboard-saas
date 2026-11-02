import {completeFantasyBoxscores} from './fantasy-boxscores.mjs';
import {extractPlayerBoxscores,derivedStats} from './stats-parser.mjs';
import {summaryTeams} from './matchups.mjs';
import {normalizeStat,nameKey} from './insights.mjs';
import {eventSeason,seasonYear} from './seasons.mjs';
import {injuryRows} from './context.mjs';
const sport=l=>l==='NBA'?'basketball/nba':'football/nfl';
export async function mapLimit(items,limit,fn){let index=0;const results=[];await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=index++;if(i>=items.length)return;try{results[i]={ok:true,value:await fn(items[i],i)}}catch(error){results[i]={ok:false,error}}}}));return results;}
export function rosterRows(p,league,now){const t=p.team;if(!t?.id||!Array.isArray(p.athletes))throw Error('Roster schema unavailable');const athletes=p.athletes.flatMap(a=>a.items||a.athletes||[a]);const rows=athletes.filter(a=>a.id&&a.displayName).map(a=>({league,id:String(a.id),subject:a.displayName,currentTeamID:String(t.id),team:t.abbreviation,teamName:t.displayName,position:a.position?.abbreviation||null,status:a.status?.type||null,debutYear:a.debutYear??null,experienceYears:a.experience?.years??null,asOf:now.toISOString(),url:`https://www.espn.com/${league.toLowerCase()}/team/roster/_/name/${t.abbreviation}`}));if(!rows.length)throw Error('Roster empty');return rows;}
export function scheduleRows(payload,league,team,now){
 if(!Array.isArray(payload.events))throw Error('Schedule schema unavailable');const games=[],completed=[];
 for(const e of payload.events){const c=e.competitions?.[0];if(!c||eventSeason(e)!=='regular'||!Number.isFinite(Date.parse(e.date)))continue;const me=c.competitors?.find(x=>String(x.team?.id)===String(team.id)),opp=c.competitors?.find(x=>String(x.team?.id)!==String(team.id));if(!me||!opp)continue;
  const row={league,gameID:String(e.id),date:e.date.slice(0,10),start:e.date,teamID:String(team.id),team:team.abbreviation,opponentID:String(opp.team.id),opponent:opp.team.abbreviation,home:me.homeAway==='home',seasonType:'regular',seasonYear:seasonYear(league,e.date.slice(0,10)),source:`https://www.espn.com/${league.toLowerCase()}/game/_/gameId/${e.id}`};
  if(c.status?.type?.completed===true||e.status?.type?.completed===true){if(Date.parse(e.date)<now.getTime())completed.push({...row,points:Number(me.score?.value??me.score),allowed:Number(opp.score?.value??opp.score)});}else if(Date.parse(e.date)>now.getTime()&&!/postponed|canceled/i.test(c.status?.type?.name||''))games.push(row);
 }return {games,completed};
}
export function mergeEvidence(old,incoming){const m=new Map();for(const r of [...old,...incoming]){const k=[r.league,r.athleteID||nameKey(r.subject),normalizeStat(r.stat),r.periodID||'game'].join('|');if(!m.has(k))m.set(k,{...r,games:[]});const target=m.get(k);target.profile=r.profile||target.profile;const games=new Map(target.games.map(g=>[g.gameID,g]));for(const g of r.games||[])games.set(g.gameID,g);target.games=[...games.values()].sort((a,b)=>b.date.localeCompare(a.date));}return [...m.values()];}
export async function collectSports(data,state={}, {get,now=new Date(),maxEvents=40,deadline=Date.now()+160000}={}){
 state=structuredClone(state);state.events||={};state.teams||={};const errors=[],updates={},at=now.toISOString();let rosters=[...data.rosters],injuries=[...(data.context.injuries||[])],schedules=[...(data.schedule.games||[])],teamGames=[...(data.context.teamGames||[])];
 const safe=async label=>{if(Date.now()>deadline)throw Error('Refresh time budget reached');return get(label);};
 for(const league of ['NBA','NFL']){
  try{const p=await safe(`https://site.api.espn.com/apis/site/v2/sports/${sport(league)}/injuries`);if(!Array.isArray(p.injuries))throw Error('Injury schema unavailable');injuries=[...injuries.filter(i=>i.league!==league),...injuryRows(p,league,at)];state[league+'InjuriesAt']=at;}catch{errors.push(league+' injury feed unavailable; earlier reports retained.');}
  const due=!state[league+'TeamsAt']||now-Date.parse(state[league+'TeamsAt'])>=3600000;
  if(!due)continue;
  try{
   const p=await safe(`https://site.api.espn.com/apis/site/v2/sports/${sport(league)}/teams?limit=100`),teams=p.sports?.[0]?.leagues?.[0]?.teams?.map(x=>x.team);if(!Array.isArray(teams)||teams.length<(league==='NBA'?30:32))throw Error('Incomplete team index');
   const result=await mapLimit(teams,6,async t=>{
    const key=league+'|'+t.id;state.teams[key]||={};let okay=true;
    try{const rows=rosterRows(await safe(`https://site.api.espn.com/apis/site/v2/sports/${sport(league)}/teams/${t.id}/roster`),league,now),ids=new Set(rows.map(r=>r.id));rosters=[...rosters.filter(r=>r.league!==league||(String(r.currentTeamID)!==String(t.id)&&!ids.has(r.id))),...rows];state.teams[key].rosterAt=at;}catch{okay=false;errors.push(`${league} ${t.abbreviation} roster unavailable; previous roster retained.`);}
    try{const year=seasonYear(league,at.slice(0,10))+(league==='NBA'?1:0),p=await safe(`https://site.api.espn.com/apis/site/v2/sports/${sport(league)}/teams/${t.id}/schedule?season=${year}&seasontype=2`),rows=scheduleRows(p,league,t,now);
     schedules=[...schedules.filter(g=>g.league!==league||g.teamID!==String(t.id)),...rows.games];state.teams[key].scheduleAt=at;
     for(const r of rows.completed){const k=league+'|'+r.gameID;state.events[k]={...state.events[k],league,gameID:r.gameID,date:r.date};if(Number.isFinite(r.points)&&Number.isFinite(r.allowed)){const prior=teamGames.find(g=>(g.league===league||!g.league&&league==='NBA')&&g.gameID===r.gameID&&String(g.teamID)===r.teamID);teamGames=teamGames.filter(g=>!((g.league===league||!g.league&&league==='NBA')&&g.gameID===r.gameID&&String(g.teamID)===r.teamID));teamGames.push({...prior,...r});}}
    }catch{okay=false;errors.push(`${league} ${t.abbreviation} schedule unavailable; previous schedule retained.`);}return okay;
   });if(result.every(r=>r.ok&&r.value))state[league+'TeamsAt']=at;
  }catch{errors.push(league+' team discovery unavailable; earlier data retained.');}
 }
 // Most recent events first, then resumable season backfill. Recheck recent finals for source corrections.
 const queue=Object.entries(state.events).filter(([,e])=>!e.done||((now-Date.parse(e.date))<3*86400000&&(!e.checkedAt||now-Date.parse(e.checkedAt)>6*3600000))).filter(([,e])=>!e.retryAt||Date.parse(e.retryAt)<=now.getTime()).sort((a,b)=>b[1].date.localeCompare(a[1].date)||a[0].localeCompare(b[0])).slice(0,maxEvents);
 const fantasyMap=new Map((data.fantasyLogs||[]).map(g=>[[g.league,g.gameID,g.athleteID||nameKey(g.player)].join('|'),g]));let incoming=[],processed=0;
 await mapLimit(queue,5,async([key,e])=>{try{
  const p=await safe(`https://site.api.espn.com/apis/site/v2/sports/${sport(e.league)}/summary?event=${e.gameID}`),c=p.header?.competitions?.[0];if(c?.status?.type?.completed!==true||eventSeason({},p)!=='regular'||String(p.header?.id||c.id)!==e.gameID)throw Error('Final event identity/phase not verified');
  const source=`https://www.espn.com/${e.league.toLowerCase()}/boxscore/_/gameId/${e.gameID}`,date=c.date.slice(0,10),full=completeFantasyBoxscores(p,e.league,now),players=extractPlayerBoxscores(p,e.league,date,source);
  if(!players.length)throw Error('Player box score unavailable');
  for(const r of full)fantasyMap.set([r.league,r.gameID,r.athleteID].join('|'),r);
  const verified=new Map(full.map(r=>[r.athleteID,r]));
  for(const player of players){const team=c.competitors?.find(x=>x.team?.abbreviation===player.team)?.team,opponent=c.competitors?.find(x=>x.team?.abbreviation!==player.team)?.team,profile=rosters.find(r=>r.league===e.league&&r.id===player.athleteId);const extra=verified.get(player.athleteId);
   const stats=derivedStats(e.league,{...player.stats});if(extra&&e.league==='NFL'){for(const [k,v] of Object.entries(extra.stats)){const stat={passingtd:'passing touchdowns',rushingtd:'rushing touchdowns',receivingtd:'receiving touchdowns'}[k]||k;stats[stat]=v;}}
   for(const [stat,value] of Object.entries(stats)){if(stat==='minutes')continue;incoming.push({league:e.league,subject:player.player,athleteID:player.athleteId,stat:normalizeStat(stat),periodID:'game',profile,source:'ESPN completed regular-season box score',url:source,games:[{gameID:e.gameID,athleteID:player.athleteId,start:c.date,date,value,minutes:player.stats.minutes??null,teamID:String(team?.id||''),team:player.team,opponent:player.opponent,opponentID:String(opponent?.id||''),opportunity:player.stats['receiving targets']??player.stats['rushing attempts']??player.stats['passing attempts']??null,usagePct:player.usagePct??null,pace:player.pace??null,opponentDefenseRating:player.opponentDefenseRating??null,seasonType:'regular',seasonYear:seasonYear(e.league,date),source,observedAt:at}]});}
  }
  if(e.league==='NBA'){const detail=summaryTeams(p);for(const r of detail){teamGames=teamGames.filter(g=>g.league!==r.league||g.gameID!==r.gameID||String(g.teamID)!==String(r.teamID));teamGames.push(r);}}
  state.events[key]={...e,done:true,checkedAt:at,fantasyRows:full.length};processed++;
 }catch{state.events[key]={...e,retryAt:new Date(now.getTime()+3600000).toISOString()};errors.push(`${e.league} event ${e.gameID} box score unavailable; queued for retry.`);}});
 updates['evidence.auto.json']=mergeEvidence(data.autoRecords||[],incoming);updates['fantasy-game-logs.json']=[...fantasyMap.values()];updates['roster-cache.json']=rosters;updates['team-history.json']={games:teamGames,lastAttempt:at};updates['context.auto.json']={...data.context,rosters:undefined,teamGames:undefined,injuries,lastAttempt:at};
 updates['future-schedule.json']={games:schedules,fetchedAt:at,teamCoverage:state.teams,method:'Team schedules; a missing team refresh is disclosed and is not a complete season certificate.'};state.lastAttempt=at;state.pending=Object.values(state.events).filter(e=>!e.done).length;state.errors=errors.slice(-20);state.processed=processed;
 updates['refresh-state.json']=state;updates['stat-sync-status.json']={running:false,lastAttempt:at,importedGames:processed,pendingEvents:state.pending,errors:state.errors,status:errors.length?'partial':'ok',historyComplete:state.pending===0&&!errors.length,message:`${processed} final box scores refreshed; ${state.pending} known games pending. Existing evidence retained.`};
 return {updates,state,processed,errors};
}
