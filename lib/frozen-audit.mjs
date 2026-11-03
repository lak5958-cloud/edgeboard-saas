import {archivedShadow} from './shadow-model.mjs';
import {nameKey,sameStat} from './insights.mjs';
import {normalizeSeasonGame} from './seasons.mjs';
const eastern=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
export function auditFrozen(reports,records,{day,now=new Date()}={}){
 const chosen=new Map(),excluded={notPregame:0,noIdentity:0,invalidProbability:0};
 for(const {report,savedAt,path} of reports)for(const [book,b] of Object.entries(report.byBook||{draftkings:{leagues:report.leagues||{}}}))for(const [league,l] of Object.entries(b.leagues||{}))for(const p of [...(l.picks||[]),...(l.watchlist||[])]){
  const start=Date.parse(p.game?.start),frozen=Date.parse(savedAt),quote=Date.parse(p.asOf),prob=p.experimentalProbability,savedID=p.quote?.athleteID||p.quote?.profile?.id||p.headshot?.match(/full\/(\d+)\.png/)?.[1];
  if(!Number.isFinite(start)||eastern(start)!==day)continue;
  if(!Number.isFinite(frozen)||frozen>=start||!Number.isFinite(quote)||quote>frozen||start>now.getTime()){excluded.notPregame++;continue;}
  const identities=new Set(records.filter(r=>r.league===league&&nameKey(r.subject)===nameKey(p.player)).map(r=>String(r.athleteID||r.profile?.id||'')).filter(Boolean));
  const id=savedID||(identities.size===1?[...identities][0]:null);
  if(!id){excluded.noIdentity++;continue;}
  if(!Number.isFinite(prob)||prob<0||prob>1){excluded.invalidProbability++;continue;}
  const key=JSON.stringify([league,book,p.quote.eventID,id,p.stat,p.side,p.line]),prior=chosen.get(key);
  if(!prior||frozen<prior.frozen)chosen.set(key,{p,league,book,id:String(id),frozen,path,prob,start});
 }
 const results=[];
 for(const row of chosen.values()){
  const {p,league,book,id,start}=row,values=[];
  for(const record of records){if(record.league!==league||String(record.athleteID||record.profile?.id)!==id||!sameStat(record.stat,p.stat))continue;
   for(const raw of record.games||[]){const g=normalizeSeasonGame(raw,league);if(g?.seasonType!=='regular'||String(g.date||'').slice(0,10)!==new Date(start).toISOString().slice(0,10)||!Number.isFinite(g.value)||!g.source||!g.gameID)continue;values.push(g);}}
  const unique=[...new Map(values.map(g=>[g.gameID+'|'+g.value,g])).values()],valid=unique.length===1?unique[0]:null;
  const outcome=valid?(valid.value===p.line?'push':(p.side==='over'?valid.value>p.line:valid.value<p.line)?'win':'loss'):'unsettled';
  const rawPush=p.modelEvidence?.pPush,knownPush=Number.isFinite(rawPush)&&rawPush>=0&&rawPush<1?rawPush:(Number.isFinite(p.line)&&!Number.isInteger(p.line)?0:null),scoringProbability=knownPush!==null?row.prob/(1-knownPush):null,shadow=archivedShadow(p,new Date(row.frozen).toISOString(),start),shadowProbability=shadow&&shadow.pPush<1?shadow.pWin/(1-shadow.pPush):null,truth=outcome==='win'?1:0,scorable=['win','loss'].includes(outcome);
  results.push({player:p.player,league,book,line:p.line,side:p.side,stat:p.stat,odds:p.odds,label:p.label,probability:row.prob,frozenAt:new Date(row.frozen).toISOString(),archivePath:row.path,scoringProbability,shadowProbability,shadowVersion:shadow?.version??null,shadowBrier:scorable&&Number.isFinite(shadowProbability)?(shadowProbability-truth)**2:null,outcome,actual:valid?.value??null,source:valid?.source??null,brier:scorable&&Number.isFinite(scoringProbability)&&scoringProbability<=1?(scoringProbability-truth)**2:null});
 }
 const settled=results.filter(r=>r.brier!==null),bins=Array.from({length:5},(_,i)=>{const a=settled.filter(r=>r.probability>=i/5&&(i===4?r.probability<=1:r.probability<(i+1)/5));return {from:i/5,to:(i+1)/5,n:a.length,predicted:a.length?a.reduce((s,r)=>s+r.probability,0)/a.length:null,observed:a.length?a.filter(r=>r.outcome==='win').length/a.length:null};});
 return {day,snapshots:reports.map(({report,savedAt})=>({savedAt,generatedAt:report.generatedAt||null,format:report.byBook?'book-specific':'legacy',leagues:Object.keys(report.leagues||report.byBook?.draftkings?.leagues||{})})),results,excluded,settled:results.filter(r=>r.outcome!=='unsettled').length,scored:settled.length,unsettled:results.filter(r=>r.outcome==='unsettled').length,brier:settled.length?settled.reduce((s,r)=>s+r.brier,0)/settled.length:null,bins,method:'Earliest retained pregame snapshot per exact selection. Only archived shortlist/watchlist coverage; alternate lines and books are correlated. Pushes are reported separately. Binary Brier scores use known non-push conditional probabilities; integer-line archives without a saved push estimate cannot be scored. Shadow forecasts are scored only when saved before the game, never reconstructed afterward. No retraining or automatic model promotion.'};
}
