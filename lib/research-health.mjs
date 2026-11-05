import {seasonYear} from './seasons.mjs';
import {quoteStatus} from './insights.mjs';
import {quoteProfile,teamCode} from './rosters.mjs';
import {quotePeriod} from './markets.mjs';
const day=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const fresh=(at,now,hours)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now&&now-Date.parse(at)<=hours*3600000;
const source=url=>/^https:\/\//.test(url||'');
export function researchHealth(data,{league='NFL',book='draftkings',now=new Date()}={}){
 if(!['NBA','NFL'].includes(league)||!['draftkings','fanduel'].includes(book))throw Object.assign(Error('Choose NBA or NFL and an available sportsbook.'),{status:400});
 const today=day(now),tomorrow=new Date(Date.parse(today+'T12:00Z')+86400000).toISOString().slice(0,10),games=new Map();
 const add=g=>{
  if(g.league!==league||!Number.isFinite(Date.parse(g.start))||Date.parse(g.start)<=now||![today,tomorrow].includes(day(g.start)))return;
  const home=teamCode(g.home,league),away=teamCode(g.away,league);
  if(!home||!away)return;
  const key=[league,home,away,Date.parse(g.start)].join('|'),old=games.get(key);
  games.set(key,{...old,...g,home,away,game:away+' @ '+home});
 };
 for(const g of data.schedule?.games||[])if(typeof g.home==='boolean')add({...g,eventID:null,home:g.home?g.team:g.opponent,away:g.home?g.opponent:g.team});
 for(const g of data.live.games||[])add(g);
 const profiles=(data.rosters||[]).filter(p=>p.league===league&&(league==='NBA'||['QB','RB','FB','WR','TE'].includes(p.position)));
 const history=new Map(),year=seasonYear(league,now.toISOString().slice(0,10));
 for(const r of data.records||[]){
  const id=String(r.athleteID||r.profile?.id||'');
  if(r.league!==league||!id||(r.periodID||'game')!=='game')continue;
  if(!history.has(id))history.set(id,new Map());
  for(const g of r.games||[]){
   if(g.seasonType!=='regular'||g.seasonYear!==year||!g.gameID||!source(g.source)||!g.date||g.date>=now.toISOString().slice(0,10)||!Number.isFinite(g.value))continue;
   const rows=history.get(id),key=g.gameID,old=rows.get(key);
   rows.set(key,{...old,...g,minutes:typeof g.minutes==='number'&&Number.isFinite(g.minutes)?g.minutes:old?.minutes,opportunities:{...old?.opportunities,...Object.fromEntries(Object.entries(g.opportunities||{}).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>=0))}});
  }
 }
 const allQuotes=data.live.quotes||[],context=data.context||{},defense=[...(context.matchups?.games||[]),...(context.defenseGames||[])];
 const result=[...games.values()].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)).map(game=>{
  const quotes=allQuotes.filter(q=>q.league===league&&q.book===book&&q.eventID===game.eventID),current=quotes.filter(q=>quoteStatus(q,game,now).ok);
  const props=current.filter(q=>q.kind==='Player Prop'&&quotePeriod(q)==='game'),identities=new Set(props.map(q=>quoteProfile(q,game,profiles)?.id).filter(Boolean).map(String));
  const players=profiles.filter(p=>[game.home,game.away].includes(teamCode(p.team,league))).map(p=>{
   const games=[...(history.get(String(p.id))?.values()||[])].filter(g=>String(g.teamID)===String(p.currentTeamID)).sort((a,b)=>b.date.localeCompare(a.date)),recent=games.slice(0,5);
   const kind=league==='NBA'?'minutes':p.position==='QB'?'passingAttempts':p.position==='RB'||p.position==='FB'?'rushingAttempts':'targets';
   const measured=recent.filter(g=>{const v=kind==='minutes'?g.minutes:g.opportunities?.[kind];return typeof v==='number'&&Number.isFinite(v)&&v>=0;});
   const reports=(context.injuries||[]).filter(i=>i.league===league&&String(i.athleteID)===String(p.id)&&(!i.teamID||String(i.teamID)===String(p.currentTeamID))&&source(i.url)&&fresh(i.fetchedAt,now,2)).sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt));
   const injury=reports[0],opponent=game.home===teamCode(p.team,league)?game.away:game.home;
   const opponentRows=new Map(defense.filter(r=>r.league===league&&r.seasonYear===year&&r.date<now.toISOString().slice(0,10)&&teamCode(r.team,league)===opponent&&source(r.source)).map(r=>[r.gameID,r]));
   return {id:String(p.id),name:p.subject,team:p.team,position:p.position,rosterFresh:source(p.url)&&fresh(p.asOf,now,48),quoted:identities.has(String(p.id)),games:games.length,workload:{kind,measured:measured.length,recent:recent.length,values:measured.map(g=>({date:g.date,value:kind==='minutes'?g.minutes:g.opportunities[kind],url:g.source}))},injury:injury?{status:injury.status,url:injury.url,asOf:injury.fetchedAt}:null,defenseGames:opponentRows.size,
    passHistory:p.position==='QB'?games.slice(0,3).filter(g=>Number.isFinite(g.opportunities?.passingAttempts)&&g.opportunities.passingAttempts>0).map(g=>({gameID:g.gameID,date:g.date,attempts:g.opportunities.passingAttempts})):[]};
  });
  const quarterbacks=[];
  for(const team of [game.home,game.away]){
   const qs=players.filter(p=>p.position==='QB'&&teamCode(p.team,league)===team),byGame=new Map();
   for(const p of qs)for(const g of p.passHistory){const old=byGame.get(g.gameID);if(!old||g.attempts>old.attempts)byGame.set(g.gameID,{...g,name:p.name,id:p.id,tied:false});else if(g.attempts===old.attempts&&p.id!==old.id)old.tied=true;}
   const leaders=[...byGame.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
   quarterbacks.push({team,leaders,change:leaders.length>=2&&leaders.every(r=>!r.tied)&&leaders[0].id!==leaders[1].id});
  }
  return {game:game.game,eventID:game.eventID||null,start:game.start,scheduleSource:game.source||null,quotes:quotes.length,currentQuotes:current.length,props:props.length,gameLines:current.filter(q=>['Moneyline','Spread','Total','Team Total'].includes(q.kind)&&quotePeriod(q)==='game').length,players,quarterbacks:league==='NFL'?quarterbacks:[],weather:(context.pregameNFL||[]).find(r=>r.gameID===game.gameID&&fresh(r.asOf,now,2))||null};
 });
 const players=result.flatMap(r=>r.players);
 return {checkedAt:now.toISOString(),snapshotAt:data.live.generatedAt||null,league,book,rows:result,summary:{games:result.length,currentQuotes:result.reduce((s,r)=>s+r.currentQuotes,0),players:players.length,quoted:players.filter(p=>p.quoted).length,withHistory:players.filter(p=>p.games>=5).length,withWorkload:players.filter(p=>p.workload.measured>=3).length,withInjuryReport:players.filter(p=>p.injury).length},method:'Coverage of the saved upcoming schedule, quotes and sourced current-team history. A missing injury listing does not confirm health. Recent passing-attempt leaders do not confirm the next starting quarterback. Coverage is independent of model accuracy.'};
}
