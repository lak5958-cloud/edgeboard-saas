import {verifiedFixtures} from './matchup-model.mjs';
import {teamSelection} from './team-research.mjs';
import {teamCode} from './rosters.mjs';
import {implied} from './insights.mjs';

const eastern = time => new Date(time).toLocaleDateString('en-CA', {timeZone:'America/New_York'});
const isoDay = time => new Date(time).toISOString().slice(0,10);

export function createFrozenGameAudit({day, now=new Date()}) {
 const chosen = new Map();
 const excluded = {notPregame:0, invalidProbability:0, invalidSelection:0};
 function add({report,savedAt,path}) {
 for(const entry of report.entries||[]) {
  const {quote:q, game} = entry;
  if(!q||!game||!Number.isFinite(Date.parse(game.start))||eastern(game.start)!==day) continue;
  const start=Date.parse(game.start), saved=Date.parse(savedAt), priced=Date.parse(q.asOf);
  if(!Number.isFinite(saved)||!Number.isFinite(priced)||priced>saved||saved>=start||saved>now.getTime()||start>now.getTime()){
   excluded.notPregame++;
   continue;
  }
  const selection=teamSelection(q,game);
  if(!selection||!['over','under'].includes(selection.side)||!q.eventID||q.eventID!==game.eventID||q.league!==game.league||implied(q.odds)===null){
   excluded.invalidSelection++;
   continue;
  }
  const {probability,push}=entry;
  if(!Number.isFinite(probability)||!Number.isFinite(push)||probability<0||push<0||push>=1||probability+push>1+1e-9){
   excluded.invalidProbability++;
   continue;
  }
  const key=JSON.stringify([q.league,q.book,q.eventID,q.kind,selection.team,selection.side,selection.threshold]);
  const previous=chosen.get(key);
  if(!previous||saved<previous.saved||saved===previous.saved&&path<previous.path){
   chosen.set(key,{entry:{quote:q,game,probability,push,label:entry.label},selection,saved,savedAt,path,modelVersion:report.modelVersion});
  }
 }
 }
 function finish(teamRows) {
 const fixtures = new Map();
 for(const league of ['NBA','NFL']) for(const fixture of verifiedFixtures(teamRows,league,isoDay(now))){
  const key=JSON.stringify([league,fixture.date,fixture.home,fixture.away]);
  if(!fixtures.has(key))fixtures.set(key,[]);
  fixtures.get(key).push(fixture);
 }
 const results=[];
 for(const {entry,selection,savedAt,path,modelVersion} of chosen.values()){
  const {quote:q,game,probability,push}=entry;
  const matches=fixtures.get(JSON.stringify([q.league,isoDay(game.start),teamCode(game.home,q.league),teamCode(game.away,q.league)]))||[];
  const fixture=matches.length===1?matches[0]:null;
  const selectedHome=fixture&&selection.team===fixture.home;
  let actual=null;
  if(fixture){
   if(q.kind==='Total') actual=fixture.h+fixture.a;
   else if(q.kind==='Team Total') actual=selectedHome?fixture.h:fixture.a;
   else actual=selectedHome?fixture.h-fixture.a:fixture.a-fixture.h;
  }
  const outcome=actual===null?'unsettled':actual===selection.threshold?'push':(selection.side==='over'?actual>selection.threshold:actual<selection.threshold)?'win':'loss';
  const scorable=outcome==='win'||outcome==='loss',truth=Number(outcome==='win');
  const scoringProbability=Math.min(1,probability/(1-push)),quotedPriceProbability=implied(q.odds);
  results.push({outcomeObservedAt:fixture?.observedAt||null,selectionTeam:selection.team||null,eventID:q.eventID,player:game.game||game.away+' @ '+game.home,league:q.league,book:q.book,stat:q.kind,marketType:q.alt?'Alternate':'Standard',modelVersion,line:q.line,side:q.side,odds:q.odds,label:entry.label,probability,scoringProbability,quotedPriceProbability,outcome,actual,frozenAt:savedAt,archivePath:path,source:fixture?.sources[0]??null,settlementReason:fixture?'Verified final team score':matches.length?'Conflicting final fixtures':'No exact dated home/away result',brier:scorable?(scoringProbability-truth)**2:null,quotedPriceBrier:scorable?(quotedPriceProbability-truth)**2:null});
 }
 const scored=results.filter(r=>r.brier!==null),unsettled=results.filter(r=>r.outcome==='unsettled').length;
 return {day,scope:'games',results,excluded,settled:results.length-unsettled,unsettled,scored:scored.length,brier:scored.length?scored.reduce((s,r)=>s+r.brier,0)/scored.length:null,method:'Separate game-market audit. Full-game scores are matched on UTC date, league and both teams with home/away orientation. Spread grades use the selected team margin. Pushes are excluded from Brier. Earliest retained pregame forecast per exact selection.'};
}
 return {add,finish};
}

export function auditFrozenGames(reports,teamRows,options) {
 const audit=createFrozenGameAudit(options);
 for(const report of reports)audit.add(report);
 return audit.finish(teamRows);
}
