import {teamCode} from './rosters.mjs';import {quotePeriod} from './markets.mjs';import {seasonYear} from './seasons.mjs';import {distribution,backtest,payout} from './prediction.mjs';
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function teamSelection(q,game){
 if(q.kind==='Moneyline'&&(q.betTypeID==='ml3way'||String(q.oddID||'').includes('-ml3way-')))return null;
 if(!['points','score'].includes(String(q.stat||'').toLowerCase()))return null;
 if(quotePeriod(q)!=='game'||!['Spread','Moneyline','Total','Team Total'].includes(q.kind))return null;
 const entity=q.kind==='Team Total'?String(q.statEntityID||String(q.oddID||'').split('-').at(-4)||'').toLowerCase():q.side;
 const selected=entity==='home'?game?.home:entity==='away'?game?.away:null;
 if(q.kind==='Moneyline'&&!['home','away'].includes(q.side))return null;
 if(q.kind==='Spread'&&!selected)return null;if(q.kind==='Team Total'&&!selected)return null;
 if(q.kind!=='Moneyline'&&!num(q.line))return null;
 return {team:selected?teamCode(selected,q.league):null,threshold:q.kind==='Spread'?-Number(q.line):q.kind==='Moneyline'?0:Number(q.line),side:['Spread','Moneyline'].includes(q.kind)?'over':q.side,unit:['Spread','Moneyline'].includes(q.kind)?'selected-team scoring margin':q.kind==='Total'?'combined game points':'selected-team points'};
}
export function teamSample(q,game,games=[]){
 const selection=teamSelection(q,game);if(!selection||!['over','under'].includes(selection.side))return null;
 const cutoff=String(q.asOf||new Date().toISOString()).slice(0,10),year=seasonYear(q.league,cutoff),codes=[teamCode(game?.home,q.league),teamCode(game?.away,q.league)],seen=new Map();
 for(const r of games){if(r.league!==q.league||r.seasonType!=='regular'||!r.gameID||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date>=cutoff||![year,year-1].includes(r.seasonYear)||!/^https:\/\//.test(r.source||'')||!num(r.points)||!num(r.allowed))continue;
  if(selection.team?r.team!==selection.team:!codes.includes(r.team))continue;
  const value=['Spread','Moneyline'].includes(q.kind)?r.points-r.allowed:q.kind==='Total'?r.points+r.allowed:r.points;
  const key=String(r.gameID),old=seen.get(key);if(old&&old.value!==value){seen.set(key,{conflict:true});continue;}if(old?.conflict)continue;
  seen.set(key,{...r,value,settlement:value===selection.threshold?0:(selection.side==='over'?value>selection.threshold:value<selection.threshold)?1:-1});
 }
 const rows=[...seen.values()].filter(r=>!r.conflict).sort((a,b)=>b.date.localeCompare(a.date)||b.gameID.localeCompare(a.gameID)).slice(0,80);if(!rows.length)return null;
 const values=rows.map(r=>r.value),m=mean(values),summary=rr=>({n:rr.length,hits:rr.filter(r=>r.settlement===1).length,pushes:rr.filter(r=>r.settlement===0).length,mean:mean(rr.map(r=>r.value))}),all=summary(rows),current=summary(rows.filter(r=>r.seasonYear===year)),previous=summary(rows.filter(r=>r.seasonYear!==year));
 return {researchType:'team',selection,profile:null,n:rows.length,hits:all.hits,pushes:all.pushes,rows,values,mean:m,sd:rows.length>1?Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/(rows.length-1)):null,min:Math.min(...values),max:Math.max(...values),recentMean:mean(values.slice(0,5)),minutesAvg:null,currentYear:year,current,previous,crossSeason:rows.slice(0,10).some(r=>r.seasonYear!==year),last5:summary(rows.slice(0,5)),last10:summary(rows.slice(0,10)),all,evidence:{url:rows[0].source,source:'ESPN completed regular-season team schedule scores'}};
}
export function analyzeTeamSelection(q,{game,context={},now=new Date(),baseline=null},{quoteStatus,exactDecision,implied}){
 const state=quoteStatus(q,game,now),sample=teamSample(q,game,context.teamGames||[]),bp=implied(q.odds),why=[],risks=[],observations=[];let model={status:'unavailable',reason:'Sourced full-game team histories are unavailable. Run team-history collection; player totals cannot replace team scores.'};
 if(sample){const s=sample;why.push(`${s.hits}/${s.n} prior sourced regular-season outcomes satisfy this exact ${q.kind.toLowerCase()} selection; ${s.pushes} ties/pushes at the threshold. Current season ${s.current.hits}/${s.current.n}; prior ${s.previous.hits}/${s.previous.n}.`);why.push(`${s.selection.unit}: mean ${s.mean.toFixed(1)}, SD ${s.sd?.toFixed(1)??'unavailable'}, last-five mean ${s.recentMean.toFixed(1)}. Last 5 ${s.last5.hits}/${s.last5.n}, last 10 ${s.last10.hits}/${s.last10.n}.`);
  const rr=[...s.rows].reverse(),values=rr.slice(-40).map(r=>r.value);
  if(values.length>=20&&s.current.n>=3){const d=distribution(values,s.selection.threshold,s.selection.side),bt=backtest(rr,{line:s.selection.threshold,side:s.selection.side,odds:q.odds});model={...d,name:'Unadjusted team-history empirical baseline v1',status:'experimental',researchType:'team',validated:false,expectedValue:d.pWin*payout(q.odds)-d.pLoss,backtest:bt,availableForLean:false,caveats:['Historical team outcomes are not adjusted to the strength, lineup or availability of the specific upcoming opponent.','NFL moneyline ties and void rules require bookmaker confirmation.']};why.push(`Unadjusted empirical baseline: ${(d.pWin*100).toFixed(1)}% wins, ${(d.pPush*100).toFixed(1)}% ties/pushes across ${d.n} training games. This is not a calibrated matchup forecast.`);}
  else model={status:'unavailable',reason:`Team baseline requires 20 earlier sourced games and 3 current-season games; have ${values.length} and ${s.current.n}. Descriptive team statistics remain available.`};
  for(const team of [game?.home,game?.away]){const code=teamCode(team,q.league),a=(context.teamGames||[]).filter(r=>r.league===q.league&&r.team===code&&r.seasonType==='regular'&&r.date<String(q.asOf).slice(0,10)&&r.seasonYear===s.currentYear&&num(r.points)&&num(r.allowed)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);if(a.length)why.push(`${team}: last ${a.length} current-season games scored ${mean(a.map(r=>r.points)).toFixed(1)} and allowed ${mean(a.map(r=>r.allowed)).toFixed(1)} points per game. Descriptive opponent context; no fitted adjustment applied.`);}
  observations.push(`Latest sourced result: ${s.rows[0].date}; metric is ${s.selection.unit}, not a player statistic.`);
 }
 if(bp!==null)why.push(`Exact quoted price ${q.odds>0?'+':''}${q.odds} requires ${(bp*100).toFixed(1)}% non-push wins to break even.`);
 risks.push('Team histories span changing rosters, injuries, coaching and opponents. No fitted matchup adjustment or validated game-market edge is claimed.');if(q.league==='NFL')risks.push('Quarterback/lineup changes, weather, pace and bookmaker tie/void rules are not verified by final team scores.');
 if(quotePeriod(q)!=='game')risks.push('Full-game team scores cannot verify a quarter, half or regulation-only market.');
 if(!state.ok)risks.unshift(state.reason);if(!sample)risks.push('No eligible team sample for this exact market/entity; unknown team-total identities are not guessed.');
 const decision=exactDecision({state,quote:q,model,breakEven:bp}),sources=(sample?.rows.slice(0,5)||[]).map(r=>({label:`${r.team} vs ${r.opponent} ${r.date}`,url:r.source}));
 return {state,sample,model,context:{availability:null,sources},why,risks,observations,verdict:decision.summary,decision,breakEven:bp,evidenceScore:Math.min(6,(state.ok?1:0)+(sample?4:0)),sourceNotes:[],relatedExperts:[],direction:baseline&&Number(baseline.line)!==Number(q.line)?'Different offered game threshold':'Standard game threshold'};
}
