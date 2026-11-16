import {verifiedFixtures} from './matchup-model.mjs';
import {teamSelection} from './team-research.mjs';
import {teamCode} from './rosters.mjs';
import {implied} from './insights.mjs';

const easternDate = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const eastern = time => easternDate.format(new Date(time));
const isoDay = time => new Date(time).toISOString().slice(0,10);

function teamPair(quote, game, savedAt) {
 const selection = teamSelection(quote, game);
 const observed = Date.parse(quote.observedAt);
 const priced = Date.parse(quote.asOf);
 if (!selection || !Number.isFinite(observed) || !Number.isFinite(priced) ||
     priced > observed || observed - priced > 75 * 60000 ||
     observed > Date.parse(savedAt) || observed >= Date.parse(game.start)) return null;
 const margin = quote.kind === 'Spread' || quote.kind === 'Moneyline';
 const side = margin ? quote.side : selection.side;
 const line = quote.kind === 'Spread' && side === 'away' ? Number(quote.line) : selection.threshold;
 const key = JSON.stringify([quote.league, quote.eventID, quote.book, quote.kind, quote.stat,
  margin ? null : selection.team, line, quote.observedAt]);
 return {key, side, opposite: ({home:'away',away:'home',over:'under',under:'over'})[side]};
}

export function createFrozenGameAudit({day, now=new Date()}) {
 const chosen = new Map();
 const excluded = {notPregame:0, invalidProbability:0, invalidSelection:0};
 function add({report,savedAt,path}) {
 const quotes = new Map();
 for (const {quote, game} of report.entries || []) {
  if (!quote || !game || quote.eventID !== game.eventID || quote.league !== game.league || quote.available !== true) continue;
  const pair = teamPair(quote, game, savedAt);
  if (!pair || implied(quote.odds) === null) continue;
  if (!quotes.has(pair.key)) quotes.set(pair.key, new Map());
  const sides = quotes.get(pair.key);
  if (!sides.has(pair.side)) sides.set(pair.side, new Set());
  sides.get(pair.side).add(quote.odds);
 }
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
  const pair = q.available === true && teamPair(q, game, savedAt);
  const sides = pair && quotes.get(pair.key);
  const same = sides && sides.get(pair.side), opposite = sides && sides.get(pair.opposite);
  const quoted = implied(q.odds);
  const counter = opposite?.size === 1 ? implied([...opposite][0]) : null;
  const marketProbability = same?.size === 1 && same.has(q.odds) && counter !== null ? quoted / (quoted + counter) : null;
  const previous=chosen.get(key);
  if(!previous||saved<previous.saved||saved===previous.saved&&path<previous.path){
   chosen.set(key,{entry:{quote:q,game,probability,push,label:entry.label},selection,marketProbability,saved,savedAt,path,modelVersion:report.modelVersion});
  }
 }
 }
 function finish(teamRows) {
 const fixtures = new Map();
 // Settlement can use a verified final from earlier on the current UTC date.
 const cutoff = isoDay(now.getTime()+86400000);
 for(const league of ['NBA','NFL']) for(const fixture of verifiedFixtures(teamRows,league,cutoff)){
  if(Date.parse(fixture.observedAt)>now.getTime())continue;
  const key=JSON.stringify([league,fixture.date,fixture.home,fixture.away]);
  if(!fixtures.has(key))fixtures.set(key,[]);
  fixtures.get(key).push(fixture);
 }
 const results=[];
 for(const {entry,selection,marketProbability,savedAt,path,modelVersion} of chosen.values()){
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
  results.push({outcomeObservedAt:fixture?.observedAt||null,selectionTeam:selection.team||null,eventID:q.eventID,player:game.game||game.away+' @ '+game.home,league:q.league,book:q.book,stat:q.kind,marketType:q.alt?'Alternate':'Standard',modelVersion,line:q.line,side:q.side,odds:q.odds,label:entry.label,probability,scoringProbability,quotedPriceProbability,marketProbability,marketBrier:scorable&&marketProbability!==null?(marketProbability-truth)**2:null,outcome,actual,frozenAt:savedAt,archivePath:path,source:fixture?.sources[0]??null,settlementReason:fixture?'Verified final team score':matches.length?'Conflicting final fixtures':'No exact dated home/away result',brier:scorable?(scoringProbability-truth)**2:null,quotedPriceBrier:scorable?(quotedPriceProbability-truth)**2:null});
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
