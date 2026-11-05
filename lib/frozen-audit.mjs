import {archivedCandidates} from './research-candidates.mjs';
import {TRADE_VERSION} from './trade-shadow.mjs';
import {archivedMarketProbability} from './market-benchmark.mjs';
import {archivedShadow} from './shadow-model.mjs';
import {nameKey,sameStat,normalizeStat,implied} from './insights.mjs';
import {quotePeriod} from './markets.mjs';
import {normalizeSeasonGame} from './seasons.mjs';
const eastern=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
const validOdds=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)>=100;
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function auditFrozen(reports,records,{day,now=new Date(),scope='shortlist'}={}){
 const chosen=new Map(),excluded={notPregame:0,noIdentity:0,invalidProbability:0,unsupportedPeriod:0,invalidSelection:0},identities=new Map(),outcomes=new Map();
 // Index once, rather than rescanning every player series for every archived quote.
 for(const r of records){
  const id=r.athleteID||r.profile?.id,key=r.league+'|'+nameKey(r.subject);
  if(id){if(!identities.has(key))identities.set(key,new Set());identities.get(key).add(String(id));}
  if(!id||String(r.periodID||'game').toLowerCase()!=='game')continue;
  const athlete=r.league+'|'+String(id);if(!outcomes.has(athlete))outcomes.set(athlete,[]);
  outcomes.get(athlete).push(r);
 }
 const cohortField=scope==='trade'?'tradeCohort':scope==='cohort'?'evaluationCohort':null;
 const cohortCaptures=new Map();
 if(cohortField)for(const {report,savedAt,path} of reports)for(const p of report[cohortField]||[]){
  const start=Date.parse(p.game?.start),at=Date.parse(savedAt),key=JSON.stringify([p.quote?.league,p.quote?.eventID,p.book]);
  if(!Number.isFinite(at)||!Number.isFinite(start)||at<start-60*60000||at>start-45*60000)continue;
  const first=cohortCaptures.get(key);
  if(!first||at<first.at)cohortCaptures.set(key,{at,path});
 }
 for(const {report:original,savedAt,path} of reports){
 const report=cohortField?{...original,byBook:Object.fromEntries(['draftkings','fanduel'].map(book=>[book,{leagues:Object.fromEntries(['NBA','NFL'].map(league=>[league,{picks:(original[cohortField]||[]).filter(p=>p.book===book&&p.quote?.league===league)}]))}]))}:original;
 for(const [book,b] of Object.entries(report.byBook||{draftkings:{leagues:report.leagues||{}}}))for(const [league,l] of Object.entries(b.leagues||{}))for(const p of [...(l.picks||[]),...(l.watchlist||[])]){
  const start=Date.parse(p.game?.start),frozen=Date.parse(savedAt),quote=Date.parse(p.asOf),prob=p.experimentalProbability,savedIDs=[p.athleteID,p.quote?.athleteID,p.quote?.profile?.id,p.readiness?.athleteID,p.headshot?.match(/full\/(\d+)\.png/)?.[1]].filter(Boolean).map(String);
  if(!Number.isFinite(start)||eastern(start)!==day)continue;
  if(cohortField&&cohortCaptures.get(JSON.stringify([league,p.quote?.eventID,book]))?.path!==path)continue;
  if(!Number.isFinite(frozen)||frozen>=start||frozen>now.getTime()||!Number.isFinite(quote)||quote>frozen||start>now.getTime()){excluded.notPregame++;continue;}
  if(quotePeriod(p.quote||{})!=='game'){excluded.unsupportedPeriod++;continue;}
  if(!p.quote?.eventID||!p.stat||!['over','under'].includes(p.side)||typeof p.line!=='number'||!Number.isFinite(p.line)||p.quote.kind&&p.quote.kind!=='Player Prop'||p.quote.league&&p.quote.league!==league||p.quote.book&&p.quote.book!==book||p.quote.stat&&!sameStat(p.quote.stat,p.stat)||p.quote.side&&p.quote.side!==p.side||p.quote.line!=null&&p.quote.line!==p.line||p.quote.odds!=null&&p.quote.odds!==p.odds){excluded.invalidSelection++;continue;}
  const candidates=identities.get(league+'|'+nameKey(p.player))||new Set(),uniqueSavedIDs=new Set(savedIDs),id=uniqueSavedIDs.size===1?savedIDs[0]:uniqueSavedIDs.size===0&&candidates.size===1?[...candidates][0]:null;
  if(!id){excluded.noIdentity++;continue;}
  if(scope==='trade'){
   const t=p.tradeTrial,created=Date.parse(t?.createdAt),rosterAt=Date.parse(t?.roster?.asOf);
   if(league!=='NBA'||Math.abs(p.line%1)!==.5||t?.version!==TRADE_VERSION||t.limited!==prob||!probability(t.currentOnly)||!(t.active===null||probability(t.active))||t.roster?.id!==id||!/^https:\/\//.test(t.roster?.url||'')||!Number.isInteger(t.currentN)||t.currentN<2||t.currentN>5||!Number.isInteger(t.oldN)||t.oldN<5||t.oldN>20||p.modelEvidence?.pPush!==0||!Number.isFinite(rosterAt)||rosterAt>created||created-rosterAt>48*3600000||!Number.isFinite(created)||created>frozen||created>=start){excluded.invalidSelection++;continue;}
  }
  if(!probability(prob)){excluded.invalidProbability++;continue;}
  const key=JSON.stringify([league,book,p.quote.eventID,id,normalizeStat(p.stat),'game',p.side,p.line]),prior=chosen.get(key);
  if(!prior||frozen<prior.frozen)chosen.set(key,{p,league,book,id:String(id),frozen,path,prob,start,modelVersion:scope==='trade'?TRADE_VERSION:report.modelVersion||'Unrecorded legacy version'});
 }
 }
 const results=[];
 for(const row of chosen.values()){
  const {p,league,book,id,start}=row,values=[],diagnostics={matchedSeries:0,wrongPeriod:0,unverified:0};
  for(const record of outcomes.get(league+'|'+id)||[]){if(!sameStat(record.stat,p.stat))continue;diagnostics.matchedSeries++;
   for(const raw of record.games||[]){
    const g=normalizeSeasonGame(raw);
    if(String(g.date||'').slice(0,10)!==new Date(start).toISOString().slice(0,10))continue;
    if(g.periodID&&String(g.periodID).toLowerCase()!=='game'){diagnostics.wrongPeriod++;continue;}
    if(g.athleteID&&String(g.athleteID)!==id||g.seasonType!=='regular'||!Number.isFinite(g.value)||!/^https:\/\//.test(g.source||'')||!g.gameID){diagnostics.unverified++;continue;}
    values.push(g);
   }
  }
  const unique=[...new Map(values.map(g=>[g.gameID+'|'+g.value,g])).values()],valid=unique.length===1?unique[0]:null;
  const outcome=valid?(valid.value===p.line?'push':(p.side==='over'?valid.value>p.line:valid.value<p.line)?'win':'loss'):'unsettled';
  const rawPush=p.modelEvidence?.pPush,knownPush=rawPush==null?(Number.isInteger(p.line)?null:0):probability(rawPush)&&rawPush<1?rawPush:null;
  const massValid=knownPush!==null&&row.prob+knownPush<=1+1e-9,scoringProbability=massValid?Math.min(1,row.prob/(1-knownPush)):null;
  const shadow=archivedShadow(p,new Date(row.frozen).toISOString(),start),shadowProbability=shadow&&shadow.pPush<1?shadow.pWin/(1-shadow.pPush):null,truth=outcome==='win'?1:0,scorable=['win','loss'].includes(outcome);
  const quotedPriceProbability=validOdds(p.odds)?implied(p.odds):null;
  const settlementReason=valid?'Verified full-game outcome':unique.length>1?'Conflicting outcomes or multiple game IDs':!diagnostics.matchedSeries?'No matching full-game athlete/statistic series':diagnostics.wrongPeriod?'Only period-mismatched outcomes':diagnostics.unverified?'Matching date has unverified outcome data':'No sourced outcome for the scheduled UTC game date';
  const marketProbability=archivedMarketProbability(p,p.game,new Date(row.frozen).toISOString());
  const trial=scope==='trade'?p.tradeTrial:null;
  const tradeEvidence=trial?{currentOnly:trial.currentOnly,active:trial.active,roster:trial.roster,currentN:trial.currentN,oldN:trial.oldN,currentOnlyBrier:scorable?(trial.currentOnly-truth)**2:null,activeBrier:scorable&&trial.active!==null?(trial.active-truth)**2:null}:null;
  const context=p.pregameContext,contextAt=Date.parse(context?.capturedAt);
  const pregameContext=context?.version===1&&context.eventID===p.quote.eventID&&context.book===book&&context.quoteAsOf===p.asOf&&Number.isFinite(contextAt)&&contextAt>=Date.parse(p.asOf)&&contextAt<=row.frozen&&contextAt<start&&(!context.athleteID||context.athleteID===id)?context:null;
  results.push({researchCandidates:archivedCandidates(p,new Date(row.frozen).toISOString(),start,id),outcomeObservedAt:valid?.firstVerifiedAt||valid?.observedAt||null,pregameContext,tradeEvidence,marketProbability,marketType:p.alt??p.quote.alt?'Alternate':'Standard',marketBrier:scorable&&marketProbability!==null?(marketProbability-truth)**2:null,player:p.player,league,book,eventID:p.quote.eventID,athleteID:id,periodID:'game',modelVersion:row.modelVersion,line:p.line,side:p.side,stat:p.stat,odds:p.odds,label:p.label,probability:row.prob,frozenAt:new Date(row.frozen).toISOString(),archivePath:row.path,scoringProbability,scoreReason:!scorable?'Push or pending outcome':scoringProbability===null?'Missing or invalid saved push probability':null,quotedPriceProbability,quotedPriceBrier:scorable&&quotedPriceProbability!==null?(quotedPriceProbability-truth)**2:null,shadowProbability,shadowVersion:shadow?.version??null,shadowBrier:scorable&&probability(shadowProbability)?(shadowProbability-truth)**2:null,outcome,settlementReason,actual:valid?.value??null,gameID:valid?.gameID??null,source:valid?.source??null,brier:scorable&&scoringProbability!==null?(scoringProbability-truth)**2:null});
 }
 const captureDiagnostics=scope==='trade'?summarizeCaptures(reports,day):null;
 const settled=results.filter(r=>r.brier!==null),bins=Array.from({length:5},(_,i)=>{const a=settled.filter(r=>r.scoringProbability>=i/5&&(i===4?r.scoringProbability<=1:r.scoringProbability<(i+1)/5));return {from:i/5,to:(i+1)/5,n:a.length,predicted:a.length?a.reduce((s,r)=>s+r.scoringProbability,0)/a.length:null,observed:a.length?a.filter(r=>r.outcome==='win').length/a.length:null};});
 return {day,scope,captureDiagnostics,snapshots:reports.map(({report,savedAt})=>({savedAt,generatedAt:report.generatedAt||null,modelVersion:report.modelVersion||null,format:report.byBook?'book-specific':'legacy',leagues:Object.keys(report.leagues||report.byBook?.draftkings?.leagues||{})})),results,excluded,settled:results.filter(r=>r.outcome!=='unsettled').length,scored:settled.length,unsettled:results.filter(r=>r.outcome==='unsettled').length,brier:settled.length?settled.reduce((s,r)=>s+r.brier,0)/settled.length:null,bins,method:(scope==='trade'?'First retained NBA trade shadow capture per game and book from 60 to 45 minutes before tipoff. ':scope==='cohort'?'First retained evaluation forecast per exact selection from 60 to 45 minutes before start. ':'Earliest retained pregame forecast per exact shortlist/watchlist selection. ')+'Archived player props only; alternate lines and books are correlated. Outcomes require athlete identity, period, statistic, UTC game date, regular-season tag, game ID and HTTPS source. Pushes are reported separately. Binary Brier and calibration bins use the same known non-push conditional probabilities. Missing or invalid push masses cannot be scored. Quoted-price comparisons use the original odds including sportsbook margin, not a no-vig forecast. Shadow forecasts must have been saved before the game. No retraining or automatic model promotion.'};
}

function summarizeCaptures(reports,day){
 const groups=new Map();
 let instrumented=0;
 for(const {report,savedAt} of reports){
  if(!Array.isArray(report.tradeDiagnostics))continue;
  instrumented++;
  for(const d of report.tradeDiagnostics){
   const start=Date.parse(d.start),saved=Date.parse(savedAt);
   if(!Number.isFinite(start)||eastern(start)!==day)continue;
   const key=JSON.stringify([d.eventID,d.book]);
   if(!groups.has(key))groups.set(key,{game:d.game,start:d.start,book:d.book,checks:0,windowChecks:0,retainedWindowChecks:0,best:null});
   const g=groups.get(key);
   g.checks++;
   if(!d.insideWindow)continue;
   g.windowChecks++;
   const retained=saved>=start-60*60000&&saved<=start-45*60000;
   if(retained)g.retainedWindowChecks++;
   const priority=Number(retained)*2+Number(d.captured>0);
   if(!g.best||priority>g.best.priority||priority===g.best.priority&&d.examined>g.best.examined)g.best={...d,priority};
  }
 }
 return {instrumented,groups:[...groups.values()]};
}
