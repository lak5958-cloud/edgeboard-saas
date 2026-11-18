import {extractPlayerBoxscores} from './stats-parser.mjs';import {eventSeason,seasonYear} from './seasons.mjs';import {teamCode} from './rosters.mjs';import {normalizeStat,sameName} from './insights.mjs';
const num=x=>x!==null&&x!==''&&x!==undefined&&Number.isFinite(Number(x));const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const statName=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const boxscoreNumber=v=>{const s=String(v??'').trim(),m=/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?$/.exec(s);return m?Number(m[1]):null;};
const boxscorePair=v=>{const m=/^(\d+)-(\d+)$/.exec(String(v??'').trim());return m?[Number(m[1]),Number(m[2])]:null;};
function verifiedTeamStats(entry){
 const result={};const values=Array.isArray(entry?.statistics)?entry.statistics:[];
 const keys={totalrebounds:'rebounds',rebounds:'rebounds',assists:'assists',steals:'steals',blocks:'blocks',turnovers:'turnovers',offensiverebounds:'offensiverebounds',defensiverebounds:'defensiverebounds'};
 for(const field of values){
  const name=statName(field.name||field.label),n=boxscoreNumber(field.displayValue??field.value);
  const shooting=({threepointfieldgoalsmadethreepointfieldgoalsattempted:'3pointers',fieldgoalsmadefieldgoalsattempted:'fieldgoals',freethrowsmadefreethrowsattempted:'freethrows'})[name];
  if(shooting){
   const pair=boxscorePair(field.displayValue);
   if(pair&&pair[0]<=pair[1]){result[shooting+'made']=pair[0];result[shooting+'attempted']=pair[1];}
  }else if(keys[name]&&n!==null&&Number.isInteger(n)&&n>=0)result[keys[name]]=n;
 }
 return result;
}
export function summaryTeams(p){
 if(p.header?.competitions?.[0]?.status?.type?.completed!==true||eventSeason({},p)!=='regular')return [];
 const c=p.header.competitions[0],date=String(c.date||'').slice(0,10),id=String(p.header.id||c.id||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!id||c.competitors?.length!==2)return [];
 const url='https://www.espn.com/nba/boxscore/_/gameId/'+id;
 const players=extractPlayerBoxscores(p,'NBA',date,url),official=p.boxscore?.teams||[],teams=[];
 for(const competitor of c.competitors){
  const code=competitor.team?.abbreviation,score=Number(competitor.score?.value??competitor.score);
  if(!code||!Number.isInteger(score)||score<0)return [];
  const entry=official.find(t=>t.team?.abbreviation===code),pp=players.filter(x=>x.team===code);
  const stats=verifiedTeamStats(entry);
  // Prefer official team totals, even when one reserve's player row is incomplete.
  // If they are absent, only sum a column when ALL included players have it.
  const sum=k=>pp.length>=5&&pp.every(x=>num(x.stats[k]))?pp.reduce((s,x)=>s+Number(x.stats[k]),0):null;
  const points=sum('points');
  if(points!==null&&points!==score)return [];
  const columns={points:score,rebounds:stats.rebounds??sum('rebounds'),assists:stats.assists??sum('assists'),
   '3pointersmade':stats['3pointersmade']??sum('3-pointers made'),
   '3pointersattempted':stats['3pointersattempted']??sum('3-pointers attempted'),
   steals:stats.steals??sum('steals'),blocks:stats.blocks??sum('blocks'),
   turnovers:stats.turnovers??sum('turnovers')};
  const clean=Object.fromEntries(Object.entries(columns).filter(([,v])=>num(v)&&v>=0));
  // Prevent impossible makes / attempts and wrong-team totals from contaminating defense.
  if(num(clean['3pointersmade'])&&clean['3pointersmade']*3>score)return [];
  if(num(clean['3pointersmade'])&&num(clean['3pointersattempted'])&&clean['3pointersmade']>clean['3pointersattempted'])return [];
  const fga=stats.fieldgoalsattempted??sum('field goals attempted');
  const fta=stats.freethrowsattempted??sum('free throws attempted');
  const turnovers=stats.turnovers??sum('turnovers');
  const orb=stats.offensiverebounds??sum('offensive rebounds');
  const minutes=sum('minutes');
  teams.push({league:'NBA',home:competitor.homeAway==='home',seasonType:'regular',gameID:id,date,
   seasonYear:seasonYear('NBA',date),teamID:String(competitor.team.id),team:code,points:score,
   minutes,fga,fta,turnovers,orb,stats:clean,source:url});
 }
 const poss=teams.every(t=>[t.fga,t.fta,t.orb,t.turnovers].every(num))?
  avg(teams.map(t=>t.fga+.44*t.fta-t.orb+t.turnovers)):null;
 return teams.map((t,i)=>({...t,opponentID:teams[1-i].teamID,opponent:teams[1-i].team,
  allowed:teams[1-i].stats,pointsAllowed:teams[1-i].points,
  possessions:poss&&poss>0?poss:null,
  pace:poss>0&&t.minutes>0?poss*240/t.minutes:null,
  defensiveRating:poss>0?teams[1-i].points/poss*100:null}));
}
export function observedContext(q,sample,records,context,game,now=new Date()){
 const why=[],risks=[],sources=[];if(q.league!=='NBA'||!sample)return {why,risks,sources};
 const profile=sample.profile||(context.rosters||[]).find(p=>sameName(p.subject,q.player)&&p.league==='NBA');
 const teamID=profile?.currentTeamID,year=sample.currentYear,current=sample.rows.filter(g=>g.seasonYear===year&&teamID&&g.teamID===teamID).slice(0,5),mins=current.filter(g=>num(g.minutes)&&g.minutes>0);
 if(mins.length){why.push(`Minutes scenario: ${avg(mins.map(g=>Number(g.minutes))).toFixed(1)} minutes, based on ${mins.length} recent current-team appearances (observed range ${Math.min(...mins.map(g=>g.minutes))}–${Math.max(...mins.map(g=>g.minutes))}). Statistical estimate only; not a confirmed rotation or minutes restriction.`);for(const g of mins)sources.push({label:`Minutes / box score ${g.date}`,url:g.source});}
 const age=(now-Date.parse(context.matchups?.fetchedAt||context.lastAttempt))/3600000,rows=context.matchups?.games||context.matchupGames||context.teamGames||[],fresh=Number.isFinite(age)&&age>=0&&age<=2;
 const usage=[];
 for(const g of current){const t=rows.find(t=>t.gameID===g.gameID&&t.teamID===teamID),get=stat=>{const v=records.filter(s=>s.league==='NBA'&&sameName(s.subject,q.player)&&normalizeStat(s.stat)===stat).flatMap(s=>s.games||[]).find(x=>String(x.gameID)===String(g.gameID));return num(v?.value)?Number(v.value):null;};
 const fga=get('fieldgoalsattempted'),fta=get('freethrowsattempted'),to=get('turnovers');
 if(t&&[fga,fta,to].every(num)&&g.minutes>0){const den=t.fga+.44*t.fta+t.turnovers;if(den>0)usage.push(100*(fga+.44*fta+to)*(t.minutes/5)/(g.minutes*den));}}
 if(usage.length){why.push(`Observed box-score usage estimate: ${avg(usage).toFixed(1)}% across ${usage.length} matching current-season player/team games. This is measured historical opportunity, not a forecasted lineup adjustment.`);}
 const own=teamCode(profile?.team),opponentCode=[game?.home,game?.away].map(teamCode).find(x=>x&&x!==own),opponent=(context.rosters||[]).find(p=>teamCode(p.team)===opponentCode),opponentID=opponent?.currentTeamID;
 const recent=rows.filter(r=>r.teamID===opponentID&&r.seasonYear===year&&r.date<String(q.asOf||now.toISOString()).slice(0,10)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
 if(fresh&&recent.length){
  why.push(`Opponent ${opponentCode}: ${avg(recent.map(r=>r.pointsAllowed)).toFixed(1)} points allowed/game, ${(avg(recent.map(r=>r.defensiveRating).filter(num))?.toFixed(1)??'unavailable')} points allowed per 100 estimated possessions, estimated pace ${avg(recent.map(r=>r.pace).filter(num))?.toFixed(1)??'unavailable'} per 48 minutes, across ${recent.length} sourced current-season games. Archive checked ${context.matchups?.fetchedAt||context.lastAttempt}.`);
  const stat=normalizeStat(q.stat),allowed=recent.map(r=>r.allowed?.[stat]).filter(num);if(allowed.length)why.push(`Opponent ${opponentCode} allowed ${avg(allowed).toFixed(1)} team-total ${q.stat} per game across ${allowed.length} recorded games. This is team-level defense, not position-specific allowance.`);
  for(const r of recent)sources.push({label:`Opponent game ${r.date}`,url:r.source});
 }else risks.push('Current opponent defense/pace sample is unavailable, stale or cannot be tied to this matchup. No neutral value or adjustment coefficient was substituted.');
 risks.push('Minutes, usage and opponent summaries are context only. Their numerical effect on win probability has not been fitted and validated.');
 return {why,risks,sources};
}
