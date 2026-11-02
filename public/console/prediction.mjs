import {fitFootball,footballBacktest} from './football-model.mjs';
import {fitSeason,seasonBacktest} from './season-model.mjs';
// Experimental distribution forecast. No quote-supplied validation flags are trusted.
import {quotePeriod} from './markets.mjs';
export const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
export const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function wilson(h,n,z=1.96){if(!n)return null;const p=h/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,r=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-r),Math.min(1,c+r)];}
export function payout(odds){return finite(odds)&&Math.abs(Number(odds))>=100?(odds>0?Number(odds)/100:100/-Number(odds)):null;}
export function distribution(values,line,side){
 if(!values.length||!finite(line)||!['over','under'].includes(side))return null;
 const wins=values.filter(x=>side==='over'?x>Number(line):x<Number(line)).length;
 const pushes=values.filter(x=>x===Number(line)).length,losses=values.length-wins-pushes;
 return {trainingHits:wins,pWin:wins/values.length,pPush:pushes/values.length,pLoss:losses/values.length,n:values.length,interval:wilson(wins,values.length)};
}
export function settle(value,q){return value===Number(q.line)?0:((q.side==='over'?value>q.line:value<q.line)?1:-1);}
export function usableRows(rows,cutoff){
 const groups=new Map();
 for(const r of rows||[]){
  if(r.seasonType!=='regular'||!finite(r.value)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!(r.date<cutoff)||!/^https:\/\//.test(r.source||r.url||''))continue;
  const key=String(r.gameID||r.date),prior=groups.get(key);
  if(prior&&prior.value!==Number(r.value)){groups.set(key,{conflict:true});continue;}
  if(!prior?.conflict)groups.set(key,{...r,value:Number(r.value)});
 }
 // Distinct sourced event IDs can share a UTC date (late west-coast games).
 // Deduplicate/conflict-check by event identity, not the calendar date alone.
 return [...groups.values()].filter(r=>!r.conflict).sort((a,b)=>a.date.localeCompare(b.date)||(Date.parse(a.start||a.date)-Date.parse(b.start||b.date)));
}
function windowValues(train,mode){const a=train.slice(-40);if(mode==='minutes'){
 const withMin=a.filter(x=>finite(x.minutes)&&Number(x.minutes)>0);
 if(withMin.length<20)return null;
 const mins=mean(withMin.slice(-5).map(x=>Number(x.minutes)));
 return {values:withMin.map(x=>Math.max(0,Math.round(x.value/Number(x.minutes)*mins))),projectedMinutes:mins};
 }return {values:a.map(x=>x.value),projectedMinutes:null};}
export function backtest(rows,q,mode='raw'){
 const folds=[];
 for(let i=20;i<rows.length;i++){
  const train=rows.slice(0,i).filter(r=>r.date<rows[i].date),w=windowValues(train,mode);if(!w)continue;
  const d=distribution(w.values,q.line,q.side);if(!d)continue;
  const actual=settle(rows[i].value,q);
  const target=actual===1?[1,0,0]:actual===0?[0,1,0]:[0,0,1];
  const probs=[d.pWin,d.pPush,d.pLoss];
  folds.push({date:rows[i].date,pWin:d.pWin,pPush:d.pPush,pLoss:d.pLoss,actual,brier:probs.reduce((s,p,j)=>s+(p-target[j])**2,0)/3,logLoss:-Math.log(Math.max(1e-6,probs[target.indexOf(1)]))});
 }
 const bins=Array.from({length:5},(_,i)=>{const f=folds.filter(f=>Math.min(4,Math.floor(f.pWin*5))===i);return {from:i/5,to:(i+1)/5,n:f.length,predicted:mean(f.map(x=>x.pWin)),observed:f.length?f.filter(x=>x.actual===1).length/f.length:null};});
 return {method:'Expanding-window; last 40 training outcomes; minimum 20 prior games',thresholdMode:'Current selected threshold replayed against past outcomes; NOT historical market or ROI validation',n:folds.length,brier:mean(folds.map(x=>x.brier)),logLoss:mean(folds.map(x=>x.logLoss)),bins,folds,first:folds[0]?.date??null,last:folds.at(-1)?.date??null};
}
export function forecast(q,sample,{now=new Date(),game=null,evaluate=true}={}){
 if(quotePeriod(q)!=='game'||q.kind!=='Player Prop'||!['over','under'].includes(q.side))return {status:'unavailable',reason:'Only sourced full-game player over/under histories are supported.'};
 if(!sample)return {status:'unavailable',reason:'This full-game player market is supported, but no eligible sourced regular-season outcomes are available. Check the coverage diagnostics and reverify saved game IDs.'};
 const cutoff=(game?.start||now.toISOString()).slice(0,10),rows=usableRows(sample.rows,cutoff);
 const currentYear=sample.currentYear,current=rows.filter(r=>r.seasonYear===currentYear);
 if(q.league==='NBA'){
 const fit=fitSeason(rows,q,currentYear,sample.profile?.currentTeamID);
 if(!fit.available)return {status:'unavailable',reason:fit.reason,season:fit};
 const cash=payout(q.odds),bt=evaluate?seasonBacktest(rows,q):null;
 return {status:'experimental',name:'Season/team empirical shrinkage v2',...fit,season:fit,backtest:bt,minutes:null,validated:false,expectedValue:cash===null?null:fit.pWin*cash-fit.pLoss,reason:'Experimental current-season forecast with an explicit comparable-prior policy; no independent calibration claim.',caveats:[fit.policy,`${fit.currentN} current-team games contribute ${(100*fit.currentWeight).toFixed(1)}% of total weight; ${fit.priorN} prior games contribute strength ${fit.priorStrength}.`,fit.roleChange?'Observed minutes shift suppresses last-season borrowing.':'Minutes guard cannot detect all changes in usage, teammates or coaching.',`${fit.otherTeam} prior-season and ${fit.currentOldTeam} current-season old-team games excluded from prediction.`, 'Teammate trades, lineup changes and usage shifts are not fully captured by the team/minutes guard.', 'Weighted Wilson bounds use effective sample size as an approximation, not calibrated future uncertainty.','Same-threshold chronological replay does not validate profitability at historical bookmaker prices.']};
 }
 if(q.league==='NFL'){
 const fit=fitFootball(rows,q,currentYear,sample.profile?.currentTeamID);if(!fit.available)return {status:'unavailable',reason:fit.reason,season:fit};
 const cash=payout(q.odds),bt=evaluate?footballBacktest(rows,q):null;
 return {status:'experimental',name:'NFL season/team empirical shrinkage v1',...fit,season:fit,backtest:bt,minutes:null,validated:false,expectedValue:cash===null?null:fit.pWin*cash-fit.pLoss,caveats:[fit.policy,fit.opportunityShift?'Measured targets/attempts shift suppressed prior borrowing.':'Targets/attempts guard cannot detect all snap, route, quarterback, scheme or depth-chart changes.','Participation, injury, weather and opponent effects are not fully fitted; bookmaker void rules require verification.']};
 }
 return {status:'unavailable',reason:'Unsupported league.'};
}
// Every Lean gate is recorded independently. Take remains a separate disabled policy.
export function exactDecision({state,quote,model,breakEven,availability=null}){
 const price=finite(quote?.odds)?`${quote.odds>0?'+':''}${quote.odds}`:'unverified';
 const experimental=model?.status==='experimental',checks=[];
 const add=(id,label,status,detail,action='')=>checks.push({id,label,status,detail,action});
 add('quote','Current offered pregame price',state?.ok?'pass':'fail',state?.reason||'Quote not verified.','Refresh the saved odds; confirm this exact market is still offered before tipoff.');
 const validPrice=finite(breakEven)&&payout(quote?.odds)!==null;
 add('price','Valid exact quoted price',validPrice?'pass':'fail',validPrice?`${price} requires ${(100*breakEven).toFixed(1)}% wins among non-push outcomes.`:'Invalid or unavailable quoted American odds.','Load a valid bookmaker quote.');
 add('availability','Availability gate',availability?.blocked?'fail':'pass',availability?.blocked?`Recent sourced availability listing: ${availability.status}.`:availability?`Matched listing does not trigger the availability block (${availability.status||'status unspecified'}).`:'No blocking matched listing; absence of an injury listing does not confirm health.','Verify the latest injury report and active lineup.');
 add('forecast','Supported sourced forecast',experimental?'pass':'fail',experimental?`${model.n} sourced training outcomes; forecast remains experimental.`:model?.reason||'No supported sourced forecast.','Refresh verified histories and review current-team, season and role eligibility.');
 const current=model?.season?.currentN;
 if(model?.season)add('current',quote?.league==='NFL'?'Current-team NFL sample':'Current-team NBA sample',finite(current)?(current>=5?'pass':'fail'):'unknown',finite(current)?`${current}/5 required current-season games for the current team.`:'Current-team game count unavailable.','Wait for additional completed current-team games, or refresh missing verified logs.');
 else add('current','Current-team NBA sample',quote?.league==='NBA'&&quote?.kind==='Player Prop'?'unknown':'not-applicable',quote?.league==='NBA'&&quote?.kind==='Player Prop'?'Unavailable until an eligible NBA season/team forecast can be built.':'NBA-specific gate; other leagues retain their forecast eligibility rules.');
 if(model?.availableForLean===false)add('matchup','Game-market matchup validation','fail','This is an unadjusted team-history baseline, not an independently calibrated matchup forecast.','Review the sourced team evidence; game-market Lean remains blocked until a matchup model is validated.');
 const replay=model?.backtest?.n;
 add('replay','Chronological test count',experimental&&finite(replay)?(replay>=20?'pass':'fail'):'unknown',experimental&&finite(replay)?`${replay}/20 required chronological test predictions. Current-threshold replay is not archived-price validation.`:'Chronological test count unavailable.','Collect enough verified earlier games for 20 chronological tests.');
 let conditional=null,ev=null;
 if(experimental&&[model.pWin,model.pLoss].every(finite)){
  const settled=model.pWin+model.pLoss;conditional=settled>0?model.pWin/settled:null;
  const cash=payout(quote?.odds);ev=cash===null?null:model.pWin*cash-model.pLoss;
 }
 const comparable=conditional!==null&&ev!==null&&validPrice;
 add('return','Positive return at this price',comparable?(ev>0?'pass':'fail'):'unknown',comparable?`Experimental non-push win estimate ${(100*conditional).toFixed(1)}% ${ev<=0?'is at/below':'versus'} ${(100*breakEven).toFixed(1)}% required; expected net ${ev>0?'+':''}${ev.toFixed(3)} units per 1 staked.`:'Exact-price return unavailable; a supported forecast, non-push outcomes and valid odds are required.','Compare a better actual quoted price or another line; do not substitute the observed hit rate for a forecast.');
 const lower=model?.interval?.[0],boundKnown=experimental&&finite(lower)&&validPrice;
 add('bound','Historical lower sampling bound',boundKnown?(lower>breakEven?'pass':'fail'):'unknown',boundKnown?`${(100*lower).toFixed(1)}% lower bound versus ${(100*breakEven).toFixed(1)}% break-even; must be strictly greater. This is not a calibrated future confidence bound.`:'Historical lower sampling bound or break-even unavailable.','Additional comparable evidence or a better quoted price may change this comparison; more games alone do not guarantee qualification.');
 add('push','Zero modeled push probability',experimental&&finite(model.pPush)?(model.pPush===0?'pass':'fail'):'unknown',experimental&&finite(model.pPush)?`${(100*model.pPush).toFixed(1)}% modeled push probability; current Lean rule requires exactly zero.`:'Push estimate unavailable.','A push-capable model decision rule needs separate validation; inspect actual half-point alternatives if offered.');
 const blockers=checks.filter(c=>c.status==='fail'||c.status==='unknown'),lean=blockers.length===0;
 const ordered=ev!==null&&ev<=0?[...blockers.filter(c=>c.id==='return'),...blockers.filter(c=>c.id!=='return')]:blockers;
 const reason=lean?'All experimental Lean gates met. A historical-bound research lean; independent prospective validation remains unavailable.':ordered.map(c=>`${c.label}: ${c.detail}`).join(' ');
 const label=lean?'LEAN':'PASS';
 return {label,take:false,checks,blockers,conditionalWin:conditional,expectedNet:ev,takePolicy:'Automatic Take is disabled in this version. Frozen pregame predictions and later outcomes require independent review before enabling it; no automatic unlock count is defined.',reason,summary:`MY DECISION: ${label} ${quote?.side||''} ${quote?.kind==='Moneyline'?'moneyline':quote?.line??''} at ${price}. ${reason}`};
}
