import {fitSeason} from './season-model.mjs';
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x)),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function fitFootball(rows,q,year,teamID=null){
 const known=teamID||rows.at(-1)?.teamID,current=rows.filter(r=>r.seasonYear===year&&(!known||String(r.teamID)===String(known))),prior=rows.filter(r=>r.seasonYear===year-1&&known&&String(r.teamID)===String(known));
 const cm=current.slice(-3).filter(r=>num(r.opportunity)).map(r=>Number(r.opportunity)),pm=prior.slice(-10).filter(r=>num(r.opportunity)).map(r=>Number(r.opportunity));
 const opportunityShift=cm.length>=3&&pm.length>=5&&mean(pm)>0&&Math.abs(mean(cm)/mean(pm)-1)>.25;
 return {...fitSeason(rows,q,year,known,{priorStrength:opportunityShift?0:10,minimumPriorCombined:12}),opportunityShift};
}
export function footballBacktest(rows,q){
 const folds=[];
 for(let i=1;i<rows.length;i++){
  const r=rows[i],past=rows.slice(0,i).filter(g=>g.date<r.date),known=past.at(-1)?.teamID;if(!known||!r.teamID||String(r.teamID)!==String(known))continue;
  const fit=fitFootball(past,q,r.seasonYear,known);if(!fit.available)continue;
  const actual=r.value===Number(q.line)?0:(q.side==='over'?r.value>q.line:r.value<q.line)?1:-1,probs=[fit.pWin,fit.pPush,fit.pLoss],truth=actual===1?[1,0,0]:actual===0?[0,1,0]:[0,0,1];
  folds.push({date:r.date,seasonYear:r.seasonYear,pWin:fit.pWin,pPush:fit.pPush,pLoss:fit.pLoss,actual,brier:probs.reduce((s,p,j)=>s+(p-truth[j])**2,0)/3,logLoss:-Math.log(Math.max(1e-6,probs[truth.indexOf(1)]))});
 }
 const current=folds.filter(f=>f.seasonYear===rows.at(-1)?.seasonYear),bins=Array.from({length:5},(_,i)=>{const f=folds.filter(f=>Math.min(4,Math.floor(f.pWin*5))===i);return {from:i/5,to:(i+1)/5,n:f.length,predicted:mean(f.map(x=>x.pWin)),observed:f.length?f.filter(x=>x.actual===1).length/f.length:null};});
 return {n:folds.length,currentSeasonN:current.length,currentSeasonBrier:mean(current.map(f=>f.brier)),brier:mean(folds.map(f=>f.brier)),logLoss:mean(folds.map(f=>f.logLoss)),bins,folds,method:'NFL chronological season/team and measured-opportunity replay; unknown transition games excluded.',thresholdMode:'Current threshold replay, not historical odds/ROI validation'};
}
