import {teamCode} from './rosters.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export function matchupEvidence(q,game,profile,context,year,now){
 const own=teamCode(profile?.team,q.league),opponent=[game?.home,game?.away].map(t=>teamCode(t,q.league)).find(t=>t&&t!==own);
 if(!own||![game?.home,game?.away].some(t=>teamCode(t,q.league)===own)||!opponent)return null;
 const unique=new Map();for(const r of [...(context.matchups?.games||[]),...(context.teamGames||[])])if((r.league===q.league||!r.league&&q.league==='NBA')&&teamCode(r.team,q.league)===opponent&&r.seasonYear===year&&r.date<String(q.asOf).slice(0,10)&&/^https:\/\//.test(r.source||''))unique.set(String(r.gameID),r);
 const rows=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5),defense=rows.filter(r=>finite(r.pointsAllowed)&&finite(r.possessions)&&r.possessions>0),points=rows.map(r=>finite(r.pointsAllowed)?r.pointsAllowed:finite(r.allowed)?r.allowed:null).filter(finite),pace=rows.map(r=>r.pace).filter(finite);
 if(!rows.length)return null;
 return {opponent,games:rows.length,lastDate:rows[0].date,pointsAllowed:points.length?points.reduce((s,v)=>s+v,0)/points.length:null,defenseGames:defense.length,defensiveRating:defense.length?100*defense.reduce((s,r)=>s+r.pointsAllowed,0)/defense.reduce((s,r)=>s+r.possessions,0):null,pace:pace.length?pace.reduce((s,v)=>s+v,0)/pace.length:null,paceGames:pace.length,sources:rows.map(r=>r.source),usedInProbability:false};
}
