import {matchupForecast} from './matchup-model.mjs';
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
 for(const raw of games){const r={...raw,allowed:num(raw.allowed)?raw.allowed:raw.pointsAllowed};if(r.league!==q.league||r.seasonType!=='regular'||!r.gameID||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date>=cutoff||![year,year-1].includes(r.seasonYear)||!/^https:\/\//.test(r.source||'')||!num(r.points)||!num(r.allowed))continue;
  if(selection.team?teamCode(r.team,q.league)!==selection.team:!codes.includes(teamCode(r.team,q.league)))continue;
  const value=['Spread','Moneyline'].includes(q.kind)?r.points-r.allowed:q.kind==='Total'?r.points+r.allowed:r.points;
  const key=String(r.gameID),old=seen.get(key);if(old&&old.value!==value){seen.set(key,{conflict:true});continue;}if(old?.conflict)continue;
  seen.set(key,{...r,value,settlement:value===selection.threshold?0:(selection.side==='over'?value>selection.threshold:value<selection.threshold)?1:-1});
 }
 const rows=[...seen.values()].filter(r=>!r.conflict).sort((a,b)=>b.date.localeCompare(a.date)||b.gameID.localeCompare(a.gameID)).slice(0,80);if(!rows.length)return null;
 const values=rows.map(r=>r.value),m=mean(values),summary=rr=>({n:rr.length,hits:rr.filter(r=>r.settlement===1).length,pushes:rr.filter(r=>r.settlement===0).length,mean:mean(rr.map(r=>r.value))}),all=summary(rows),current=summary(rows.filter(r=>r.seasonYear===year)),previous=summary(rows.filter(r=>r.seasonYear!==year));
 return {researchType:'team',selection,profile:null,n:rows.length,hits:all.hits,pushes:all.pushes,rows,values,mean:m,sd:rows.length>1?Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/(rows.length-1)):null,min:Math.min(...values),max:Math.max(...values),recentMean:mean(values.slice(0,5)),minutesAvg:null,currentYear:year,current,previous,crossSeason:rows.slice(0,10).some(r=>r.seasonYear!==year),last5:summary(rows.slice(0,5)),last10:summary(rows.slice(0,10)),all,evidence:{url:rows[0].source,source:'ESPN completed regular-season team schedule scores'}};
}
export function analyzeTeamSelection(q,{game,context={},now=new Date(),baseline=null},{quoteStatus,exactDecision,implied}){
 const state=quoteStatus(q,game,now),sample=teamSample(q,game,context.teamGames||[]),bp=implied(q.odds),why=[],risks=[],observations=[];let model={status:'unavailable',reason:!teamSelection(q,game)?'This market identity or period is not supported by the full-game two-outcome model. No probability is invented.':'Sourced full-game team histories are unavailable. Run team-history collection; player totals cannot replace team scores.'};
 if(sample){const s=sample;why.push(`${s.hits}/${s.n} prior sourced regular-season outcomes satisfy this exact ${q.kind.toLowerCase()} selection; ${s.pushes} ties/pushes at the threshold. Current season ${s.current.hits}/${s.current.n}; prior ${s.previous.hits}/${s.previous.n}.`);why.push(`${s.selection.unit}: mean ${s.mean.toFixed(1)}, SD ${s.sd?.toFixed(1)??'unavailable'}, last-five mean ${s.recentMean.toFixed(1)}. Last 5 ${s.last5.hits}/${s.last5.n}, last 10 ${s.last10.hits}/${s.last10.n}.`);
  model=matchupForecast(q,game,context.matchupGames||context.teamGames||[],s.selection);
  if(model.status==='experimental'){
   model.expectedValue=model.pWin*payout(q.odds)-model.pLoss;
   why.unshift(`The opponent-adjusted score model estimates ${game.home} ${model.homeMean.toFixed(1)} points and ${game.away} ${model.awayMean.toFixed(1)} points. These are model means, not exact-score predictions.`);
   why.push(`Home advantage contributes ${model.homeAdvantage.toFixed(1)} points in this fit. ${game.home}’s attack contributes ${model.homeOffense.toFixed(1)} points relative to the league baseline, while ${game.away}’s defense contributes ${model.awayDefense.toFixed(1)} points to ${game.home}’s score. Positive defensive values mean more points conceded. These fitted effects can change as new games arrive.`);
   why.push(`Estimated chance this exact selection wins: ${(100*model.pWin).toFixed(1)}%; push/tie ${(100*model.pPush).toFixed(1)}%. ${model.n} earlier-only matchup errors form the experimental score distribution.`);
   why.push(`The fitted model includes each team’s scoring attack, opponent points allowed and home advantage. ${model.trainingGames} verified league games entered fitting, with current-season weight 1, prior-season 0.35 and older-season 0.15.`);
   risks.push(...model.caveats);
  }
  for(const team of [game?.home,game?.away]){const code=teamCode(team,q.league),a=(context.teamGames||[]).filter(r=>r.league===q.league&&r.team===code&&r.seasonType==='regular'&&r.date<String(q.asOf).slice(0,10)&&r.seasonYear===s.currentYear&&num(r.points)&&num(r.allowed)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);if(a.length)why.push(`${team}: last ${a.length} current-season games scored ${mean(a.map(r=>r.points)).toFixed(1)} and allowed ${mean(a.map(r=>r.allowed)).toFixed(1)} points per game. Descriptive opponent context; no fitted adjustment applied.`);}
  observations.push(`Latest sourced result: ${s.rows[0].date}; metric is ${s.selection.unit}, not a player statistic.`);
 }
 const profiles=context.rosters||[];for(const injury of (context.injuries||[]).filter(i=>i.league===q.league&&/out|doubt|question|injur|susp|reserve/i.test(i.status||'')).filter(i=>{const p=profiles.find(p=>String(p.id)===String(i.athleteID));return [game?.home,game?.away].map(t=>teamCode(t,q.league)).includes(teamCode(p?.team||i.team,q.league));}).slice(0,6))risks.push(`${injury.subject||injury.player||'Team player'} is listed ${injury.status}. Confirm the latest lineup; this news does not numerically adjust the score estimate.`);
 if(bp!==null)why.push(`Exact quoted price ${q.odds>0?'+':''}${q.odds} requires ${(bp*100).toFixed(1)}% non-push wins to break even.`);
 risks.push('Team histories span changing rosters, injuries, coaching and opponents. The fitted matchup forecast is experimental; game markets remain Pass pending independent validation.');if(q.league==='NFL')risks.push('Quarterback/lineup changes, weather, pace and bookmaker tie/void rules are not verified by final team scores.');
 if(quotePeriod(q)!=='game')risks.push('Full-game team scores cannot verify a quarter, half or regulation-only market.');
 if(!state.ok)risks.unshift(state.reason);if(!sample)risks.push('No eligible team sample for this exact market/entity; unknown team-total identities are not guessed.');
 const decision=exactDecision({state,quote:q,model,breakEven:bp}),sources=[...(sample?.rows.slice(0,5)||[]).map(r=>({label:`${r.team} vs ${r.opponent} ${r.date}`,url:r.source})),...(model.sources||[]).map(url=>({label:'Verified matchup training result',url}))];
 return {state,sample,model,context:{availability:null,sources},why,risks,observations,verdict:decision.summary,decision,breakEven:bp,evidenceScore:Math.min(6,(state.ok?1:0)+(sample?4:0)),sourceNotes:[],relatedExperts:[],direction:baseline&&Number(baseline.line)!==Number(q.line)?'Different offered game threshold':'Standard game threshold'};
}
