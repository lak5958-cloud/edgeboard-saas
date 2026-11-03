const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function summarizeAudits(audits){
 const days=audits.map(r=>({day:r.day,rows:r.results||[]})),rows=days.flatMap(d=>d.rows.map(r=>({...r,day:d.day}))),score=a=>{const settled=a.filter(r=>['win','loss'].includes(r.outcome)),scored=settled.filter(r=>Number.isFinite(r.brier));return {selections:a.length,wins:settled.filter(r=>r.outcome==='win').length,losses:settled.filter(r=>r.outcome==='loss').length,pushes:a.filter(r=>r.outcome==='push').length,pending:a.filter(r=>r.outcome==='unsettled').length,scored:scored.length,observedWinRate:settled.length?settled.filter(r=>r.outcome==='win').length/settled.length:null,meanProbability:mean(scored.map(r=>r.probability)),brier:mean(scored.map(r=>r.brier)),constantHalfBrier:scored.length?.25:null};};
 const groups=key=>[...new Set(rows.map(r=>r[key]||'Unknown'))].sort().map(value=>({group:value,...score(rows.filter(r=>(r[key]||'Unknown')===value))}));
 const perDay=days.map(d=>({group:d.day,...score(d.rows)}));
 return {overall:score(rows),days:perDay,byLeague:groups('league'),byBook:groups('book'),byDecision:groups('label'),completedDays:perDay.filter(d=>d.scored>0).length,dayEqualBrier:mean(perDay.filter(d=>d.scored>0).map(d=>d.brier)),method:'Each frozen selection is scored once per slate by the audit. Books and alternate lines remain correlated. Day-equal Brier gives each scored date equal weight. The 50% benchmark always assigns probability 0.5; it is not a sportsbook forecast or betting strategy. Single-day and small-group differences remain exploratory; no model promotion or profitability claim.'};
}
export function auditDates(index,legacyDay='2026-11-02',now=new Date()){
 const today=now.toLocaleDateString('en-CA',{timeZone:'America/New_York'}),dates=new Map([[legacyDay,{day:legacyDay,snapshots:8}]]);
 for(const e of index||[]){if(e.kind!=='players'||!/^\d{4}-\d{2}-\d{2}$/.test(e.slateDate||''))continue;if(!dates.has(e.slateDate))dates.set(e.slateDate,{day:e.slateDate,snapshots:0});dates.get(e.slateDate).snapshots++;}
 return [...dates.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(d=>({...d,completed:d.day<today}));
}
