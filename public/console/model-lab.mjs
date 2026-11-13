const finite=x=>typeof x==='number'&&Number.isFinite(x);
const mean=a=>a.length?a.reduce((sum,x)=>sum+x,0)/a.length:null;
const clamp=p=>Math.max(.001,Math.min(.999,p));
const logit=p=>Math.log(clamp(p)/(1-clamp(p)));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));
const unit=r=>JSON.stringify([r.league,r.eventID]);
const identity=r=>JSON.stringify([r.league,r.book,r.eventID,r.athleteID||r.selectionTeam,r.stat,r.side,r.line]);
const family=r=>['Moneyline','Spread','Total','Team Total'].includes(r.stat)?r.stat:r.researchCandidates?.family||(/longest/i.test(r.stat)?'longest':/touchdown/i.test(r.stat)?'touchdowns':/yards/i.test(r.stat)?'yards':/receptions|assists|rebounds|steals|blocks/i.test(r.stat)?'counts':'scoring');
function inputs(r,strategy){
 const p=r.scoringProbability;
 if(!finite(p))return null;
 const x=[1,logit(p)],c=r.researchCandidates,w=c?.workload,features=c?.features,injury=r.pregameContext;
 if(strategy==='calibration')return x;
 const workload=w?.historicalMean>0&&finite(w.projection)?Math.log(Math.max(.05,w.projection/w.historicalMean)):null;
 const defense=features?.defenseAllowed?.ratio>0?Math.log(features.defenseAllowed.ratio):null;
 // The feature is the number of recorded fresh absence reports, never a declaration of team health.
 const reports=injury?.teammateReports;
 const absences=Array.isArray(reports)?reports.filter(i=>i.fresh&&/^(out|doubtful|inactive|ir|injured reserve|suspended)$/i.test(i.status)).length:null;
 const own=injury?.availability?.fresh?Number(/questionable/i.test(injury.availability.status)):null;
 const pace=features?.pace?.ratio>0?Math.log(features.pace.ratio):null;
 const usage=features?.usage?.ratio>0?Math.log(features.usage.ratio):null;
 const values={workload:[workload],defense:[defense],pace:[pace],usage:[usage],injury:[absences,own],combined:[workload,defense,pace,usage,absences,own]}[strategy];
 const direction=r.side==='under'?-1:1;
 return values?.every(finite)?[...x,...values.map(v=>v*direction)]:null;
}
function fit(rows,strategy){
 const prepared=rows.map(r=>({r,x:inputs(r,strategy)})).filter(p=>p.x);
 const games=new Set(prepared.map(p=>unit(p.r))),days=new Set(prepared.map(p=>p.r.day)),wins=prepared.filter(p=>p.r.outcome==='win').length;
 if(prepared.length<100||games.size<30||days.size<5||wins<20||prepared.length-wins<20)return null;
 const counts=new Map();
 for(const p of prepared)counts.set(unit(p.r),(counts.get(unit(p.r))||0)+1);
 const size=prepared[0].x.length,prior=Array.from({length:size},(_,i)=>i===1?1:0),beta=[...prior];
 // Fixed ridge regularization. Each game receives total weight one across books and alternate lines.
 for(let iteration=0;iteration<200;iteration++){
  const gradient=beta.map((b,i)=>2*(b-prior[i]));
  for(const {r,x} of prepared){
   const error=(sigmoid(x.reduce((sum,v,i)=>sum+v*beta[i],0))-Number(r.outcome==='win'))/counts.get(unit(r));
   x.forEach((v,i)=>{gradient[i]+=error*v;});
  }
  beta.forEach((b,i)=>{beta[i]=b-.05*gradient[i]/games.size;});
 }
 return {beta,rows:prepared.length,games:games.size,days:days.size};
}
function summary(pairs){
 const groups=new Map();
 for(const p of pairs){const id=unit(p.row);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);}
 const score=(p,probability)=>(probability-Number(p.row.outcome==='win'))**2;
 const losses=[...groups.values()].map(group=>({candidate:mean(group.map(p=>score(p,p.probability))),active:mean(group.map(p=>score(p,p.row.scoringProbability)))}));
 return {selections:pairs.length,games:groups.size,candidateBrier:mean(losses.map(p=>p.candidate)),activeBrier:mean(losses.map(p=>p.active)),difference:mean(losses.map(p=>p.candidate-p.active)),logLoss:mean([...groups.values()].map(group=>mean(group.map(p=>{const probability=clamp(p.probability);return -Math.log(p.row.outcome==='win'?probability:1-probability);}))))};
}
export function modelLab(audits,{holdoutFrom = null} = {}){
 const earliest=new Map(),conflicts=new Set();
 for(const audit of audits)for(const raw of audit.results||[]){
  const row={...raw,day:audit.day},id=identity(row),previous=earliest.get(id);
  if(previous&&previous.outcome!==row.outcome)conflicts.add(id);
  if(!previous||Date.parse(row.frozenAt)<Date.parse(previous.frozenAt))earliest.set(id,row);
 }
 const rows=[...earliest].filter(([id])=>!conflicts.has(id)).map(([,r])=>r).filter(r=>['win','loss'].includes(r.outcome)&&finite(r.scoringProbability)&&finite(r.brier)).sort((a,b)=>a.day.localeCompare(b.day)||a.frozenAt.localeCompare(b.frozenAt));
 const targets = holdoutFrom ? rows.filter(row => row.day >= holdoutFrom) : rows;
 const firstHoldoutCapture = targets.reduce((earliest,row) => Math.min(earliest, Date.parse(row.frozenAt)), Infinity);
 const variants=[],strategies=['calibration','workload','defense','pace','usage','injury','combined'],available=Object.fromEntries(strategies.map(s=>[s,rows.filter(r=>inputs(r,s)).length]));
 for(const strategy of strategies){
  const pairs=[];
  for(const day of [...new Set(targets.map(r=>r.day))]){
   const dayTargets=targets.filter(r=>r.day===day);
   for(const league of ['NBA','NFL'])for(const group of [...new Set(dayTargets.filter(r=>r.league===league).map(family))]){
    const test=dayTargets.filter(r=>r.league===league&&family(r)===group),earliestCapture=Math.min(...test.map(r=>Date.parse(r.frozenAt)));
    const train=rows.filter(r=>r.day<(holdoutFrom||day)&&r.league===league&&family(r)===group&&Number.isFinite(Date.parse(r.outcomeObservedAt))&&Date.parse(r.outcomeObservedAt)<(holdoutFrom?firstHoldoutCapture:earliestCapture));
    const trained=fit(train,strategy);
    if(!trained)continue;
    for(const row of test){const x=inputs(row,strategy);if(x)pairs.push({row,probability:sigmoid(x.reduce((sum,v,i)=>sum+v*trained.beta[i],0))});}
   }
  }
  variants.push({id:strategy,...summary(pairs),byDate:[...new Set(pairs.map(p=>p.row.day))].map(day=>({day,...summary(pairs.filter(p=>p.row.day===day))}))});
 }
 // Compare a fixed blend only on genuine two-sided prices from the frozen observation.
 const marketPairs = targets.filter(row => finite(row.marketProbability) &&
  row.marketProbability > 0 && row.marketProbability < 1);
 variants.push({
  id:'market-blend-half-v1',
  ...summary(marketPairs.map(row => ({row,probability:(row.scoringProbability + row.marketProbability) / 2}))),
  marketBrier:summary(marketPairs.map(row => ({row,probability:row.marketProbability}))).candidateBrier
 });
 const direct=new Map();
 for(const row of targets)for(const model of row.researchCandidates?.models||[]){
  if(!(model.pPush>=0&&model.pPush<1)||!finite(model.pWin))continue;
  if(!direct.has(model.id))direct.set(model.id,[]);
  direct.get(model.id).push({row,probability:model.pWin/(1-model.pPush)});
 }
 for(const [id,pairs] of direct)variants.push({id,...summary(pairs)});
 const bins=Array.from({length:5},(_,i)=>{const a=rows.filter(r=>Math.min(4,Math.floor(r.scoringProbability*5))===i);return {from:i/5,to:(i+1)/5,selections:a.length,games:new Set(a.map(unit)).size,predicted:mean(a.map(r=>r.scoringProbability)),observed:a.length?a.filter(r=>r.outcome==='win').length/a.length:null};});
 const roiRows=rows.filter(r=>finite(r.odds)&&Math.abs(r.odds)>=100);
 const contextCoverage=rows.filter(r=>r.researchCandidates);
 return {holdoutFrom,holdoutDates:new Set(targets.map(r=>r.day)).size,holdoutGames:new Set(targets.map(unit)).size,days:new Set(rows.map(r=>r.day)).size,games:new Set(rows.map(unit)).size,selections:rows.length,conflicts:conflicts.size,contextCoverage:contextCoverage.length,available,variants,bins,marketGroups:[...new Set(rows.map(r=>r.league+' '+family(r)))].map(group=>({group,selections:rows.filter(r=>r.league+' '+family(r)===group).length})),
  flatStakeNet:roiRows.reduce((sum,r)=>sum+(r.outcome==='loss'?-1:r.odds>0?r.odds/100:100/-r.odds),0),pricedSelections:roiRows.length,
  status:'research-only',method:'Earliest frozen exact selection across repeated audits. Pending games and pushes excluded from binary scores. Game-weighted paired Brier comparisons. Calibration and context regressions train within sport and market family on strictly earlier days with outcome verification before target capture. Minimum 100 selections, 30 games, five dates and 20 results of each class. Those thresholds are experiment rules, not an accuracy certificate. No automatic promotion. Flat-stake net is descriptive across correlated captured selections, not a deployable betting strategy.'};
}
