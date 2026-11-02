import {finite,mean} from './prediction.mjs';
const name=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'').replace(/(jr|sr|iii|ii)$/,'');
export function injuryRows(payload,league,fetchedAt){
 const out=[];for(const team of payload?.injuries||[]){for(const item of team.injuries||[]){
 const player=item.athlete?.displayName||item.athlete?.fullName;
 if(!player||!item.status)continue;
 out.push({league,athleteID:item.athlete?.id?String(item.athlete.id):null,teamID:team.team?.id?String(team.team.id):item.athlete?.team?.id?String(item.athlete.team.id):null,subject:player,team:team.displayName||team.team?.displayName||'',status:item.status,detail:item.longComment||item.shortComment||'',reportedAt:item.date||null,fetchedAt,source:'ESPN injury listing (unofficial API; not team clearance)',url:`https://www.espn.com/${league.toLowerCase()}/injuries`});
 }}return out;
}
export function contextReadback(q,context={},now=new Date(),game=null){
 const why=[],risks=[],sources=[];let availability=null;
 const current=(context.injuries||[]).filter(i=>i.league===q.league&&name(i.subject)===name(q.player));
 const injury=current.sort((a,b)=>String(b.fetchedAt).localeCompare(String(a.fetchedAt)))[0];
 if(injury){const age=(now-Date.parse(injury.fetchedAt))/3600000;const fresh=Number.isFinite(age)&&age>=0&&age<=2;
 why.push(`Injury listing: ${injury.status}; fetched ${injury.fetchedAt}; reported ${injury.reportedAt||'date unavailable'}. ${injury.detail||''}`);
 const reportAge=(now-Date.parse(injury.reportedAt))/3600000;availability={status:injury.status,reportedAt:injury.reportedAt,fetchedAt:injury.fetchedAt,blocked:fresh&&/^(out|doubtful|suspended|injured reserve|ir|inactive|pup)(?:$|[ /-])/i.test(injury.status)};
 sources.push({label:injury.source,url:injury.url});risks.push(fresh?'Injury listing is not official confirmation of availability or minutes.':'Injury listing is stale or undated; refresh and confirm official status.');
 }else risks.push('No matched injury report. Absence from an injury listing does not verify health or availability.');
 // Only exact-event, timestamped measurements are displayed. Never multiply a stat
 // by an arbitrary pace/defense/usage coefficient or convert notes into numeric inputs.
 for(const key of (q.league==='NBA'?['projectedMinutes','usagePct','pace','opponentDefense']:['projectedSnaps','projectedTargets','opponentDefense','weather'])){
 const f=(context.factors||[]).find(f=>f.league===q.league&&f.subject===q.player&&f.eventID===q.eventID&&f.key===key&&finite(f.value)&&f.unit&&/^https:\/\//.test(f.url||'')&&Number.isFinite(Date.parse(f.asOf))&&Date.parse(f.asOf)<=now.getTime()&&now-Date.parse(f.asOf)<=2*3600000&&(!game?.start||Date.parse(f.asOf)<Date.parse(game.start)));
 if(f){why.push(`${key}: ${Number(f.value)} ${f.unit} (${f.asOf}; ${f.method||'source-reported'}). Context only; no fitted coefficient is available.`);sources.push({label:`${key} source`,url:f.url});}
 else risks.push(`${({projectedMinutes:'Confirmed minutes projection',usagePct:'Projected usage',pace:'Pregame pace projection',opponentDefense:'Fitted opponent-defense input'})[key]||key}: no current exact-event sourced input; omitted from forecast.`);
 }
 return {why,risks,sources,availability};
}
export function teamContext(payload,league,date,url){
 if(league!=='NBA')return [];
 const teams=payload?.boxscore?.teams||[];
 const get=(t,n)=>{const s=t.statistics?.find(s=>s.name===n);return finite(s?.displayValue)?Number(s.displayValue):finite(s?.value)?Number(s.value):null;};
 const pairs=t=>{
 const shot=n=>{const s=t.statistics?.find(s=>s.name===n),m=/^(\d+)-(\d+)$/.exec(s?.displayValue||'');return m?Number(m[2]):null;};
 const fga=shot('fieldGoalsMade-fieldGoalsAttempted'),fta=shot('freeThrowsMade-freeThrowsAttempted'),orb=get(t,'offensiveRebounds'),tov=get(t,'turnovers');
 return [fga,fta,orb,tov].every(finite)?fga+.44*fta-orb+tov:null;};
 const poss=teams.map(pairs),p=poss.length===2&&poss.every(finite)?mean(poss):null;
 return teams.map((t,i)=>({league,date,team:t.team?.abbreviation,opponent:teams[1-i]?.team?.abbreviation,estimatedPossessions:p,source:url}));
}
