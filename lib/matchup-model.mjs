// Experimental, predeclared score model. Neither odds nor future outcomes enter fitting.
import {teamCode} from './rosters.mjs';import {seasonYear} from './seasons.mjs';
const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,valid=x=>typeof x==='number'&&Number.isFinite(x),memo=new WeakMap();
export function verifiedFixtures(rows,league,cutoff){
 const year=seasonYear(league,cutoff),groups=new Map();
 for(const r of rows||[]){if(r.league!==league||r.seasonType!=='regular'||!r.gameID||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date>=cutoff||![year,year-1,year-2].includes(r.seasonYear)||!valid(r.points)||!valid(r.allowed)||!/^https:\/\//.test(r.source||'')||typeof r.home!=='boolean'&&!['home','away'].includes(r.venue))continue;const id=String(r.gameID);if(!groups.has(id))groups.set(id,[]);groups.get(id).push({...r,team:teamCode(r.team,league),opponent:teamCode(r.opponent,league)});}
 const fixtures=[];
 for(const [id,rr] of groups){const unique=new Map(),conflicts=new Set();for(const r of rr){const old=unique.get(r.team);if(old&&(old.points!==r.points||old.allowed!==r.allowed||old.home!==(typeof r.home==='boolean'?r.home:r.venue==='home')))conflicts.add(r.team);unique.set(r.team,{...r,home:typeof r.home==='boolean'?r.home:r.venue==='home'});}const a=[...unique.values()];if(a.length!==2||conflicts.size)continue;const h=a.find(r=>r.home),v=a.find(r=>!r.home);if(!h||!v||h.opponent!==v.team||v.opponent!==h.team||h.points!==v.allowed||v.points!==h.allowed||h.date!==v.date)continue;fixtures.push({id,date:h.date,seasonYear:h.seasonYear,home:h.team,away:v.team,h:h.points,a:v.points,sources:[h.source,v.source]});}
 return fixtures.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
function fit(games,year){
 const obs=games.flatMap(g=>[{team:g.home,opp:g.away,home:1,y:g.h,w:g.seasonYear===year?1:g.seasonYear===year-1?.35:.15},{team:g.away,opp:g.home,home:0,y:g.a,w:g.seasonYear===year?1:g.seasonYear===year-1?.35:.15}]),off={},def={},counts={},codes=[...new Set(obs.map(o=>o.team))],weight=obs.reduce((s,o)=>s+o.w,0);if(!weight)return null;let base=obs.reduce((s,o)=>s+o.w*o.y,0)/weight,home=0;for(const c of codes){off[c]=0;def[c]=0;counts[c]=obs.filter(o=>o.team===c).length;}
 // Coordinate descent with fixed ridge penalty (8 weighted games). This is not tuned on the displayed selections.
 const byTeam=new Map(codes.map(c=>[c,obs.filter(o=>o.team===c)])),byOpp=new Map(codes.map(c=>[c,obs.filter(o=>o.opp===c)]));
 for(let i=0;i<18;i++){
  base=obs.reduce((s,o)=>s+o.w*(o.y-home*o.home-off[o.team]-def[o.opp]),0)/weight;
  const homes=obs.filter(o=>o.home);home=homes.reduce((s,o)=>s+o.w*(o.y-base-off[o.team]-def[o.opp]),0)/(4+homes.reduce((s,o)=>s+o.w,0));
  for(const c of codes){let n=0,d=8;for(const o of byTeam.get(c)){n+=o.w*(o.y-base-home*o.home-def[o.opp]);d+=o.w;}off[c]=n/d;}
  for(const c of codes){let n=0,d=8;for(const o of byOpp.get(c)){n+=o.w*(o.y-base-home*o.home-off[o.team]);d+=o.w;}def[c]=n/d;}
 }
 return {base,home,off,def,counts,predict:(h,a)=>off[h]===undefined||off[a]===undefined?null:{h:Math.max(0,base+home+off[h]+def[a]),a:Math.max(0,base+off[a]+def[h])}};
}
export function matchupContext(rows,league,cutoff){
 let cache=memo.get(rows);if(!cache){cache=new Map();memo.set(rows,cache);}const key=league+'|'+cutoff;if(cache.has(key))return cache.get(key);
 const fixtures=verifiedFixtures(rows,league,cutoff),year=seasonYear(league,cutoff),fitted=fixtures.length>=40?fit(fixtures,year):null,errors=[],origins=[];
 // At most 80 recent test events. Every fit excludes the entire held-out date.
 for(const event of fixtures.slice(-80)){
  const prior=fixtures.filter(g=>g.date<event.date),foldYear=seasonYear(league,event.date);if(prior.length<40)continue;const trained=fit(prior,foldYear),prediction=trained?.predict(event.home,event.away);if(!prediction||trained.counts[event.home]<3||trained.counts[event.away]<3)continue;
  const earlier=errors.filter(e=>e.date<event.date);origins.push({event,prediction,errors:earlier,baseline:prior.slice(-80).map(g=>({h:g.h,a:g.a}))});errors.push({date:event.date,h:event.h-prediction.h,a:event.a-prediction.a});
 }
 const result={fixtures,year,fitted,errors,origins};cache.set(key,result);if(cache.size>8)cache.delete(cache.keys().next().value);return result;
}
function value(h,a,selection,q){return ['Spread','Moneyline'].includes(q.kind)?(q.side==='home'?h-a:a-h):q.kind==='Total'?h+a:selection.team===selection.home?h:a;}
function probabilities(prediction,errors,selection,q){const scores=errors.map(e=>({h:Math.max(0,Math.round(prediction.h+e.h)),a:Math.max(0,Math.round(prediction.a+e.a))})).filter(s=>q.league!=='NBA'||s.h!==s.a),values=scores.map(s=>value(s.h,s.a,selection,q)),wins=values.filter(v=>selection.side==='over'?v>selection.threshold:v<selection.threshold).length,pushes=values.filter(v=>v===selection.threshold).length,n=values.length;return n?{pWin:wins/n,pPush:pushes/n,pLoss:(n-wins-pushes)/n,homeMean:avg(scores.map(s=>s.h)),awayMean:avg(scores.map(s=>s.a))}:{pWin:null,pPush:null,pLoss:null};}
export function matchupForecast(q,game,rows,selection){
 const cutoff=String(q.asOf||new Date().toISOString()).slice(0,10),c=matchupContext(rows,q.league,cutoff),home=teamCode(game?.home,q.league),away=teamCode(game?.away,q.league),pred=c.fitted?.predict(home,away),current=t=>c.fixtures.filter(g=>g.seasonYear===c.year&&(g.home===t||g.away===t)).length;
 if(!pred||c.errors.length<12||Math.min(current(home),current(away))<3)return {status:'unavailable',reason:`Matchup model needs 40 verified league games, 12 earlier-only matchup errors and 3 current-season games for each team. Available: ${c.fixtures.length} games, ${c.errors.length} errors, ${current(home)}/${current(away)} current games. No probability is invented.`};
 const sel={...selection,home},p=probabilities(pred,c.errors,sel,q),folds=[];
 for(const f of c.origins){if(f.errors.length<12)continue;const pp=probabilities(f.prediction,f.errors,sel,q),v=value(f.event.h,f.event.a,sel,q),actual=v===sel.threshold?0:(sel.side==='over'?v>sel.threshold:v<sel.threshold)?1:-1,truth=actual===1?[1,0,0]:actual===0?[0,1,0]:[0,0,1],ps=[pp.pWin,pp.pPush,pp.pLoss],baseline=probabilities({h:0,a:0},f.baseline,sel,q),bs=[baseline.pWin,baseline.pPush,baseline.pLoss];folds.push({date:f.event.date,...pp,actual,baselineBrier:bs.reduce((s,x,i)=>s+(x-truth[i])**2,0)/3,brier:ps.reduce((s,x,i)=>s+(x-truth[i])**2,0)/3,logLoss:-Math.log(Math.max(1e-6,ps[truth.indexOf(1)]))});}
 return {...p,status:'experimental',name:'Opponent-adjusted ridge score model v1',researchType:'team',validated:false,availableForLean:false,n:c.errors.length,interval:null,homeMean:p.homeMean,awayMean:p.awayMean,fittedHome:pred.h,fittedAway:pred.a,mean:value(pred.h,pred.a,sel,q),homeCurrent:current(home),awayCurrent:current(away),trainingGames:c.fixtures.length,homeOffense:c.fitted.off[home],awayOffense:c.fitted.off[away],homeDefense:c.fitted.def[home],awayDefense:c.fitted.def[away],homeAdvantage:c.fitted.home,backtest:{n:folds.length,folds,baselineBrier:avg(folds.map(f=>f.baselineBrier)),brier:avg(folds.map(f=>f.brier)),logLoss:avg(folds.map(f=>f.logLoss)),bins:[],method:'League-wide rolling-origin matchup tests. Each score fit and residual pool use strictly earlier dates. Team-total tests retain selected home/away orientation.',thresholdMode:'Today’s threshold replayed across league matchups, not historical odds or team-specific ROI'},sources:[...new Set(c.fixtures.filter(g=>g.home===home||g.away===home||g.home===away||g.away===away).slice(-6).flatMap(g=>g.sources))],caveats:['Injuries, starting-quarterback changes, weather, rest and current lineups are not fitted inputs.','Old-season team coefficients shrink toward the league; changing rosters and coaching still create uncertainty.','Residual resampling is experimental, not an independently calibrated future confidence distribution.']};
}
