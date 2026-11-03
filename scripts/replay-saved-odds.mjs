// Reconstruct a dated saved board in isolation. Never writes to the frozen ledger.
import {readFileSync} from 'node:fs';
import {auditFrozen} from '../lib/frozen-audit.mjs';
import {auditFrozenGames} from '../lib/frozen-game-audit.mjs';
import {implied,nameKey,normalizeStat,quoteStatus,sampleSummary} from '../lib/insights.mjs';
import {forecast} from '../lib/prediction.mjs';
import {matchupForecast} from '../lib/matchup-model.mjs';
import {teamSelection} from '../lib/team-research.mjs';
import {belongsToGame,quoteProfile} from '../lib/rosters.mjs';
import {latestQuotes} from '../lib/quote-selection.mjs';
import {summarizeAudits} from '../lib/audit-summary.mjs';

const [boardFile,evidenceFile,rosterFile,teamFile,verifiedResultsFile]=process.argv.slice(2);
if(!teamFile) throw Error('Usage: node scripts/replay-saved-odds.mjs board.json evidence.json roster.json team-history.json [verified-audit-outcomes.json]');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const board=read(boardFile),records=read(evidenceFile),rosters=read(rosterFile),teamRows=read(teamFile).games;
const cutoff=new Date(board.generatedAt);
if(!Number.isFinite(cutoff.getTime())) throw Error('A dated board observation is required.');
const day=cutoff.toLocaleDateString('en-CA',{timeZone:'America/New_York'}),gameMap=new Map(board.games.map(g=>[g.eventID,g]));
const profiles=new Map(),conflictingProfiles=new Set();
for(const p of [...rosters,...records.map(r=>r.profile).filter(Boolean)]){
 const asOf=Date.parse(p.asOf),key=JSON.stringify([p.league,p.id]);
 if(!p.id||!Number.isFinite(asOf)||asOf>cutoff.getTime())continue;
 const old=profiles.get(key);
 if(!old||asOf>Date.parse(old.asOf)){profiles.set(key,p);conflictingProfiles.delete(key);}
 else if(asOf===Date.parse(old.asOf)&&String(old.currentTeamID)!==String(p.currentTeamID))conflictingProfiles.add(key);
}
const eligibleProfiles=[...profiles].filter(([key])=>!conflictingProfiles.has(key)).map(([,profile])=>profile);
const series=new Map();
for(const r of records){
 const id=r.athleteID||r.profile?.id;
 if(!id)continue;
 const key=JSON.stringify([r.league,String(id),normalizeStat(r.stat)]);
 if(!series.has(key))series.set(key,[]);
 series.get(key).push(r);
}
const byBook={},entries=[],coverage={eligibleProps:0,missingRosterIdentity:0,noPropForecast:0,eligibleGameLines:0,noGameForecast:0};
for(const q of latestQuotes(board.quotes)){
 const game=gameMap.get(q.eventID),asOf=Date.parse(q.asOf);
 if(!game||q.periodID!=='game'||q.alt!==false||!['draftkings','fanduel'].includes(q.book)||implied(q.odds)===null||!Number.isFinite(asOf)||asOf>cutoff.getTime()||!quoteStatus(q,game,cutoff).ok)continue;
 if(new Date(game.start).toLocaleDateString('en-CA',{timeZone:'America/New_York'})!==day)continue;
 if(q.kind==='Player Prop'){
  if(!q.player||!nameKey(q.player)||!Number.isFinite(q.line)||!['over','under'].includes(q.side))continue;
  coverage.eligibleProps++;
  const profile=quoteProfile(q,game,eligibleProfiles);
  if(!profile?.id||!belongsToGame(profile,game)||!Number.isFinite(Date.parse(profile.asOf))||Date.parse(profile.asOf)>cutoff.getTime()){
   coverage.missingRosterIdentity++;
   continue;
  }
  const history=(series.get(JSON.stringify([q.league,String(profile.id),normalizeStat(q.stat)]))||[]).map(r=>({...r,profile,games:(r.games||[]).filter(g=>g.date<q.asOf.slice(0,10))}));
  const sample=sampleSummary(q,history),model=sample&&forecast(q,sample,{now:cutoff,game,evaluate:false});
  if(model?.status!=='experimental'){coverage.noPropForecast++;continue;}
  const leagues=(byBook[q.book]??={leagues:{}}).leagues;
  (leagues[q.league]??={picks:[]}).picks.push({quote:q,game,athleteID:profile.id,player:q.player,stat:q.stat,side:q.side,line:q.line,odds:q.odds,asOf:q.asOf,label:'REPLAY',experimentalProbability:model.pWin,modelEvidence:{pPush:model.pPush}});
 }else{
  const selection=teamSelection(q,game);
  if(!selection)continue;
  coverage.eligibleGameLines++;
  const model=matchupForecast(q,game,teamRows,selection);
  if(model.status!=='experimental'){coverage.noGameForecast++;continue;}
  entries.push({quote:q,game,label:'REPLAY',probability:model.pWin,push:model.pPush});
 }
}
const wrap=report=>[{report,savedAt:board.generatedAt,path:'offline-reconstruction'}];
const settlementRecords=[...records];
if(verifiedResultsFile)for(const result of read(verifiedResultsFile)){
 const game=gameMap.get(result.eventID);
 if(!game||game.league!==result.league||!result.athleteID||!result.gameID||!Number.isFinite(result.actual)||!/^https:\/\//.test(result.source||''))continue;
 settlementRecords.push({league:result.league,athleteID:result.athleteID,stat:result.stat,periodID:'game',games:[{gameID:result.gameID,date:new Date(game.start).toISOString().slice(0,10),seasonType:'regular',value:result.actual,source:result.source}]});
}
const props=auditFrozen(wrap({byBook,modelVersion:'reconstructed-props'}),settlementRecords,{day});
const games=auditFrozenGames(wrap({entries,modelVersion:'reconstructed-game-lines'}),teamRows,{day});
const summarize=a=>({excluded:a.excluded,...summarizeAudits([a]).overall,byStatistic:summarizeAudits([a]).byStatistic.map(({group,selections,scored,brier,quotedPriceBrier})=>({group,selections,scored,brier,quotedPriceBrier}))});
console.log(JSON.stringify({day,observation:board.generatedAt,coverage,settlementSource:verifiedResultsFile?'Local results plus verified frozen-audit outcomes. Scored prop coverage inherits the audited shortlist selection bias.':'Local result files',props:summarize(props),games:summarize(games),method:'Offline reconstruction using saved standard odds, dated roster identity, and only prior game dates in model fitting. Excludes historical injuries and projections. Separate from frozen forecasts.'},null,2));
