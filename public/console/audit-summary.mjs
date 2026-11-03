const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function summarizeAudits(audits){
 const days=audits.map(r=>({day:r.day,rows:r.results||[]})),rows=days.flatMap(d=>d.rows.map(r=>({...r,day:d.day})));
 const score=a=>{
  const settled=a.filter(r=>['win','loss'].includes(r.outcome)),scored=settled.filter(r=>Number.isFinite(r.brier)),paired=scored.filter(r=>Number.isFinite(r.shadowBrier)),priced=scored.filter(r=>Number.isFinite(r.quotedPriceBrier)),market=scored.filter(r=>Number.isFinite(r.marketBrier)),triple=market.filter(r=>Number.isFinite(r.shadowBrier));
  return {marketPaired:market.length,marketPairedActiveBrier:mean(market.map(r=>r.brier)),marketBrier:mean(market.map(r=>r.marketBrier)),threeWayCount:triple.length,threeWayActive:mean(triple.map(r=>r.brier)),threeWayShadow:mean(triple.map(r=>r.shadowBrier)),threeWayMarket:mean(triple.map(r=>r.marketBrier)),selections:a.length,wins:settled.filter(r=>r.outcome==='win').length,losses:settled.filter(r=>r.outcome==='loss').length,pushes:a.filter(r=>r.outcome==='push').length,pending:a.filter(r=>r.outcome==='unsettled').length,scored:scored.length,unscoredSettled:settled.length-scored.length,observedWinRate:settled.length?settled.filter(r=>r.outcome==='win').length/settled.length:null,scoredObservedWinRate:scored.length?scored.filter(r=>r.outcome==='win').length/scored.length:null,meanProbability:mean(scored.map(r=>r.scoringProbability??r.probability)),shadowPaired:paired.length,pairedActiveBrier:mean(paired.map(r=>r.brier)),shadowBrier:mean(paired.map(r=>r.shadowBrier)),shadowDifference:mean(paired.map(r=>r.shadowBrier-r.brier)),brier:mean(scored.map(r=>r.brier)),constantHalfBrier:scored.length?.25:null,quotedPricePaired:priced.length,pricePairedActiveBrier:mean(priced.map(r=>r.brier)),quotedPriceBrier:mean(priced.map(r=>r.quotedPriceBrier)),priceDifference:mean(priced.map(r=>r.brier-r.quotedPriceBrier))};
 };
 const groups=key=>[...new Set(rows.map(r=>r[key]||'Unknown'))].sort().map(value=>({group:value,...score(rows.filter(r=>(r[key]||'Unknown')===value))}));
 const perDay=days.map(d=>({group:d.day,...score(d.rows)})),scored=rows.filter(r=>Number.isFinite(r.brier)&&Number.isFinite(r.scoringProbability));
 const bins=Array.from({length:5},(_,i)=>{const a=scored.filter(r=>r.scoringProbability>=i/5&&(i===4?r.scoringProbability<=1:r.scoringProbability<(i+1)/5));return {from:i/5,to:(i+1)/5,n:a.length,predicted:mean(a.map(r=>r.scoringProbability)),observed:a.length?a.filter(r=>r.outcome==='win').length/a.length:null};});
 const gaps=new Map();for(const r of rows){const reason=r.outcome==='unsettled'?r.settlementReason||'Unverified outcome':Number.isFinite(r.brier)||r.outcome==='push'?null:r.scoreReason||'Unscored settled outcome';if(reason)gaps.set(reason,(gaps.get(reason)||0)+1);}
 const tradeRows=rows.filter(r=>r.tradeEvidence);
 const trade=auditTrade(tradeRows,audits.some(a=>a.scope==='trade'));
 return {trade,overall:score(rows),days:perDay,byLeague:groups('league'),byBook:groups('book'),byDecision:groups('label'),byModel:groups('modelVersion'),byStatistic:groups('stat'),byMarketType:groups('marketType'),bins,gaps:[...gaps].map(([reason,n])=>({reason,n})),completedDays:perDay.filter(d=>d.scored>0).length,shadowComparedDays:perDay.filter(d=>d.shadowPaired>0).length,dayEqualShadowDifference:mean(perDay.filter(d=>d.shadowPaired>0).map(d=>d.shadowDifference)),dayEqualBrier:mean(perDay.filter(d=>d.scored>0).map(d=>d.brier)),method:'Each frozen selection is scored once per slate by the audit. Books and alternate lines remain correlated. Day-equal Brier gives each scored date equal weight. The 50% benchmark always assigns probability 0.5; it is not a sportsbook forecast or betting strategy. Original-price comparisons include sportsbook margin and use only the same scored selections with saved valid odds; they are not a no-vig market forecast. Shadow comparisons use only paired, genuinely archived forecasts; negative shadow differences favor the challenger. Single-day, calibration-bin and small-group differences remain exploratory; no model promotion or profitability claim.'};
}
function auditTrade(rows,enabled){
 if(!enabled)return null;
 const scored=rows.filter(r=>Number.isFinite(r.brier));
 const days=[...new Set(scored.map(r=>r.day))];
 const compare=get=>{
  const paired=scored.filter(r=>Number.isFinite(get(r)));
  const grouped=new Map();
  for(const row of paired){
   if(!grouped.has(row.day))grouped.set(row.day,[]);
   grouped.get(row.day).push(row);
  }
  const slates=[...grouped.values()];
  return {lines:paired.length,dates:slates.length,challenger:mean(slates.map(rr=>mean(rr.map(r=>r.brier)))),reference:mean(slates.map(rr=>mean(rr.map(get))))};
 };
 return {captured:rows.length,scored:scored.length,days:days.length,players:new Set(scored.map(r=>r.athleteID)).size,games:new Set(scored.map(r=>r.eventID)).size,pending:rows.filter(r=>r.outcome==='unsettled').length,withoutActive:rows.filter(r=>r.tradeEvidence.active===null).length,scoredWithoutActive:scored.filter(r=>r.tradeEvidence.active===null).length,currentOnly:compare(r=>r.tradeEvidence.currentOnlyBrier),active:compare(r=>r.tradeEvidence.activeBrier),market:compare(r=>r.marketBrier)};
}
export function auditDates(index,legacyDay='2026-11-02',now=new Date()){
 const today=now.toLocaleDateString('en-CA',{timeZone:'America/New_York'}),dates=new Map([[legacyDay,{day:legacyDay,snapshots:8,gameSnapshots:0}]]);
 for(const e of index||[]){if(!['players','games'].includes(e.kind)||!/^\d{4}-\d{2}-\d{2}$/.test(e.slateDate||''))continue;if(!dates.has(e.slateDate))dates.set(e.slateDate,{day:e.slateDate,snapshots:0,gameSnapshots:0});dates.get(e.slateDate)[e.kind==='games'?'gameSnapshots':'snapshots']++;}
 return [...dates.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(d=>({...d,completed:d.day<today}));
}
