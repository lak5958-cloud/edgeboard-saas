import {extractPlayerBoxscores} from './stats-parser.mjs';import {eventSeason,seasonYear} from './seasons.mjs';import {teamCode} from './rosters.mjs';import {normalizeStat,sameName} from './insights.mjs';
const num=x=>x!==null&&x!==''&&x!==undefined&&Number.isFinite(Number(x));const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function summaryTeams(p){
 if(p.header?.competitions?.[0]?.status?.type?.completed!==true||eventSeason({},p)!=='regular')return [];
 const c=p.header.competitions[0],date=String(c.date||'').slice(0,10),id=String(p.header.id||c.id||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!id)return [];
 const url=`https://www.espn.com/nba/boxscore/_/gameId/${id}`,players=extractPlayerBoxscores(p,'NBA',date,url),teams=[];
 for(const competitor of c.competitors||[]){const code=competitor.team?.abbreviation,pp=players.filter(x=>x.team===code),needed=['minutes','points','field goals attempted','free throws attempted','turnovers','offensive rebounds'];
  if(pp.length<5||!pp.every(x=>needed.every(k=>num(x.stats[k]))))return [];
  const total=k=>pp.reduce((s,x)=>s+Number(x.stats[k]),0),points=total('points');
  if(!num(competitor.score)||points!==Number(competitor.score))return [];
  const fga=total('field goals attempted'),fta=total('free throws attempted'),turnovers=total('turnovers'),orb=total('offensive rebounds'),minutes=total('minutes');
  if(!(minutes>0))return [];
  const stats={};for(const key of ['points','rebounds','assists','3-pointers made','steals','blocks'])if(pp.every(x=>num(x.stats[key])))stats[normalizeStat(key)]=total(key);
  teams.push({league:'NBA',seasonType:'regular',gameID:id,date,seasonYear:seasonYear('NBA',date),teamID:String(competitor.team.id),team:code,points,minutes,fga,fta,turnovers,orb,stats,source:url});
 }
 if(teams.length!==2)return [];const possessions=avg(teams.map(t=>t.fga+.44*t.fta-t.orb+t.turnovers));if(!(possessions>0))return [];
 return teams.map((t,i)=>({...t,opponentID:teams[1-i].teamID,allowed:teams[1-i].stats,pointsAllowed:teams[1-i].points,possessions,pace:t.minutes>0?possessions*240/t.minutes:null,defensiveRating:teams[1-i].points/possessions*100}));
}
export function observedContext(q,sample,records,context,game,now=new Date()){
 const why=[],risks=[],sources=[];if(q.league!=='NBA'||!sample)return {why,risks,sources};
 const profile=(context.rosters||[]).find(p=>sameName(p.subject,q.player)&&p.league==='NBA')||sample.profile;
 const teamID=profile?.currentTeamID,year=sample.currentYear,current=sample.rows.filter(g=>g.seasonYear===year&&teamID&&g.teamID===teamID).slice(0,5),mins=current.filter(g=>num(g.minutes)&&g.minutes>0);
 if(mins.length){why.push(`Minutes scenario: ${avg(mins.map(g=>Number(g.minutes))).toFixed(1)} minutes, based on ${mins.length} recent current-team appearances (observed range ${Math.min(...mins.map(g=>g.minutes))}–${Math.max(...mins.map(g=>g.minutes))}). Statistical estimate only; not a confirmed rotation or minutes restriction.`);for(const g of mins)sources.push({label:`Minutes / box score ${g.date}`,url:g.source});}
 const age=(now-Date.parse(context.matchups?.fetchedAt))/3600000,rows=context.matchups?.games||[],fresh=Number.isFinite(age)&&age>=0&&age<=2;
 const usage=[];
 for(const g of current){const t=rows.find(t=>t.gameID===g.gameID&&t.teamID===teamID),get=stat=>{const v=records.filter(s=>s.league==='NBA'&&sameName(s.subject,q.player)&&normalizeStat(s.stat)===stat).flatMap(s=>s.games||[]).find(x=>String(x.gameID)===String(g.gameID));return num(v?.value)?Number(v.value):null;};
 const fga=get('fieldgoalsattempted'),fta=get('freethrowsattempted'),to=get('turnovers');
 if(t&&[fga,fta,to].every(num)&&g.minutes>0){const den=t.fga+.44*t.fta+t.turnovers;if(den>0)usage.push(100*(fga+.44*fta+to)*(t.minutes/5)/(g.minutes*den));}}
 if(usage.length){why.push(`Observed box-score usage estimate: ${avg(usage).toFixed(1)}% across ${usage.length} matching current-season player/team games. This is measured historical opportunity, not a forecasted lineup adjustment.`);}
 const own=teamCode(profile?.team),opponentCode=[game?.home,game?.away].map(teamCode).find(x=>x&&x!==own),opponent=(context.rosters||[]).find(p=>teamCode(p.team)===opponentCode),opponentID=opponent?.currentTeamID;
 const recent=rows.filter(r=>r.teamID===opponentID&&r.seasonYear===year&&r.date<String(q.asOf||now.toISOString()).slice(0,10)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
 if(fresh&&recent.length){
  why.push(`Opponent ${opponentCode}: ${avg(recent.map(r=>r.pointsAllowed)).toFixed(1)} points allowed/game, ${avg(recent.map(r=>r.defensiveRating)).toFixed(1)} points allowed per 100 estimated possessions, estimated pace ${avg(recent.map(r=>r.pace).filter(num))?.toFixed(1)??'unavailable'} per 48 minutes, across ${recent.length} sourced current-season games. Refreshed ${context.matchups.fetchedAt}.`);
  const stat=normalizeStat(q.stat),allowed=recent.map(r=>r.allowed?.[stat]).filter(num);if(allowed.length)why.push(`Opponent ${opponentCode} allowed ${avg(allowed).toFixed(1)} team-total ${q.stat} per game across ${allowed.length} recorded games. This is team-level defense, not position-specific allowance.`);
  for(const r of recent)sources.push({label:`Opponent game ${r.date}`,url:r.source});
 }else risks.push('Current opponent defense/pace sample is unavailable, stale or cannot be tied to this matchup. No neutral value or adjustment coefficient was substituted.');
 risks.push('Minutes, usage and opponent summaries are context only. Their numerical effect on win probability has not been fitted and validated.');
 return {why,risks,sources};
}
