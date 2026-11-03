// Predeclared, experimental shrinkage policy. Hyperparameters are not claimed
// optimal: prior strength 10 games, last 40 outcomes per season, role guard 5 min/25%.
const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
function interval(p,n){const z=1.96,d=1+z*z/n,c=(p+z*z/(2*n))/d,r=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-r),Math.min(1,c+r)];}
export function fitSeason(rows,q,year,teamID=null,{priorStrength=10,minimumPriorCombined=20}={}){
 const thisSeason=rows.filter(r=>r.seasonYear===year),known=teamID||thisSeason.at(-1)?.teamID||null;
 const current=thisSeason.filter(r=>!known||String(r.teamID||'')===String(known)).slice(-40);
 const prior=rows.filter(r=>r.seasonYear===year-1&&known&&String(r.teamID||'')===String(known)).slice(-40);
 const currentOldTeam=known?thisSeason.filter(r=>r.teamID&&String(r.teamID)!==String(known)).length:0;
 const otherTeam=rows.filter(r=>r.seasonYear===year-1&&known&&r.teamID&&String(r.teamID)!==String(known)).length;
 const cmRows=current.slice(-5).filter(r=>numeric(r.minutes)&&r.minutes>0),pmRows=prior.slice(-20).filter(r=>numeric(r.minutes)&&r.minutes>0),cm=avg(cmRows.map(r=>Number(r.minutes))),pm=avg(pmRows.map(r=>Number(r.minutes)));
 const roleChange=cmRows.length>=2&&pmRows.length>=5&&cm!==null&&pm>0&&Math.abs(cm-pm)>=5&&Math.abs(cm/pm-1)>.25;
 const usePrior=priorStrength>0&&prior.length>=10&&prior.length+current.length>=minimumPriorCombined&&!roleChange;
 if(!current.length)return {available:false,currentN:0,priorN:prior.length,reason:'No sourced current-season appearance for the current team. Prior-season statistics remain visible, but cannot describe the present season.'};
 if(!usePrior&&current.length<5)return {available:false,reason:`${current.length} current-team games; need 5 when a comparable prior is unavailable or a role/team change prevents borrowing. No rookie, old-team or new-role history is fabricated.`,currentN:current.length,priorN:prior.length,roleChange,otherTeam};
 const past=usePrior?prior:[],strength=usePrior?priorStrength:0,weighted=[...current.map(r=>({...r,weight:1})),...past.map(r=>({...r,weight:strength/past.length}))];
 const total=weighted.reduce((s,r)=>s+r.weight,0),effectiveN=total**2/weighted.reduce((s,r)=>s+r.weight**2,0);
 const wins=weighted.filter(r=>q.side==='over'?r.value>Number(q.line):r.value<Number(q.line)).reduce((s,r)=>s+r.weight,0),pushes=weighted.filter(r=>r.value===Number(q.line)).reduce((s,r)=>s+r.weight,0);
 const pWin=wins/total,pPush=pushes/total,pLoss=Math.max(0,1-pWin-pPush);
 return {trainingHits:weighted.filter(r=>q.side==='over'?r.value>Number(q.line):r.value<Number(q.line)).length,available:true,pWin,pPush,pLoss,n:weighted.length,interval:interval(pWin,effectiveN),effectiveN,mean:weighted.reduce((s,r)=>s+r.value*r.weight,0)/total,currentN:current.length,priorN:past.length,priorStrength:strength,currentWeight:current.length/total,teamID:known,roleChange,otherTeam,currentOldTeam,currentMinutes:cm,priorMinutes:pm,currentMinutesN:cmRows.length,priorMinutesN:pmRows.length,policy:`Current games weight 1 each; at most 40 comparable prior-season games share total weight ${strength}. Old-team priors excluded; a >=5 minute and >25% shift suppresses the prior.`};
}
export function seasonBacktest(rows,q,{priorStrength=10}={}){
 const folds=[];
 for(let i=1;i<rows.length;i++){
  const r=rows[i],past=rows.slice(0,i).filter(g=>g.date<r.date),known=past.at(-1)?.teamID;if(!known||!r.teamID||String(known)!==String(r.teamID))continue;const fit=fitSeason(past,q,r.seasonYear,known,{priorStrength});if(!fit.available)continue;
  const actual=r.value===Number(q.line)?0:(q.side==='over'?r.value>q.line:r.value<q.line)?1:-1;
  const ps=[fit.pWin,fit.pPush,fit.pLoss],truth=actual===1?[1,0,0]:actual===0?[0,1,0]:[0,0,1];
  folds.push({date:r.date,seasonYear:r.seasonYear,pWin:fit.pWin,pPush:fit.pPush,pLoss:fit.pLoss,actual,brier:ps.reduce((s,p,j)=>s+(p-truth[j])**2,0)/3,logLoss:-Math.log(Math.max(1e-6,ps[truth.indexOf(1)]))});
 }
 const bins=Array.from({length:5},(_,i)=>{const f=folds.filter(f=>Math.min(4,Math.floor(f.pWin*5))===i);return {from:i/5,to:(i+1)/5,n:f.length,predicted:avg(f.map(x=>x.pWin)),observed:f.length?f.filter(x=>x.actual===1).length/f.length:null};});
 const currentYear=rows.at(-1)?.seasonYear,cur=folds.filter(f=>f.seasonYear===currentYear);
 return {currentSeasonN:cur.length,currentSeasonBrier:avg(cur.map(f=>f.brier)),n:folds.length,brier:avg(folds.map(f=>f.brier)),logLoss:avg(folds.map(f=>f.logLoss)),bins,folds,first:folds[0]?.date??null,last:folds.at(-1)?.date??null,method:'Chronological replay of the same season/team/minutes-guard policy; only earlier dates enter training.',thresholdMode:'Current threshold replay; not historical odds/ROI validation'};
}
